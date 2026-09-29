import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, makeChoices } from '../engine.js';

test('translation checking accepts dictionary alternatives and normalizes harmless differences', () => {
  for (const answer of ['ПРИВЕТ', ' здравствуйте ', 'привет, здравствуйте']) {
    assert.deepEqual(checkAnswer(answer, 'привет, здравствуйте'), { correct: true, typo: false });
  }
  assert.equal(checkAnswer('  елка   дома ', 'ёлка дома').correct, true);
  for (const value of ['', ' ', 'при', 'машина']) assert.equal(checkAnswer(value, 'привет').correct, false);
});

test('one typo allows insertion, deletion, replacement and transposition, but protects short words', () => {
  for (const value of ['helllo', 'helo', 'hellp', 'hlelo']) {
    assert.equal(checkAnswer(value, 'hello').correct, false);
    assert.deepEqual(checkAnswer(value, 'hello', true), { correct: true, typo: true });
  }
  for (const [value, expected] of [['hexxo', 'hello'], ['cat', 'car'], ['на', 'да'], ['', 'hello']]) {
    assert.equal(checkAnswer(value, expected, true).correct, false);
  }
});

test('choices are distinct and exclude alternative translations of the same prompt in either direction', () => {
  const word = { en: 'hello', ru: 'привет, здравствуйте' };
  const pool = [word, { en: 'hello', ru: 'добрый день' }, { en: 'hi', ru: 'привет' },
    { en: 'car', ru: 'машина' }, { en: 'bye', ru: 'пока' }, { en: 'auto', ru: 'машина' }];
  const options = makeChoices(word, pool, 'en-ru', () => 0);
  assert.equal(options.length, 3);
  assert.deepEqual(new Set(options), new Set([word.ru, 'машина', 'пока']));
  const reverse = makeChoices(word, pool, 'ru-en', () => 0);
  assert.ok(reverse.includes('hello'));
  assert.ok(!reverse.includes('hi'));
  assert.equal(reverse.length, 4);
  assert.deepEqual(makeChoices(word, [word], 'en-ru'), [word.ru]);
});


test('a full pool produces five distinct answers with exactly one correct choice', () => {
  const pool = Array.from({ length: 20 }, (_, i) => ({ en: `word-${i}`, ru: `перевод-${i}` }));
  for (const direction of ['en-ru', 'ru-en']) {
    const answers = makeChoices(pool[0], pool, direction);
    assert.equal(answers.length, 5);
    assert.equal(new Set(answers).size, 5);
    assert.equal(answers.filter(answer => checkAnswer(answer, pool[0][direction === 'en-ru' ? 'ru' : 'en']).correct).length, 1);
  }
});
