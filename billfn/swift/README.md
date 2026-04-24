# BillFn Swift

`BillFnSwift` provides the native Apple surfaces for BillFn:

- `BillFnClient` for direct HTTP-backed lifecycle calls
- `BillFnStoreKit` for Apple-managed subscription actions and StoreKit-oriented helpers
- `BillFnWebViewBridgeHost` for embedded web apps that need native-backed billing ownership

## Test

```bash
swift test --package-path billfn/swift
```
