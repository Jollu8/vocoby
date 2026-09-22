import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, takeNext } from '../engine.js';
test('shuffle preserves all entries and leaves source intact', () => {
  const source = [1, 2, 3, 4, 5];
  const result = shuffle(source, () => 0);
  assert.deepEqual([...result].sort(), source);
  assert.notDeepEqual(result, source);
  assert.deepEqual(source, [1, 2, 3, 4, 5]);
});
test('ambiguous translations wait until their earlier card is gone', () => {
  const house = { en: 'house', ru: 'дом' };
  const home = { en: 'home', ru: 'дом' };
  const cat = { en: 'cat', ru: 'кот' };
  const queue = [home, cat];
  assert.equal(takeNext(queue, [house, null]), cat);
  assert.equal(takeNext(queue, [house]), null);
  assert.equal(takeNext(queue, []), home);
  assert.equal(takeNext(queue, []), null);
});
