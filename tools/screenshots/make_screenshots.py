"""Renders the Chrome Web Store screenshots (1280x800) into store/ using headless Chrome.

Usage: python tools/screenshots/make_screenshots.py
Uses the real extension/search.* with demo data from demo.js (no Costco account needed).
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SHOTS = {
    "screenshot-1-search.png": "q=paper%20towel&view=lines",
    "screenshot-2-grouped.png": "q=ks&view=grouped",
    "screenshot-3-receipt.png": "q=salmon&view=lines&open=0",
}
CHROME_PATHS = [
    os.environ.get("CHROME", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
]
chrome = next((p for p in CHROME_PATHS if p and Path(p).exists()), None) or sys.exit("Chrome not found; set CHROME=path")

with tempfile.TemporaryDirectory() as tmp:
    site = Path(tmp)
    for f in ("search.html", "search.css", "search.js"):
        shutil.copy(ROOT / "extension" / f, site / f)
    shutil.copy(HERE / "demo.js", site / "demo.js")
    html = (site / "search.html").read_text(encoding="utf-8")
    (site / "search.html").write_text(html.replace('<script src="search.js">', '<script src="demo.js"></script><script src="search.js">'), encoding="utf-8")

    for name, hash_ in SHOTS.items():
        out = ROOT / "store" / name
        subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb",
                        "--window-size=1280,800", "--virtual-time-budget=4000", f"--user-data-dir={site / 'profile'}",
                        f"--screenshot={out}", (site / "search.html").as_uri() + "#" + hash_],
                       check=True, capture_output=True)
        print("wrote", out.relative_to(ROOT))
