#!/usr/bin/env python3
"""Project-local dependencies/models; no system Python or Premiere modification."""
import argparse
import ast
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime'
VENV = RUNTIME / 'modules-venv'
PYTHON = VENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')


def call(args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def checkout(name, url, commit):
    source = RUNTIME / (name + '-source')
    if not source.exists():
        call(['git', 'init', source])
        call(['git', '-C', source, 'remote', 'add', 'origin', url])
        call(['git', '-C', source, 'fetch', '--depth', '1', 'origin', commit])
        call(['git', '-C', source, 'checkout', '--detach', 'FETCH_HEAD'])
    actual = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != commit:
        raise RuntimeError(f'Commit inattendu pour {name}; dossier conservé sans modification.')
    return source


def media_tools():
    destination = RUNTIME / 'toolchain'
    if (destination / 'bin/ffmpeg').is_file() and (destination / 'bin/ffprobe').is_file():
        return
    if platform.system() != 'Darwin':
        print('Utilisation de FFmpeg/FFprobe du PATH; compatibilité à contrôler sur cette plateforme.')
        return
    call([PYTHON, '-m', 'pip', 'install', 'meson==1.12.1', 'ninja==1.13.2'])
    env = dict(os.environ, PATH=str(VENV / 'bin') + os.pathsep + os.environ.get('PATH', ''),
        PKG_CONFIG_PATH=str(destination / 'lib/pkgconfig'))
    pkgconf = checkout('pkgconf', 'https://github.com/pkgconf/pkgconf.git', '4b6fcd4e5baf03d5cb4797e46976cb69756ad865')
    build = RUNTIME / 'pkgconf-build'
    if not (build / 'build.ninja').exists():
        call([VENV / 'bin/meson', 'setup', build, pkgconf, '--prefix=' + str(destination)], env=env)
    call([VENV / 'bin/ninja', '-C', build, 'install'], env=env)
    x264 = checkout('x264', 'https://code.videolan.org/videolan/x264.git', '0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee')
    call([x264 / 'configure', '--prefix=' + str(destination), '--enable-static', '--disable-cli', '--enable-pic', '--disable-asm'], cwd=x264, env=env)
    call(['make', '-j6'], cwd=x264, env=env)
    call(['make', 'install'], cwd=x264, env=env)
    source = checkout('ffmpeg', 'https://github.com/FFmpeg/FFmpeg.git', '9badbee44dab9530a02ed0201ce9b8e16a929a6e')
    date = subprocess.check_output(['git', '-C', str(source), 'show', '-s', '--format=%cs', 'HEAD'], text=True).strip()
    call([source / 'configure', '--prefix=' + str(destination), '--pkg-config=' + str(destination / 'bin/pkgconf'),
        '--enable-gpl', '--enable-libx264', '--enable-zlib', '--disable-autodetect', '--disable-doc', '--disable-debug', '--disable-asm',
        '--enable-videotoolbox', '--enable-audiotoolbox', '--extra-version=' + date + '-g9badbee44dab',
        '--extra-cflags=-I' + str(destination / 'include'), '--extra-ldflags=-L' + str(destination / 'lib')], cwd=source, env=env)
    call(['make', '-j6'], cwd=source, env=env)
    call(['make', 'install'], cwd=source, env=env)
    (RUNTIME / 'media-build.json').write_text(json.dumps({'ffmpeg': '9badbee44dab9530a02ed0201ce9b8e16a929a6e',
        'x264': '0480cb05fa188d37ae87e8f4fd8f1aea3711f7ee', 'date': date, 'license': 'GPL-2.0-or-later'}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', action='append', choices=['tiny', 'base', 'small'])
    parser.add_argument('--catalog-only', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    from service.module_catalog import MODULES
    (ROOT / 'plugin/module-catalog.js').write_text('/* Generated from service/module_catalog.py. */\nwindow.NocturnzModules = '
        + json.dumps([dict(id=key, **value) for key, value in MODULES.items()], ensure_ascii=False, indent=2) + ';\n')
    if args.catalog_only:
        return
    if not PYTHON.exists():
        venv.EnvBuilder(with_pip=True).create(VENV)
    call([PYTHON, '-m', 'pip', 'install', '-r', ROOT / 'requirements-modules.txt'])
    media_tools()
    # Keep installer downloads separate from the local-only worker process.
    tree = ast.parse((ROOT / 'vendor/sources/opencut/opencut/core/asr_provenance.py').read_text())
    models = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == 'FASTER_WHISPER_MODELS' for target in node.targets))
    for name in args.model or ['tiny', 'base', 'small']:
        repo, revision = models[name]
        script = 'from huggingface_hub import snapshot_download; snapshot_download(**' + repr(dict(repo_id=repo,
            revision=revision, local_dir=str(RUNTIME / 'models' / name), allow_patterns=['*.json', '*.bin', '*.txt', 'README.md', 'LICENSE*'])) + ')'
        call([PYTHON, '-c', script], env=dict(os.environ, HF_HOME=str(RUNTIME / 'huggingface')))
    call([PYTHON, ROOT / 'service/module_worker.py', '--diagnostics'])
    print('Modules installés. Lance npm run service puis recharge le panneau UXP.')


if __name__ == '__main__':
    main()
