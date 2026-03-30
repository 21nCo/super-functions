import SearchFnAdapterContracts

public enum SearchFnDiagnostics {
    public static let initialize = "client.initialize"
    public static let index = "client.index"
    public static let search = "client.search"
    public static let searchAll = "client.searchAll"
    public static let searchAllFallback = "client.searchAll.fallback"
    public static let remove = "client.remove"
    public static let clear = "client.clear"
    public static let dispose = "client.dispose"
}

internal enum SearchFnDiagnosticsEmitter {
    static func emit(
        _ sink: SearchFnDiagnosticsSink?,
        name: String,
        adapterName: String? = nil,
        attributes: [String: String] = [:]
    ) {
        sink?(SearchFnDiagnosticsEvent(name: name, adapterName: adapterName, attributes: attributes))
    }
}
