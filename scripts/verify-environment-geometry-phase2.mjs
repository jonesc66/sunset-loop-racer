import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Compile just the pure geometry helpers with the project's installed TypeScript.
const output = new URL('../verification/environment-phase2/', import.meta.url);
await fs.mkdir(output, { recursive: true });
for (const [source, name] of [['src/game/track.ts', 'track'], ['src/environment/benchmarkGeometry.ts', 'benchmarkGeometry']]) {
  const text = await fs.readFile(new URL('../' + source, import.meta.url), 'utf8');
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('"../game/track"', '"./track.mjs"');
  await fs.writeFile(new URL(name + '.mjs', output), code);
}
const { createTrack, createRoadGeometry, TRACK_WIDTH } = await import(new URL('track.mjs', output));
const { createMountain, createVerge, roadDistance } = await import(new URL('benchmarkGeometry.mjs', output));
const track = createTrack();
const road = createRoadGeometry(track);
const uv = road.getAttribute('uv'), position = road.getAttribute('position'), normal = road.getAttribute('normal');
for (let i = 0; i < normal.count; i++) assert(normal.getY(i) > 0.999, 'Road normal must face up');
for (let i = 2; i < uv.count; i += 2) assert(uv.getY(i) > uv.getY(i - 2), 'UV must advance through closing edge');
for (let axis = 0; axis < 3; axis++) assert.equal(position.array[axis], position.array[position.array.length - 6 + axis]);
assert(Math.abs(uv.getY(uv.count - 1) - Math.round(uv.getY(uv.count - 1))) < 1e-4);
const finite = g => {
  for (const a of Object.values(g.attributes)) for (const v of a.array) assert(Number.isFinite(v));
};
for (const side of [-1, 1]) {
  const verge = createVerge(track, side); finite(verge);
  const p = verge.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.06) assert(roadDistance(track, p.getX(i), p.getZ(i)) > TRACK_WIDTH / 2 + 3.3, 'Raised verge must clear road');
  verge.dispose();
}
for (const detail of [10, 12, 18, 24]) {
  const g = createMountain(13, 80, 67, 115, detail); finite(g);
  const p = g.getAttribute('position'), ids = [], vertices = new Map(), edges = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 10000)).join(',');
    if (!vertices.has(key)) vertices.set(key, vertices.size);
    ids.push(vertices.get(key));
  }
  for (let i = 0; i < g.index.count; i += 3) {
    const face = [0, 1, 2].map(n => ids[g.index.getX(i + n)]);
    if (new Set(face).size < 3) continue;
    for (let j = 0; j < 3; j++) {
      const key = [face[j], face[(j + 1) % 3]].sort((a, b) => a - b).join(':');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert([...edges.values()].every(count => count === 2), 'Mountain must be closed manifold after seam welding');
  g.dispose();
}
// Gameplay and imported car implementation remain byte-identical to the captured baseline.
const before = await fs.readFile(new URL('baseline/RaceScene.tsx', output), 'utf8');
const after = await fs.readFile(new URL('../src/RaceScene.tsx', import.meta.url), 'utf8');
const section = (s, from, to) => s.slice(s.indexOf(from), s.indexOf(to)).replace(/\r\n/g, '\n');
assert.equal(section(after, 'function createCar(', 'function TrackSurface('), section(before, 'function createCar(', 'function TrackSurface('));
const report = { status: 'PASS', checks: ['Road upward normals', 'Continuous closing UVs', 'Finite geometry', 'Verge road clearance', 'Closed mountain topology at all detail levels', 'Frozen physics, AI, checkpoints, camera and vehicle models unchanged'] };
await fs.writeFile(new URL('geometry-results.json', output), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
