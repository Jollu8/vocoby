import test from 'node:test';
import assert from 'node:assert/strict';

test('board keeps its ten buttons, replaces matches, and stays playable during slow loading', async () => {
  class Element {
    constructor() { this.listeners = {}; this.children = []; this.value = 'all'; this.textContent = ''; this.classList = { add() {} }; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    append(child) { this.children.push(child); }
    add() {}
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
  globalThis.Option = class {};
  const chunks = [0, 1].map(i => ({ path: `chunks/${i}.json`, revision: 'r1', count: 6, level: 'A1', letter: 'a' }));
  const words = i => Array.from({ length: 6 }, (_, j) => ({ id: `${i}-${j}`, en: `en-${i}-${j}`, ru: `ru-${i}-${j}` }));
  let releaseNext;
  globalThis.fetch = async path => ({ ok: true, json: async () => {
    if (path === 'data/manifest.json') return { total: 12, levels: ['A1'], chunks };
    if (path.includes('/0.')) return words(0);
    return new Promise(resolve => { releaseNext = () => resolve(words(1)); });
  } });
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  await import('../app.js');
  await wait(10);
  assert.equal(buttonsCreated, 10);
  const left = element('english').children, right = element('russian').children;
  assert.equal(left.filter(button => !button.disabled).length, 5);
  async function match(button) {
    const translation = button.textContent.replace('en-', 'ru-');
    button.click();
    right.find(button => button.textContent === translation).click();
    await wait(450);
  }
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '1 / 12');
  assert.equal(left[0].textContent, 'en-0-5');
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
});
