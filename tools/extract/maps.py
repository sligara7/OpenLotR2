#!/usr/bin/env python3
"""
Extract map layers from Lords of the Realm II `L2_MAPS.DAT`.

Layout (per doc/technical/file-types/L2_maps.dat.rst, confirmed by file size):

    40 map slots * 32961 bytes each  (only ~24 are actually used)
    each slot = six 64x64 byte layers (4096 B each) + one 65x129 byte layer (8385 B)
    6*4096 + 8385 = 32961;  32961 * 40 = 1318440 == file size.

The six 64x64 layers are the per-tile maps for a county map (terrain, region,
features, ...); the 65x129 layer is the larger overview/region bitmap.

PURPOSE: read the original game data for REFERENCE and ANALYSIS — to understand
county geography/adjacency/scale so we can author our OWN, original maps. It is
a parser/analysis tool, not a redistribution of the original artwork. Keep its
output (extracted originals) OUT of the public repo; commit only this tool.

Usage:
    python3 tools/extract/maps.py <path/to/L2_MAPS.DAT> [out_dir]

Outputs (default out_dir: ./extracted/maps, which is gitignored):
    manifest.json            summary of all 40 slots (used flag, value histograms)
    map_<NN>/map.json        raw tile-id grids for each used slot
    map_<NN>/layer<i>.pgm    grayscale previews (no image library required)
    map_<NN>/overview.pgm
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter

WIDTH = HEIGHT = 64
LAYER_BYTES = WIDTH * HEIGHT          # 4096
NUM_LAYERS = 6
BIG_W, BIG_H = 65, 129
BIG_BYTES = BIG_W * BIG_H             # 8385
SLOT_BYTES = NUM_LAYERS * LAYER_BYTES + BIG_BYTES   # 32961
NUM_SLOTS = 40
EXPECTED_SIZE = SLOT_BYTES * NUM_SLOTS              # 1318440


def to_grid(buf: bytes, w: int, h: int) -> list[list[int]]:
    return [list(buf[r * w:(r + 1) * w]) for r in range(h)]


def histogram(grid: list[list[int]]) -> dict[int, int]:
    c = Counter(v for row in grid for v in row)
    return dict(sorted(c.items()))


def write_pgm(path: str, grid: list[list[int]]) -> None:
    """Write a binary PGM (P5) grayscale preview — viewable, zero dependencies.

    Values are normalized to 0..255 so low tile-ids are still visible."""
    h = len(grid)
    w = len(grid[0]) if h else 0
    peak = max((max(row) for row in grid if row), default=1) or 1
    with open(path, "wb") as f:
        f.write(f"P5\n{w} {h}\n255\n".encode("ascii"))
        for row in grid:
            f.write(bytes(min(255, v * 255 // peak) for v in row))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    src = argv[1]
    out_dir = argv[2] if len(argv) > 2 else os.path.join("extracted", "maps")

    data = open(src, "rb").read()
    if len(data) != EXPECTED_SIZE:
        print(f"WARNING: size {len(data)} != expected {EXPECTED_SIZE}; "
              f"layout assumptions may be wrong.", file=sys.stderr)

    os.makedirs(out_dir, exist_ok=True)
    manifest = []
    used_count = 0

    for slot in range(NUM_SLOTS):
        base = slot * SLOT_BYTES
        raw = data[base:base + SLOT_BYTES]

        layers = [to_grid(raw[i * LAYER_BYTES:(i + 1) * LAYER_BYTES], WIDTH, HEIGHT)
                  for i in range(NUM_LAYERS)]
        overview = to_grid(raw[NUM_LAYERS * LAYER_BYTES:], BIG_W, BIG_H)

        # A real map has a varied terrain layer; empty/reserved slots don't.
        # (The doc notes only ~24 of the 40 slots are actually used.)
        richest = max(len(histogram(layer)) for layer in layers)
        is_used = richest > 20

        manifest.append({
            "slot": slot,
            "used": is_used,
            "layers": [
                {"index": i, "distinctValues": len(histogram(layers[i])),
                 "histogram": histogram(layers[i])}
                for i in range(NUM_LAYERS)
            ],
            "overviewDistinctValues": len(histogram(overview)),
        })

        if is_used:
            used_count += 1
            md = os.path.join(out_dir, f"map_{slot:02d}")
            os.makedirs(md, exist_ok=True)
            with open(os.path.join(md, "map.json"), "w") as f:
                json.dump({
                    "slot": slot,
                    "width": WIDTH, "height": HEIGHT,
                    "layers": layers,
                    "overview": {"width": BIG_W, "height": BIG_H, "data": overview},
                }, f)
            for i, layer in enumerate(layers):
                write_pgm(os.path.join(md, f"layer{i}.pgm"), layer)
            write_pgm(os.path.join(md, "overview.pgm"), overview)

    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"{NUM_SLOTS} slots, {used_count} used -> {out_dir}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
