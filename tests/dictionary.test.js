import test from 'node:test';
import assert from 'node:assert/strict';
import { ChunkStream, ProgressStore } from '../dictionary.js';
function storage() {
  const data = new Map();
  return { data, writes: [], getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { this.writes.push([key, value]); data.set(key, value); } };
}
const chunk = (i, count = 200) => ({ path: `chunks/${i}.json`, revision: 'r1', count });
const words = (i, count = 200) => Array.from({ length: count }, (_, j) => ({ id: `${i}-${j}`, en: `word${i}-${j}`, ru: `перевод${i}-${j}` }));
test('30k words require only current chunk and one prefetch; queue stays bounded', async () => {
  const chunks = Array.from({ length: 150 }, (_, i) => chunk(i));
  const requests = [];
  const stream = new ChunkStream(chunks, new ProgressStore(storage()), async path => {
    requests.push(path);
    return words(Number(path.match(/\/(\d+)\.json/)[1]));
  });
  await stream.prepare();
  assert.equal(requests.length, 2);
  assert.equal(stream.queue.length, 200);
  for (let i = 0; i < 30000; i++) {
    await stream.prepare();
    assert.ok(stream.queue.length <= 200);
    assert.ok(stream.requests.size <= 1);
    assert.ok(stream.take([]));
  }
  assert.equal(requests.length, 150);
  assert.equal(stream.done, true);
});
test('completed chunks are skipped without downloading; one answer writes one small record', async () => {
  const disk = storage(), progress = new ProgressStore(disk);
  const chunks = Array.from({ length: 150 }, (_, i) => chunk(i));
  for (let i = 0; i < 149; i++) for (const word of words(i)) progress.add(chunks[i], word.id);
  progress.flush(); disk.writes.length = 0;
  const calls = [];
  const stream = new ChunkStream(chunks, progress, async path => { calls.push(path); return words(149); });
  await stream.prepare();
  assert.equal(calls.length, 1);
  const next = stream.take([]);
  progress.add(next.chunk, next.id);
  assert.equal(disk.writes.length, 0);
  progress.flush();
  assert.equal(disk.writes.length, 1);
  assert.ok(disk.writes[0][1].length < 100);
  assert.equal(new ProgressStore(disk).count(chunks[149]), 1);
});
test('ambiguous translations never cause unbounded scanning or downloads', async () => {
  let calls = 0;
  const stream = new ChunkStream([chunk(0), chunk(1), chunk(2)], new ProgressStore(storage()), async () => {
    calls++; return words(0).map(word => ({ ...word, ru: 'дом' }));
  });
  await stream.prepare();
  const active = [stream.take([])];
  for (let i = 0; i < 20; i++) { await stream.prepare(); assert.equal(stream.take(active), null); }
  assert.equal(calls, 2);
  assert.equal(stream.queue.length, 199);
});
test('failed prefetch retries and closing a stream aborts pending work', async () => {
  let attempt = 0;
  const stream = new ChunkStream([chunk(0, 1), chunk(1, 1)], new ProgressStore(storage()), async path => {
    if (path.includes('/1.') && ++attempt === 1) throw Error('offline');
    return words(path.includes('/1.') ? 1 : 0, 1);
  });
  await stream.prepare();
  await new Promise(resolve => setTimeout(resolve, 0));
  stream.take([]);
  await stream.prepare();
  assert.equal(attempt, 2);
  assert.equal(stream.take([]).id, '1-0');
  let release;
  const pending = new ChunkStream([chunk(0)], new ProgressStore(storage()), () => new Promise(resolve => { release = resolve; }));
  const task = pending.prepare();
  pending.close(); release(words(0)); await task;
  assert.equal(pending.queue.length, 0);
  assert.equal(pending.controller.signal.aborted, true);
});
test('old progress migrates lazily, reset survives reload, changed chunk revision is isolated', () => {
  const disk = storage(); disk.setItem('vocoby-progress-v1', JSON.stringify(['0-0', '1-0']));
  let progress = new ProgressStore(disk);
  const first = chunk(0), second = chunk(1);
  progress.migrate(first, words(0)); progress.migrate(second, words(1)); progress.flush();
  assert.equal(progress.count(first), 1);
  progress.reset([first]);
  progress = new ProgressStore(disk); progress.migrate(first, words(0));
  assert.equal(progress.count(first), 0);
  assert.equal(progress.count(second), 1);
  assert.equal(progress.count({ ...second, revision: 'r2' }), 0);
});
