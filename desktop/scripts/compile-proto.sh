#!/usr/bin/env bash
# Compile messages.proto → Swift generated code + TypeScript types
# Run from desktop/ directory: ./scripts/compile-proto.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
PROTO_DIR="$ROOT_DIR/native/Proto"
SWIFT_OUT="$ROOT_DIR/native/Sources/NativeHelper"
TS_OUT="$ROOT_DIR/src/main/generated"

echo "── Compiling protobuf schema ──"

# Check for protoc
if ! command -v protoc &>/dev/null; then
  echo "Error: protoc not found. Install with: brew install protobuf"
  exit 1
fi

# Check for Swift protobuf plugin
if ! command -v protoc-gen-swift &>/dev/null; then
  echo "Warning: protoc-gen-swift not found. Install with: brew install swift-protobuf"
  echo "Skipping Swift codegen."
else
  # Swift codegen
  mkdir -p "$SWIFT_OUT"
  protoc \
    --swift_out="$SWIFT_OUT" \
    --proto_path="$PROTO_DIR" \
    "$PROTO_DIR/messages.proto"
  echo "Generated: $SWIFT_OUT/messages.pb.swift"
fi

# TypeScript types are hand-maintained using protobufjs runtime
# (see src/main/generated/messages.ts)
echo "TypeScript types: $TS_OUT/messages.ts (hand-maintained, uses protobufjs runtime)"

echo "── Done ──"
