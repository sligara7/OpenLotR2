# Original-data extraction tools (`tools/extract`)

Parsers for the original *Lords of the Realm II* data files. They exist to
**understand and analyze** the original game data so we can author our own,
original content — they are not a way to redistribute the original assets.

## What's here

- `maps.py` — decodes `L2_MAPS.DAT` (24 of 40 county maps; each = six 64×64 tile
  layers + one 65×129 overview). Emits per-map tile grids (`map.json`),
  grayscale previews (`.pgm`, no image lib needed), and a `manifest.json`.

```sh
python3 tools/extract/maps.py /path/to/lordorm2/L2_MAPS.DAT extracted/maps
```

## Important: keep output out of the repo

The extracted data is the original game's copyrighted content. The tools are
ours and are committed; their **output is gitignored** (`extracted/`, `*.pgm`)
and must not be published.

Use the extracted data as **reference** — county geography, adjacency, scale,
tile semantics — to create new, original maps/art. Functional facts (which
counties exist, how they border each other, grid dimensions) are reusable; the
specific original pixel art is not. See the IP notes in the project discussion.
