#!/bin/bash

# Directory containing the extension source code
EXTENSION_DIR="chrome-extension"
# Output zip file name
OUTPUT_FILE="extension.zip"

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
