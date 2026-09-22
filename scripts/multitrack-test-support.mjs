import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const phase3Patches = JSON.parse(await fs.readFile('verification/multitrack-phase3/authorized-patches.json', 'utf8'));
const phase2Patches = JSON.parse(await fs.readFile('verification/multitrack-phase2/authorized-patches.json', 'utf8'));
const patches = JSON.parse(await fs.readFile('verification/multitrack-phase1/authorized-patches.json', 'utf8'));
// Reverse only individually recorded plumbing hunks. Unmatched/changed hunks fail;
// original frozen hashes and behavior expectations remain authoritative.
export function beforeMultiTrack(file, source) {
  for (const patch of phase3Patches.filter(p => p.file === file).reverse()) {
    assert.equal(source.split(patch.after).length, 2, 'Exact Phase 3 hunk: '+file);
    source = source.replace(patch.after, () => patch.before);
  }
  for (const patch of phase2Patches.filter(p => p.file === file).reverse()) {
    assert.equal(source.split(patch.after).length, 2, `Exact Phase 2 hunk: ${file}`);
    source = source.replace(patch.after, patch.before);
  }
  for (const patch of patches.filter(p => p.file === file).reverse()) {
    assert.equal(source.split(patch.after).length, 2, `Exact Phase 1 hunk: ${file}`);
    source = source.replace(patch.after, patch.before);
  }
  return source;
}
await build({stdin:{contents:'export * from "./src/game/trackRegistry"; export * from "./src/game/trackDefinition";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'verification/multitrack-phase1/game-api.mjs'});
export const foundation = await import('../verification/multitrack-phase1/game-api.mjs');