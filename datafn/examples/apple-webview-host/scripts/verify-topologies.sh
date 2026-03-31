#!/usr/bin/env bash
set -euo pipefail

npm --prefix datafn/swift-bridge test
npm --prefix datafn/client test
swift test --package-path datafn/swift
DESTINATION="${DATAFN_IOS_DESTINATION:-platform=iOS Simulator,name=iPhone 16}"
xcodebuild -project datafn/examples/apple-webview-host/DatafnAppleHost.xcodeproj -scheme DatafnAppleHost -destination "$DESTINATION" test
