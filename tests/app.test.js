import test from 'node:test';
import assert from 'node:assert/strict';

test('board keeps its ten buttons, shuffles translations, and stays playable during slow loading', async t => {
  t.mock.method(Math, 'random', () => 0);
  class Element {
    constructor() { this.listeners = {}; this.children = []; this.value = 'all'; this.textContent = ''; this.classList = { add() {} }; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    append(child) { this.children.push(child); }
    add(option) { this.children.push(option); }
    click() { if (!this.disabled) this.listeners.click?.(); }
  }
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  let buttonsCreated = 0;
  const data = new Map();
  globalThis.window = { localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, addEventListener() {} };
  globalThis.document = {
    getElementById: element, querySelector: element, addEventListener() {},
    createElement() { buttonsCreated++; return new Element(); },
  };
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  const chunks = [0, 1].map(i => ({ path: `chunks/${i}.json`, revision: 'r1', count: 6, level: 'A1', letter: 'a' }));
  const words = i => Array.from({ length: 6 }, (_, j) => ({ id: `${i}-${j}`, en: `en-${i}-${j}`, ru: `ru-${i}-${j}` }));
  let releaseNext;
  const requested = [];
  globalThis.fetch = async path => ({ ok: true, json: async () => {
    requested.push(path);
    if (path === 'data/manifest.json') return { total: 30, levels: ['A1', 'A2', 'B1', 'B2'], chunks: [...chunks, { ...chunks[0], level: 'A2', path: 'chunks/legacy-a2.json' }, { ...chunks[0], level: 'B1', path: 'chunks/legacy-b1.json' }, { ...chunks[0], level: 'B2', path: 'chunks/legacy-b2.json' }] };
    if (path === 'data/most-1000/manifest.json') return { total: 6, chunks: [chunks[0]] };
    if (path === 'data/a1-vocabden/manifest.json') return { total: 12, levels: ['A1'], chunks };
    if (path === 'data/a2-user/manifest.json') return { total: 6, levels: ['A2'], chunks: [{ ...chunks[0], level: 'A2' }] };
    if (path === 'data/b1-user/manifest.json') return { total: 6, levels: ['B1'], chunks: [{ ...chunks[0], level: 'B1' }] };
    if (path === 'data/b2-user/manifest.json') return { total: 6, levels: ['B2'], chunks: [{ ...chunks[0], level: 'B2' }] };
    if (path.includes('/0.')) return words(0);
    return new Promise(resolve => { releaseNext = () => resolve(words(1)); });
  } });
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  await import('../app.js');
  await wait(10);
  assert.equal(buttonsCreated, 10);
  const left = element('english').children, right = element('russian').children;
  assert.equal(left.filter(button => !button.disabled).length, 5);
  assert.ok(requested.some(path => path.startsWith('data/a1-vocabden/chunks/')));
  assert.ok(!requested.some(path => path.startsWith('data/chunks/')), 'legacy A1 is not loaded');
  assert.equal(element('selection-summary').textContent, 'A1 · 12 слов · A–Z');
  async function match(button) {
    const translation = button.textContent.replace('en-', 'ru-');
    button.click();
    right.find(button => button.textContent === translation).click();
    await wait(450);
  }
  const previousLeft = left.map(button => button.textContent);
  const previousRight = right.map(button => button.textContent);
  Math.random.mock.mockImplementation(() => 0.5);
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '1 / 12');
  assert.equal(left[0].textContent, 'en-0-5');
  assert.deepEqual(left.slice(1).map(button => button.textContent), previousLeft.slice(1));
  assert.ok(right.some((button, slot) => previousRight.includes(button.textContent)
    && button.textContent !== previousRight[slot]), 'existing translations move after a match');
  assert.deepEqual(right.map(button => button.textContent).sort(),
    left.map(button => button.textContent.replace('en-', 'ru-')).sort());
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '2 / 12');
  assert.equal(left.filter(button => !button.disabled).length, 4);
  // Network is still pending, but another existing pair can be answered.
  await match(left[1]);
  assert.equal(element('progress-count').textContent, '3 / 12');
  releaseNext(); await wait(20);
  assert.equal(left.filter(button => !button.disabled).length, 5);
  assert.equal(buttonsCreated, 10);
  await match(left.find(button => !button.disabled));
  assert.equal(element('progress-count').textContent, '4 / 12');
  assert.equal(buttonsCreated, 10);
  assert.ok(element('level').children.some(option => option.value === 'most-1000' && option.text === 'Most 1000'));
  element('level').value = 'most-1000';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '0 / 6', 'collection has independent progress');
  assert.equal(element('selection-summary').textContent, 'Most 1000 · A–Z');
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '1 / 6');
  element('letter').value = 'z';
  element('letter').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '0 / 0');
  element('letter').value = 'all';
  element('level').value = 'all';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '4 / 30', 'all levels excludes the separate collection');
  element('level').value = 'most-1000';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '1 / 6', 'collection progress survives switching');
  window.confirm = () => true;
  element('restart').click();
  await wait(20);
  assert.equal(element('progress-count').textContent, '0 / 6');
  element('level').value = 'all';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '4 / 30', 'collection reset preserves main progress');
  element('level').value = 'A2';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('selection-summary').textContent, 'A2 · 6 слов · A–Z');
  assert.equal(element('progress-count').textContent, '0 / 6');
  assert.ok(requested.some(path => path.startsWith('data/a2-user/chunks/')));
  assert.ok(!requested.some(path => path.includes('legacy-a2')));
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '1 / 6');
  element('level').value = 'A1';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '4 / 12');
  element('level').value = 'A2';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '1 / 6', 'A2 progress survives switching');
  element('level').value = 'B1';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('selection-summary').textContent, 'B1 · 6 слов · A–Z');
  assert.equal(element('progress-count').textContent, '0 / 6');
  assert.ok(requested.some(path => path.startsWith('data/b1-user/chunks/')));
  assert.ok(!requested.some(path => path.includes('legacy-b1')));
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '1 / 6');
  element('level').value = 'A2';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '1 / 6');
  element('level').value = 'B1';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '1 / 6', 'B1 progress survives switching');
  element('level').value = 'B2';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('selection-summary').textContent, 'B2 · 6 слов · A–Z');
  assert.equal(element('progress-count').textContent, '0 / 6');
  assert.ok(requested.some(path => path.startsWith('data/b2-user/chunks/')));
  assert.ok(!requested.some(path => path.includes('legacy-b2')));
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '1 / 6');
  element('level').value = 'A2';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '1 / 6');
  element('level').value = 'B2';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '1 / 6', 'B2 progress survives switching');
});
