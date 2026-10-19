#!/usr/bin/env python3
"""Copy pinned upstream source without running it; verify with --verify.

Clone the URLs in vendor/upstreams.json into .runtime/upstreams/<id> first.
This is an offline source import, not an installer or runtime adapter.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor"
CONFIG = VENDOR / "upstreams.json"
MANIFEST = VENDOR / "manifest.json"
EXCLUDED_DIRS = {".git", ".github", ".claude", ".codex", ".cursor", ".husky",
                 "node_modules", "__pycache__", ".venv", ".runtime", "dist", "build"}
EXCLUDED_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".icns", ".pdf",
    ".mp4", ".mov", ".mkv", ".mp3", ".wav", ".m4a", ".flac", ".ogg",
    ".ttf", ".woff", ".woff2", ".otf", ".exe", ".dll", ".dylib", ".so",
    ".zip", ".gz", ".xz", ".bz2", ".7z", ".zxp", ".ccx", ".pkg", ".dmg",
    ".pt", ".pth", ".onnx", ".safetensors", ".bin", ".pyc", ".pyo",
    ".p12", ".pfx", ".key", ".pem",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def exclusion(path, data):
    if any(part in EXCLUDED_DIRS for part in path.parts[:-1]):
        return "development metadata or build output"
    if path.name in {"AGENTS.md", "CLAUDE.md", ".DS_Store"}:
        return "agent instructions or local metadata"
    if path.name == ".gitattributes":
        return "upstream Git attributes; snapshot bytes must remain unchanged"
    if path.name == ".env" or (path.name.startswith(".env.") and
                               path.suffix not in {".example", ".sample", ".template"}):
        return "environment configuration"
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return "media, binary, model, archive or signing material"
    if b"\0" in data:
        return "binary content"
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return "non-UTF-8 content"
    return None


def import_sources():
    if MANIFEST.exists():
        raise SystemExit("Snapshot already exists. Verify it or import an update into a new directory.")
    config = json.loads(CONFIG.read_text())
    # Prepare and validate every archive before writing any snapshot.
    prepared = []
    for item in config["repositories"]:
        if item["status"] != "import":
            prepared.append((item, None))
            continue
        checkout = ROOT / ".runtime" / "upstreams" / item["id"]
        archive = subprocess.run(["git", "-C", str(checkout), "archive", item["commit"]],
                                 check=True, capture_output=True).stdout
        files, excluded = {}, {}
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            for member in tar:
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts:
                    raise ValueError("Unsafe archive path")
                if member.isdir():
                    continue
                if not member.isfile():
                    excluded[str(path)] = "link or non-regular file"
                    continue
                data = tar.extractfile(member).read()
                reason = exclusion(path, data)
                if reason:
                    excluded[str(path)] = reason
                else:
                    files[str(path)] = (data, bool(member.mode & 0o111))
        if "LICENSE" not in files:
            raise ValueError(f"Missing license for {item['id']}")
        prepared.append((item, (files, excluded)))
    result = {"schemaVersion": 1, "kind": "source snapshots, not connected modules",
              "repositories": []}
    for item, snapshot in prepared:
        entry = dict(item)
        if snapshot is not None:
            files, excluded = snapshot
            base = VENDOR / "sources" / item["id"]
            if base.exists():
                raise ValueError(f"Refusing to overwrite {base}")
            entry["directory"] = str(base.relative_to(ROOT))
            entry["files"] = {}
            for name, (data, executable) in sorted(files.items()):
                target = base / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                target.chmod(0o755 if executable else 0o644)
                entry["files"][name] = {"sha256": digest(data), "bytes": len(data),
                                         "executable": executable}
            entry["excluded"] = dict(sorted(excluded.items()))
            entry["sourceBytes"] = sum(len(data) for data, _ in files.values())
            print(f"{item['id']}: {len(files)} files, {entry['sourceBytes']} bytes, {len(excluded)} excluded")
        result["repositories"].append(entry)
    MANIFEST.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")


def verify():
    manifest = json.loads(MANIFEST.read_text())
    config = json.loads(CONFIG.read_text())
    if [{key: item[key] for key in source} for item, source in
        zip(manifest["repositories"], config["repositories"], strict=True)] != config["repositories"]:
        raise ValueError("Manifest no longer matches pinned upstream configuration")
    expected = set()
    for item in manifest["repositories"]:
        if item["status"] != "import":
            continue
        base = ROOT / item["directory"]
        for name, metadata in item["files"].items():
            target = base / name
            if target.is_symlink():
                raise ValueError(f"Unexpected link: {target}")
            data = target.read_bytes()
            if digest(data) != metadata["sha256"] or len(data) != metadata["bytes"]:
                raise ValueError(f"Source changed: {target}")
            expected.add(target)
    actual = {path for path in (VENDOR / "sources").rglob("*") if path.is_file() or path.is_symlink()}
    if actual != expected:
        raise ValueError("Unexpected or missing source files")
    print(f"Verified {len(expected)} unchanged source files; no extra files.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    verify() if args.verify else import_sources()
