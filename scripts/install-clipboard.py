#!/usr/bin/env python3
"""Build the local Mac helper; never reads the clipboard during installation."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
if sys.platform != 'darwin':
    raise SystemExit('Le collage natif est actuellement disponible sur Mac uniquement.')
binary = root / '.runtime/bin/nocturnz-clipboard'
cache = root / '.runtime/swift-module-cache'
binary.parent.mkdir(parents=True, exist_ok=True)
cache.mkdir(parents=True, exist_ok=True)
subprocess.run(['xcrun', 'swiftc', '-O', '-module-cache-path', str(cache),
    str(root / 'service/clipboard_image.swift'), '-o', str(binary)], check=True)
print('Collage d’images installé. Aucun contenu du presse-papiers n’a été lu.')
