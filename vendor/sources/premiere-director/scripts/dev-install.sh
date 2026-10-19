#!/usr/bin/env bash
# Dev-install: enable PlayerDebugMode for CSXS 12 and symlink dist/ into user CEP extensions.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
LINK="$EXT_DIR/premiere-director"
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
mkdir -p "$EXT_DIR"
rm -f "$LINK"
ln -s "$REPO_DIR/dist" "$LINK"
echo "Linked $LINK -> $REPO_DIR/dist"
echo "Restart Premiere Pro, then open Window > Extensions > Premiere Director."
