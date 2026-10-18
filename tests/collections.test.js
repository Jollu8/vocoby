import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS, buildCollections } from '../collections.js';
import { ProgressStore } from '../dictionary.js';

const chunk = { path: 'chunks/a-001.json', level: 'ungraded', letter: 'a', count: 1, revision: 'r1' };
const manifests = Object.fromEntries(COLLECTIONS.map(item => [item.id, { chunks: [chunk] }]));
const base = { levels: ['A1', 'B2', 'ungraded'], chunks: [
  { ...chunk, level: 'A1', path: 'chunks/legacy-a1.json' },
  { ...chunk, level: 'B2', path: 'chunks/legacy-b2.json' },
  chunk,
] };

test('the level dictionary adds C1 and keeps topics outside the combined level selection', () => {
  const { manifest, collections, allChunks } = buildCollections(base, manifests);
  assert.equal(manifest.total, 6); // Five level collections plus the ungraded base.
  assert.ok(manifest.levels.includes('C1'));
  assert.ok(!manifest.chunks.some(item => item.path.includes('legacy-')));
  assert.ok(manifest.chunks.some(item => item.path === chunk.path), 'ungraded progress paths stay intact');
  for (const id of ['phrasal-verbs', 'travel', 'collocations', 'most-1000']) {
    assert.ok(!manifest.chunks.some(item => item.level === id), `${id} stays out of the level dictionary`);
    assert.equal(collections.get(id).chunks[0].level, id);
    assert.equal(collections.get(id).total, 1);
  }
  assert.equal(allChunks.length, 10);
  assert.equal(new Set(allChunks.map(item => item.path)).size, 10, 'statistics count each collection chunk once');
});

test('existing progress keys stay identical and overlapping theme words have separate progress after reload', () => {
  const { collections } = buildCollections(base, manifests);
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const progress = new ProgressStore(storage);
  for (const id of ['A1', 'A2', 'B1', 'B2', 'most-1000']) {
    const definition = COLLECTIONS.find(item => item.id === id);
    const actual = collections.get(id).chunks[0];
    assert.equal(progress.key(actual), `vocoby-chunk-v2:${definition.directory}/${chunk.path}:r1`);
  }
  const phrasal = collections.get('phrasal-verbs').chunks[0];
  const travel = collections.get('travel').chunks[0];
  const a1 = collections.get('A1').chunks[0];
  progress.add(a1, 'same-headword');
  progress.add(phrasal, 'same-headword');
  progress.flush();
  const restored = new ProgressStore(storage);
  assert.equal(restored.count(a1), 1);
  assert.equal(restored.count(phrasal), 1);
  assert.equal(restored.count(travel), 0, 'a matching English ID never leaks into another collection');
});

test('new collections do not inherit answers from the legacy device-wide progress list', () => {
  const { collections } = buildCollections(base, manifests);
  const progress = new ProgressStore({
    getItem: key => key === 'vocoby-progress-v1' ? '["old-word"]' : null,
    setItem() {},
  });
  for (const id of ['C1', 'phrasal-verbs', 'travel', 'collocations']) {
    const target = collections.get(id).chunks[0];
    progress.migrate(target, [{ id: 'old-word' }]);
    assert.equal(progress.count(target), 0, `${id} starts fresh`);
  }
  const existing = collections.get('A1').chunks[0];
  progress.migrate(existing, [{ id: 'old-word' }]);
  assert.equal(progress.count(existing), 1, 'migration for existing collections is preserved');
});
