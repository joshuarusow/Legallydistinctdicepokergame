#!/usr/bin/env python3
"""Verify the JS QR encoder by rendering its matrices and decoding with zxing-cpp.

Usage: python3 tests/qr_verify.py
Requires: node, pip install zxing-cpp pillow
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image
import zxingcpp

ROOT = Path(__file__).resolve().parent.parent

SAMPLES = [
    "A",
    "hello world",
    "https://example.com/yahtzee",
    "https://joshuarusow.github.io/Legallydistinctdicepokergame/",
    "https://joshuarusow.github.io/Legallydistinctdicepokergame/?player=Alice&game=xyz123",
    "x" * 100,
    "x" * 120,
    "x" * 160,
    "x" * 200,
    "unicode test: dés à jouer 🎲🎲🎲",
]

NODE_SNIPPET = """
const QR = require(process.env.QR_PATH);
const samples = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify(samples.map(s => QR.encode(s))));
"""


def main():
    proc = subprocess.run(
        ["node", "-e", NODE_SNIPPET],
        input=json.dumps(SAMPLES),
        capture_output=True,
        text=True,
        env={**__import__("os").environ, "QR_PATH": str(ROOT / "js" / "qr.js")},
    )
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        sys.exit(1)
    matrices = json.loads(proc.stdout)

    failures = 0
    for text, matrix in zip(SAMPLES, matrices):
        size = len(matrix)
        scale, quiet = 8, 4
        dim = (size + 2 * quiet) * scale
        img = Image.new("L", (dim, dim), 255)
        px = img.load()
        for r in range(size):
            for c in range(size):
                if matrix[r][c]:
                    for dr in range(scale):
                        for dc in range(scale):
                            px[(c + quiet) * scale + dc, (r + quiet) * scale + dr] = 0
        result = zxingcpp.read_barcode(img)
        ok = result is not None and result.text == text
        status = "ok" if ok else "FAIL"
        decoded = result.text[:60] if result else None
        print(f"[{status}] v-size={size} {text[:60]!r} -> {decoded!r}")
        if not ok:
            failures += 1

    if failures:
        print(f"{failures} QR sample(s) failed to round-trip", file=sys.stderr)
        sys.exit(1)
    print(f"All {len(SAMPLES)} QR samples decoded correctly")


if __name__ == "__main__":
    main()
