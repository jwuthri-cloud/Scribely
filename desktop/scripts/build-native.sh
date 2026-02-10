#!/usr/bin/env bash
# Build the NativeHelper Swift binary and copy it to Electron resources.
# Run from desktop/ directory: ./scripts/build-native.sh [--debug]
#
# Prerequisites:
#   - Xcode command line tools (xcode-select --install)
#   - swift-protobuf plugin (brew install swift-protobuf)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
NATIVE_DIR="$ROOT_DIR/native"
RESOURCES_DIR="$ROOT_DIR/resources/native"

# Parse args
BUILD_CONFIG="release"
if [[ "${1:-}" == "--debug" ]]; then
  BUILD_CONFIG="debug"
fi

echo "── Building NativeHelper (${BUILD_CONFIG}) ──"

# 1. Compile protobuf if needed
if [[ ! -f "$NATIVE_DIR/Sources/NativeHelper/messages.pb.swift" ]]; then
  echo "Protobuf not compiled yet — running compile-proto.sh first"
  "$SCRIPT_DIR/compile-proto.sh"
fi

# 2. Build Swift package
cd "$NATIVE_DIR"
swift build -c "$BUILD_CONFIG"

BINARY_PATH="$NATIVE_DIR/.build/${BUILD_CONFIG}/NativeHelper"

if [[ ! -f "$BINARY_PATH" ]]; then
  echo "Error: Build succeeded but binary not found at $BINARY_PATH"
  exit 1
fi

echo "Binary built: $BINARY_PATH"

# 3. Copy binary to Electron resources for packaging
mkdir -p "$RESOURCES_DIR"
cp "$BINARY_PATH" "$RESOURCES_DIR/NativeHelper"
chmod +x "$RESOURCES_DIR/NativeHelper"

echo "Copied to: $RESOURCES_DIR/NativeHelper"

# 4. Show binary info
BINARY_SIZE=$(du -h "$RESOURCES_DIR/NativeHelper" | cut -f1)
echo "Binary size: $BINARY_SIZE"

# 5. Verify architecture
ARCH=$(file "$RESOURCES_DIR/NativeHelper" | grep -o 'arm64\|x86_64' | head -1)
echo "Architecture: ${ARCH:-unknown}"

echo "── NativeHelper build complete ──"
