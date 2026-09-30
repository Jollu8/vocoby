import test from 'node:test';
import assert from 'node:assert/strict';
import { StudySession, currentStreak } from '../session.js';
import { ChunkStream, ProgressStore } from '../dictionary.js';

function fixture(count = 20) {
  const data = new Map();
  const progress = new ProgressStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  const chunk = { path: 'test', revision: '1', count };
  const words = Array.from({ length: count }, (_, i) => ({ id: String(i), en: `en${i}`, ru: `ru${i}` }));
  const source = new ChunkStream([chunk], progress, async () => words);
  return { lesson: new StudySession(source), progress, chunk };
}

test('lesson ends after 15 distinct words without consuming the rest of a chunk', async () => {
  const { lesson } = fixture();
  for (let i = 0; i < 15; i++) {
    await lesson.prepare();
    const word = lesson.take([]);
    assert.ok(word);
    assert.equal(lesson.answer(word), true);
  }
  assert.equal(lesson.take([]), null);
  assert.equal(lesson.done, true);
  assert.equal(lesson.firstTry, 15);
  assert.equal(lesson.source.queue.length, 5);
});

test('repeated mistakes create one retry, delayed by three other answers', async () => {
  const { lesson } = fixture();
  await lesson.prepare();
  const hard = lesson.take([]);
  lesson.mistake(hard); lesson.mistake(hard);
  assert.equal(lesson.answer(hard), false);
  assert.equal(lesson.retries.length, 1);
  for (let i = 0; i < 3; i++) {
    const word = lesson.take([]);
    assert.notEqual(word.id, hard.id);
    lesson.answer(word);
  }
  assert.equal(lesson.take([]), hard);
  assert.equal(lesson.answer(hard), true);
  assert.equal(lesson.mistakes.size, 1);
  assert.equal(lesson.firstTry, 3);
});

test('a revealed last word returns even with fewer than three intervening questions', async () => {
  const { lesson } = fixture(1);
  await lesson.prepare();
  const word = lesson.take([]);
  lesson.mistake(word); lesson.answer(word);
  assert.equal(lesson.done, false);
  assert.equal(lesson.take([word]), null, 'never show duplicate cards');
  assert.equal(lesson.take([]), word);
  lesson.answer(word);
  assert.equal(lesson.done, true);
  assert.equal(lesson.finished.size, 1);
});

test('streak expires after a missed day, but remains valid before studying today', () => {
  assert.equal(currentStreak({ streak: 7, lastDay: '2026-09-27' }, '2026-09-29', '2026-09-28'), 0);
  assert.equal(currentStreak({ streak: 7, lastDay: '2026-09-28' }, '2026-09-29', '2026-09-28'), 7);
  assert.equal(currentStreak({ streak: 8, lastDay: '2026-09-29' }, '2026-09-29', '2026-09-28'), 8);
});

test('five-card board drains retries at the 15-word boundary and next lesson resumes progress', async () => {
  const { lesson, progress, chunk } = fixture(20);
  const active = Array(5).fill(null);
  const fill = async () => {
    for (let slot = 0; slot < active.length; slot++) {
      if (active[slot]) continue;
      await lesson.prepare();
      active[slot] = lesson.take(active);
    }
  };
  await fill();
  let turns = 0;
  while (active.some(Boolean)) {
    const slot = active.findIndex(Boolean);
    const word = active[slot];
    if (!lesson.mistakes.has(lesson.key(word))) lesson.mistake(word);
    if (lesson.answer(word)) progress.add(chunk, word.id);
    active[slot] = null;
    await fill();
    assert.ok(++turns <= 30, 'retries cannot deadlock a full board');
  }
  assert.equal(turns, 30);
  assert.equal(lesson.done, true);
  assert.equal(lesson.finished.size, 15);
  assert.equal(lesson.firstTry, 0);
  assert.equal(progress.count(chunk), 15);
  progress.flush();
  const words = Array.from({ length: 20 }, (_, i) => ({ id: String(i), en: `en${i}`, ru: `ru${i}` }));
  const next = new StudySession(new ChunkStream([chunk], progress, async () => words));
  await next.prepare();
  let word;
  while ((word = next.take([]))) next.answer(word);
  assert.equal(next.words.size, 5);
  assert.equal(next.done, true);
  assert.ok([...next.words.values()].every(word => !lesson.words.has(lesson.key(word))));
});

test('pair retry stays among three pairs and helpers cannot change progress or delay completion', async () => {
  const { lesson, progress, chunk } = fixture(15);
  let active = Array(5).fill(null);
  const fill = async () => {
    for (let slot = 0; slot < active.length; slot++) {
      if (active[slot]) continue;
      await lesson.prepare();
      active[slot] = lesson.take(active);
    }
    active = lesson.fillPairSupport(active);
  };
  await fill();
  let hard, attempts = 0, checkedHelper = false;
  while (active.some(Boolean)) {
    assert.ok(active.filter(Boolean).length >= 3, 'no obvious one-pair ending');
    const slot = active.findIndex(word => word && !word.support);
    assert.notEqual(slot, -1, 'helpers cannot keep a finished lesson alive');
    const word = active[slot];
    if (lesson.finished.size === 14 && !hard) {
      hard = word;
      lesson.mistake(word);
    }
    const helper = active.find(word => word?.support);
    if (helper && !checkedHelper) {
      const before = [lesson.turn, lesson.finished.size, lesson.mistakes.size, lesson.retries.length];
      lesson.mistake(helper);
      assert.equal(lesson.answer(helper), false);
      assert.deepEqual([lesson.turn, lesson.finished.size, lesson.mistakes.size, lesson.retries.length], before);
      checkedHelper = true;
    }
    if (lesson.answer(word)) progress.add(chunk, word.id);
    active[slot] = null;
    await fill();
    assert.ok(++attempts <= 16);
  }
  assert.ok(checkedHelper);
  assert.equal(attempts, 16);
  assert.equal(lesson.finished.size, 15);
  assert.equal(progress.count(chunk), 15);
  assert.equal(lesson.mistakes.size, 1);
  assert.equal(lesson.firstTry, 14);
});

test('support pairs avoid identical translations and do not invent words in tiny collections', async () => {
  const { lesson } = fixture(3);
  await lesson.prepare();
  const a = lesson.take([]), b = lesson.take([]), c = lesson.take([]);
  lesson.answer(a); lesson.answer(b);
  b.ru = c.ru;
  const board = lesson.fillPairSupport([c, null, null, null, null]);
  assert.equal(board.filter(Boolean).length, 2);
  assert.equal(board.find(word => word?.support).id, a.id);
  assert.equal(new Set(board.filter(Boolean).map(word => word.ru)).size, 2);
  const tiny = fixture(1).lesson;
  await tiny.prepare();
  const only = tiny.take([]);
  assert.deepEqual(tiny.fillPairSupport([only, null, null, null, null]), [only, null, null, null, null]);
});
