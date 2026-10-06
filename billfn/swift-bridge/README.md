# BillFn Swift Bridge

`@billfn/swift-bridge` is the JavaScript bridge package for native-backed `WKWebView` shells.

It implements the `billfn-bridge/v1` protocol and exposes:

- a typed request and event protocol
- a `WKWebView` message bus
- a native-backed BillFn client wrapper

## Build and test

```bash
npm install
npm run build
npm test
npm pack
```

Run these commands from this package directory. The build typechecks the browser bridge
and emits JavaScript and declarations to `dist`; package exports reference only those
artifacts. Packing runs the same build gate, without downloading ad-hoc compilers.
