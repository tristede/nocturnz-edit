#!/usr/bin/env python3
"""Install upstream's pinned binary locally, with its official release SHA-256."""
import hashlib
from pathlib import Path
import platform
import shutil
import subprocess
import urllib.request

VERSION = '29.3.1'
ASSETS = {
    ('Darwin', 'arm64'): ('auto-editor-macos-arm64', '50e7a86f7566389313a07f991dcb7a8c4d1a4dbae7d37bc00f17f59d969877d1'),
    ('Darwin', 'x86_64'): ('auto-editor-macos-x86_64', 'fa473c4d1b709d2f3d5349e31029d8cdf1a82545a8e640c89b30501455551d61'),
    ('Linux', 'x86_64'): ('auto-editor-linux-x86_64', '5327d2bc43ae6e81b16d747243d90603fcf1d75dfb60db00ffff250c8bdb292a'),
    ('Windows', 'AMD64'): ('auto-editor-windows-amd64.exe', 'ba8eecd647355359436b7088d61ffa7a9ea07a88dc121b999cc337b882400c05'),
}


def main():
    asset = ASSETS.get((platform.system(), platform.machine()))
    if asset is None:
        raise SystemExit('Plateforme non couverte par les binaires vérifiés de cette version.')
    name, expected = asset
    directory = Path(__file__).resolve().parents[1] / '.runtime' / 'bin'
    directory.mkdir(parents=True, exist_ok=True)
    output = directory / ('auto-editor.exe' if platform.system() == 'Windows' else 'auto-editor')
    if output.is_file() and hashlib.sha256(output.read_bytes()).hexdigest() == expected:
        print(f'auto-editor {VERSION} déjà installé et vérifié.')
        return
    temporary = directory / (output.name + '.download')
    url = f'https://github.com/WyattBlue/auto-editor/releases/download/{VERSION}/{name}'
    try:
        if shutil.which('curl'):
            subprocess.run(['curl', '--fail', '--location', '--proto', '=https', '--tlsv1.2', url, '--output', str(temporary)], check=True)
        else:
            with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as target:
                shutil.copyfileobj(response, target)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Empreinte SHA-256 incorrecte : installation refusée.')
        temporary.chmod(0o755)
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'auto-editor {VERSION} installé : {output}')


if __name__ == '__main__':
    main()
