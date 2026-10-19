#!/bin/bash
# OpenPodCut — macOS installer
# Copies the extension to Premiere Pro's CEP extensions folder.
# Run once after downloading the release zip.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/../cep-extension"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/podcast-cutter"

if [ ! -f "$SRC/bin/analyzer/analyzer" ]; then
    echo "ERROR: analyzer binary not found at:"
    echo "  $SRC/bin/analyzer/analyzer"
    echo ""
    echo "Make sure you downloaded the macOS release zip (not the Windows one)."
    exit 1
fi

echo "Installing OpenPodCut to:"
echo "  $DEST"
echo ""

rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$SRC/"* "$DEST/"
chmod +x "$DEST/bin/analyzer/analyzer"

# macOS Gatekeeper stamps every file from a downloaded zip with a "quarantine"
# flag and refuses to launch the unsigned analyzer (and its many nested
# .dylibs) — showing "not verified" even after you click Allow. Strip the flag
# from the whole extension so Premiere can run the analyzer. Ad-hoc re-sign the
# binary as a belt-and-suspenders on stricter macOS versions.
echo "Clearing macOS quarantine flag…"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
codesign --force --deep --sign - "$DEST/bin/analyzer/analyzer" 2>/dev/null || true

echo "Done!"
echo "If the panel doesn't appear, run enable_debug_mode.sh first, then restart Premiere."
echo "In Premiere: Window > Extensions > OpenPodCut"
