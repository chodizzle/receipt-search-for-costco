"""Builds dist/receipt-search-for-costco-<version>.zip for the Chrome Web Store.

Usage: python tools/package.py
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
DIST = ROOT / "dist"
SKIP = {".DS_Store", "Thumbs.db"}

manifest = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))

# Catch the mistakes the store would otherwise reject the upload for.
problems = []
if len(manifest.get("description", "")) > 132:
    problems.append("description is over 132 characters")
for path in {*manifest.get("icons", {}).values(), *manifest["action"].get("default_icon", {}).values()}:
    if not (EXT / path).is_file():
        problems.append(f"missing icon {path}")
for cs in manifest.get("content_scripts", []):
    problems += [f"missing content script {js}" for js in cs["js"] if not (EXT / js).is_file()]
if not (EXT / manifest["background"]["service_worker"]).is_file():
    problems.append("missing service worker")
if problems:
    sys.exit("Not packaging:\n  " + "\n  ".join(problems))

DIST.mkdir(exist_ok=True)
out = DIST / f"receipt-search-for-costco-{manifest['version']}.zip"
files = sorted(p for p in EXT.rglob("*") if p.is_file() and p.name not in SKIP)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in files:
        z.write(p, p.relative_to(EXT).as_posix())  # manifest.json at the zip root, forward slashes

print(f"{out.relative_to(ROOT)}  ({out.stat().st_size / 1024:.1f} KB, {len(files)} files)")
for p in files:
    print("  " + p.relative_to(EXT).as_posix())
