import DatafnAppleRuntime
import DatafnWebViewBridgeHost
import SwiftUI

@MainActor
final class DatafnExampleHostSession: ObservableObject {
    @Published var topology: DatafnExampleTopology = .browserOwned
    @Published var embeddedAppURLString = "http://127.0.0.1:4173"
    @Published var datafnServerBaseURLString = "http://127.0.0.1:3001/datafn"
    @Published var datafnServerWebSocketURLString = "ws://127.0.0.1:3001/datafn/ws"
    @Published var cloudKitContainerIdentifier = DatafnExampleSchema.cloudKitContainerIdentifier
    @Published private(set) var statusMessage = DatafnExampleTopology.browserOwned.summary
    @Published private(set) var bootstrapScript = "window.__DATAFN_EXAMPLE_TOPOLOGY__ = undefined;"
    @Published private(set) var bridgeHost: DatafnWKWebViewBridgeHost?
    @Published private(set) var webViewReloadToken = UUID()

    private var runtime: DatafnAppleRuntime?
    private var activationTask: Task<Void, Never>?

    var activeWebAppURL: URL? {
        sanitizedURL(from: embeddedAppURLString)
    }

    func requestActivation(topology: DatafnExampleTopology) {
        activationTask?.cancel()
        activationTask = Task { [weak self] in
            await self?.activate(topology: topology)
        }
    }

    func activate(topology: DatafnExampleTopology) async {
        guard !Task.isCancelled else { return }
        self.topology = topology

        if let runtime {
            await runtime.stop()
        }

        runtime = nil
        bridgeHost = nil

        let options = currentOptions()
        do {
            bootstrapScript = try DatafnExampleBridgeBootstrapScript.make(
                topology: topology,
                options: options
            )
        } catch {
            bootstrapScript = "window.__DATAFN_EXAMPLE_TOPOLOGY__ = undefined;"
            statusMessage = "Failed to render topology bootstrap: \(error.localizedDescription)"
            webViewReloadToken = UUID()
            return
        }
        guard !Task.isCancelled else { return }

        guard let configuration = DatafnExampleRuntimeFactory.makeConfiguration(
            topology: topology,
            options: options
        ) else {
            statusMessage = topology.summary
            webViewReloadToken = UUID()
            return
        }

        do {
            let runtime = try await DatafnAppleRuntime(configuration: configuration)
            try await runtime.start()
            guard !Task.isCancelled else {
                await runtime.stop()
                return
            }
            let bridgeHost = await runtime.makeBridgeHost(handlerName: "datafn")
            guard !Task.isCancelled else {
                await runtime.stop()
                return
            }
            self.runtime = runtime
            self.bridgeHost = bridgeHost
            statusMessage = "\(topology.displayName) is active. Swift owns storage and sync."
            webViewReloadToken = UUID()
        } catch {
            statusMessage = "Failed to start \(topology.displayName): \(error.localizedDescription)"
            webViewReloadToken = UUID()
        }
    }

    private func currentOptions() -> DatafnExampleHostOptions {
        DatafnExampleHostOptions(
            schemaHash: DatafnExampleSchema.schemaHash,
            namespace: DatafnExampleSchema.namespace,
            clientID: DatafnExampleSchema.clientID,
            storeRootURL: FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first?.appendingPathComponent("DatafnAppleHost", isDirectory: true)
                ?? FileManager.default.temporaryDirectory.appendingPathComponent(
                    "DatafnAppleHost",
                    isDirectory: true
                ),
            webAppURL: sanitizedURL(from: embeddedAppURLString),
            datafnServerBaseURL: sanitizedURL(from: datafnServerBaseURLString)
                ?? URL(string: "http://127.0.0.1:3001/datafn")!,
            datafnServerWebSocketURL: sanitizedURL(from: datafnServerWebSocketURLString)
                ?? URL(string: "ws://127.0.0.1:3001/datafn/ws")!,
            cloudKitContainerIdentifier: cloudKitContainerIdentifier.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty
                ? DatafnExampleSchema.cloudKitContainerIdentifier
                : cloudKitContainerIdentifier
        )
    }

    private func sanitizedURL(from string: String) -> URL? {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }
        return URL(string: trimmed)
    }
}

struct ContentView: View {
    @StateObject private var session = DatafnExampleHostSession()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("DataFn Apple WebView Host")
                        .font(.title.bold())
                    Text("One web app, three topologies: browser-owned, native-backed DataFn-server, and native-backed CloudKit.")
                        .foregroundStyle(.secondary)
                }

                Picker("Topology", selection: $session.topology) {
                    ForEach(DatafnExampleTopology.allCases) { topology in
                        Text(topology.displayName).tag(topology)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: session.topology) { newValue in
                    session.requestActivation(topology: newValue)
                }

                Group {
                    TextField("Embedded web app URL", text: $session.embeddedAppURLString)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    if session.topology == .nativeDatafnServer {
                        TextField("DataFn server base URL", text: $session.datafnServerBaseURLString)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("DataFn server WebSocket URL", text: $session.datafnServerWebSocketURLString)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }

                    if session.topology == .nativeICloud {
                        TextField("CloudKit container identifier", text: $session.cloudKitContainerIdentifier)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                }
                .textFieldStyle(.roundedBorder)

                Button("Reload Embedded App") {
                    session.requestActivation(topology: session.topology)
                }
                .buttonStyle(.borderedProminent)

                VStack(alignment: .leading, spacing: 8) {
                    SummaryRow(label: "Storage", value: session.topology.storageBackend)
                    SummaryRow(label: "Search", value: session.topology.searchBackend)
                    SummaryRow(label: "Sync owner", value: session.topology.syncOwner)
                    SummaryRow(label: "Remote mode", value: session.topology.remoteMode ?? "none")
                    SummaryRow(
                        label: "IndexedDB fallback",
                        value: session.topology.indexedDbDisabled ? "disabled" : "allowed"
                    )
                    Text(session.statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                EmbeddedWebView(
                    url: session.activeWebAppURL,
                    bootstrapScript: session.bootstrapScript,
                    bridgeHost: session.bridgeHost
                )
                .id(session.webViewReloadToken)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .strokeBorder(Color.secondary.opacity(0.2))
                )
            }
            .padding()
            .task {
                session.requestActivation(topology: session.topology)
            }
        }
    }
}

private struct SummaryRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .fontWeight(.semibold)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
        .font(.subheadline)
    }
}
