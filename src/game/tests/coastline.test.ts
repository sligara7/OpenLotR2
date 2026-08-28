/* The coastline-derived map: shape, county integrity, and adjacency. */

import { test, assert, assertEqual } from '../testing/harness.ts';
import {
  BRITAIN,
  adjacencyDrift,
  britainAdjacency,
  buildBritainTileMap,
  countyTowns,
  hexNeighbours,
  isSeaLink,
  landContact,
  mapEdges,
} from '../maps/index.ts';

const map = buildBritainTileMap();
const land = map.tiles.filter((t) => t.countyId !== null);
const byKey = new Map(map.tiles.map((t) => [`${t.col},${t.row}`, t]));

test('coastline: the island is a minority of the grid, as a real island is', () => {
  // Britain is a thin diagonal island in a rectangular bounding box, so most of
  // the grid MUST be sea. The old map filled its grid with overlapping blobs and
  // had no honest sea at all; a land share near half would mean the coastline is
  // being ignored again.
  const share = land.length / map.tiles.length;
  assert(share > 0.3 && share < 0.5, `land share ${(share * 100).toFixed(0)}% is between 30% and 50%`);
  assert(map.rivers.length > 50, `${map.rivers.length} river edges were carved`);
});

test('coastline: every county has territory, a town, and one piece of it', () => {
  const counts = new Map<string, number>();
  for (const t of land) counts.set(t.countyId!, (counts.get(t.countyId!) ?? 0) + 1);

  assertEqual(counts.size, BRITAIN.regions.length, 'every county owns at least one tile');
  assertEqual(countyTowns(map).size, BRITAIN.regions.length, 'every county has a town');

  // Contiguity: a county split in two can have its town cut off from its own
  // land, which silently breaks movement, sieges and supply.
  const split: string[] = [];
  for (const region of BRITAIN.regions) {
    const tiles = land.filter((t) => t.countyId === region.id);
    const seen = new Set<string>([`${tiles[0].col},${tiles[0].row}`]);
    const stack = [tiles[0]];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const [nc, nr] of hexNeighbours(cur.col, cur.row)) {
        const k = `${nc},${nr}`;
        const n = byKey.get(k);
        if (n?.countyId === region.id && !seen.has(k)) { seen.add(k); stack.push(n); }
      }
    }
    if (seen.size !== tiles.length) split.push(`${region.id} (${seen.size}/${tiles.length})`);
  }
  assertEqual(split.join(', '), '', 'no county is split into disconnected pieces');
});

test('adjacency: derived from tile contact, and the whole realm stays connected', () => {
  const edges = britainAdjacency();
  assert(edges.length > 150, `${edges.length} adjacency edges derived`);

  // Flood the county graph — an unreachable county is a county no campaign can
  // ever take, which is the failure mode a real coastline could introduce.
  const graph = new Map<string, string[]>();
  for (const [a, b] of edges) {
    (graph.get(a) ?? graph.set(a, []).get(a)!).push(b);
    (graph.get(b) ?? graph.set(b, []).get(b)!).push(a);
  }
  const seen = new Set<string>([BRITAIN.regions[0].id]);
  const stack = [BRITAIN.regions[0].id];
  while (stack.length) {
    for (const n of graph.get(stack.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  assertEqual(seen.size, BRITAIN.regions.length, 'every county is reachable from every other');
});

test('adjacency: island counties are joined by sea, not by land', () => {
  const contact = landContact(map);
  assert(!contact.has('anglesey|caernarfonshire'), 'Anglesey shares no land border');
  assert(isSeaLink('anglesey', 'caernarfonshire'), 'and is joined across the Menai Strait instead');
  assert(!isSeaLink('cornwall', 'devon'), 'counties that share ground are not sea links');
});

test('adjacency: the hand-declared lists are kept as a check on the derived graph', () => {
  const { declaredOnly, derivedOnly } = adjacencyDrift();

  // The declared lists in britain.ts were drawn against the OLD map, whose
  // coastline was a union of circles, so some disagreement is expected and
  // correct — the ground moved, the lists did not. What is NOT acceptable is
  // wholesale disagreement, which would mean the projection or the county
  // coordinates are wrong rather than merely dated.
  const declared = mapEdges(BRITAIN).length;
  const agreed = declared - declaredOnly.length;
  assert(agreed / declared > 0.85, `${agreed}/${declared} declared borders still hold on the ground`);
  assert(derivedOnly.length < 40, `${derivedOnly.length} borders the old lists never recorded`);
});
