import DatafnAppleRuntime
import DatafnSearchContracts
import Foundation

enum DatafnExampleRuntimeFactory {
    static func makeConfiguration(
        topology: DatafnExampleTopology,
        options: DatafnExampleHostOptions
    ) -> DatafnAppleRuntimeConfiguration? {
        guard let plan = topology.makeRuntimePlan(options: options) else {
            return nil
        }

        let syncBackend: DatafnSyncBackendConfiguration
        switch topology {
        case .browserOwned:
            return nil
        case .nativeDatafnServer:
            syncBackend = .datafnServer(
                DatafnServerSyncConfiguration(
                    baseURL: plan.datafnServerBaseURL ?? URL(string: "http://127.0.0.1:3001/datafn")!,
                    websocketURL: plan.datafnServerWebSocketURL,
                    profileID: plan.remoteProfile ?? "default"
                )
            )
        case .nativeICloud:
            syncBackend = .iCloud(
                DatafnCloudKitConfiguration(
                    containerIdentifier: plan.cloudKitContainerIdentifier
                        ?? DatafnExampleSchema.cloudKitContainerIdentifier
                )
            )
        }

        return DatafnAppleRuntimeConfiguration(
            schemaJSON: DatafnExampleSchema.json,
            schemaHash: plan.schemaHash,
            namespace: plan.namespace,
            clientID: plan.clientID,
            storeRootURL: plan.storeRootURL,
            search: DatafnSearchBackendConfiguration(),
            syncBackend: syncBackend
        )
    }
}
