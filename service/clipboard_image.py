"""On-demand native clipboard image capture. Files persist across service restarts."""
import json
from pathlib import Path
import subprocess
import sys
from threading import Lock
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
CAPTURE_LOCK = Lock()


def paste_image():
    if sys.platform != 'darwin':
        raise ValueError('Le collage direct est disponible sur Mac. Utilise Choisir une image sur ce système.')
    helper = ROOT / '.runtime/bin/nocturnz-clipboard'
    if not helper.is_file():
        raise ValueError('Installe le collage : npm run setup:clipboard.')
    if not CAPTURE_LOCK.acquire(blocking=False):
        raise ValueError('Un collage est déjà en cours.')
    destination = ROOT / '.runtime/clipboard' / f'Nocturnz_Image_{uuid4().hex}.png'
    try:
        destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        result = subprocess.run([str(helper), str(destination)], capture_output=True, text=True, timeout=15)
        if result.returncode:
            raise ValueError(result.stderr[:500] or 'Le presse-papiers ne contient pas d’image compatible.')
        metadata = json.loads(result.stdout)
        if not destination.is_file() or destination.stat().st_size > 64 * 1024 * 1024:
            raise ValueError('Fichier image invalide.')
        return dict(path=str(destination), name=destination.name, **metadata)
    except subprocess.TimeoutExpired as error:
        destination.unlink(missing_ok=True)
        raise RuntimeError('Le collage a dépassé le délai. Réessaie avec une image plus petite.') from error
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        CAPTURE_LOCK.release()
