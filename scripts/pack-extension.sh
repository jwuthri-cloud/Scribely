#!/bin/bash

# Run from repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Directory containing the extension source code
EXTENSION_DIR="chrome-extension"

# Sync version from desktop/package.json to chrome-extension/manifest.json
DESKTOP_VERSION=$(node -p "require('./desktop/package.json').version")
OUTPUT_FILE="extension_${DESKTOP_VERSION}.zip"
echo "Syncing version $DESKTOP_VERSION from desktop to extension manifest..."
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$EXTENSION_DIR/manifest.json', 'utf8'));
manifest.version = '$DESKTOP_VERSION';
fs.writeFileSync('$EXTENSION_DIR/manifest.json', JSON.stringify(manifest, null, 2));
"

# Check if the directory exists
if [ ! -d "$EXTENSION_DIR" ]; then
  echo "Error: Directory $EXTENSION_DIR not found!"
  exit 1
fi

# Remove previous zip file if it exists
if [ -f "$OUTPUT_FILE" ]; then
  rm "$OUTPUT_FILE"
fi

echo "Packing extension from $EXTENSION_DIR..."

# Create the zip file, excluding unwanted files
# -r: recursive
# -j: junk paths (do not include directory structure of the files added, 
#     but we WANT the structure relative to the extension dir, so actually we cd into it)

cd "$EXTENSION_DIR"
zip -r "../$OUTPUT_FILE" . -x "*.git*" -x "*.DS_Store" -x "*.vscode*"

cd ..

if [ -f "$OUTPUT_FILE" ]; then
  echo "Success! Extension packed to $OUTPUT_FILE"
else
  echo "Error: Failed to create zip file."
  exit 1
fi
