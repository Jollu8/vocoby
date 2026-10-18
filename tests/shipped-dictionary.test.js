import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ChunkStream, ProgressStore } from '../dictionary.js';
import { answerLabel, normalizeAnswer } from '../engine.js';

for (const [directory, expectedTotal] of Object.entries({
  data: null, 'data/most-1000': 1000, 'data/a1-vocabden': 898, 'data/a2-user': 877,
  'data/b1-user': 394, 'data/b2-user': 394, 'data/c1-core': 200,
  'data/phrasal-verbs': 120, 'data/travel': 100, 'data/collocations': 100,
})) {
test(`${directory} is playable with bounded loading and unambiguous visible pairs`, async () => {
  const manifest = JSON.parse(await readFile(new URL(`../${directory}/manifest.json`, import.meta.url)));
  if (expectedTotal === null) assert.ok(manifest.total >= 30000);
  else assert.equal(manifest.total, expectedTotal);
  const progress = new ProgressStore({ getItem() { return null; }, setItem() {} });
  let requests = 0;
  const stream = new ChunkStream(manifest.chunks, progress, async path => {
    requests++;
    return JSON.parse(await readFile(new URL(`../${path.split('?')[0].replace(/^data/, directory)}`, import.meta.url)));
  });
  const active = [], matched = new Set();
  while (!stream.done || active.length) {
    while (active.length < 5) {
      await stream.prepare();
      const next = stream.take(active);
      if (!next) break;
      assert.ok(!active.some(word => word.en === next.en ||
        normalizeAnswer(answerLabel(word.ru)) === normalizeAnswer(answerLabel(next.ru))));
      active.push(next);
    }
    assert.ok(stream.queue.length <= 200);
    assert.ok(stream.requests.size <= 1);
    const word = active.shift();
    assert.ok(word, 'No stalled or silently dropped entries');
    assert.ok(!matched.has(word.id), `Duplicate ID: ${word.id}`);
    matched.add(word.id);
    progress.add(word.chunk, word.id);
  }
  assert.equal(matched.size, manifest.total);
  assert.equal(requests, manifest.chunks.length);
});
}
