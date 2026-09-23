import test from 'node:test';
import assert from 'node:assert/strict';

test('board keeps its ten buttons, shuffles translations, and stays playable during slow loading', async t => {
  t.mock.method(Math, 'random', () => 0);
  class Element {
    constructor() {
      this.style = { setProperty(name, value) { this[name] = value; } };
      this.listeners = {};
      this.children = [];
      this.value = 'all';
      this.textContent = '';
      this.attributes = {};
      this.classList = {
        classes: new Set(),
        add(...names) { names.forEach(name => this.classes.add(name)); },
        remove(...names) { names.forEach(name => this.classes.delete(name)); },
        contains(name) { return this.classes.has(name); },
      };
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
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
  element('view-sphere').click();
  assert.equal(element('board').className, 'board sphere');
  assert.equal(element('game').className, 'game sphere-fullscreen');
  assert.equal(data.get('vocoby-view'), 'sphere');
  assert.equal(element('column-labels').hidden, true);
  const viewport = element('board-viewport');
  viewport.scrollLeft = 200; viewport.scrollTop = 200;
  viewport.setPointerCapture = () => {};
  viewport.hasPointerCapture = () => false;
  viewport.listeners.pointerdown({ button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  viewport.listeners.pointermove({ pointerId: 1, clientX: 140, clientY: 130 });
  assert.equal(viewport.scrollLeft, 160);
  assert.equal(viewport.scrollTop, 170);
  viewport.listeners.pointerup({ pointerId: 1 });
  let blockedDragClick = false;
  viewport.listeners.click({ detail: 1, preventDefault() {}, stopPropagation() { blockedDragClick = true; } });
  assert.equal(blockedDragClick, true, 'dragging does not select a word');
  const initialPositions = [...left, ...right].map(button => button.style['--sphere-x'] + button.style['--sphere-y']);
  assert.equal(new Set(initialPositions).size, 10);
  const depths = [...left, ...right].map(button => parseFloat(button.style['--dome-depth']));
  assert.ok(depths.every(depth => depth >= 0 && depth <= 32));
  assert.ok(new Set(depths).size > 1, 'dome has different depths');
  for (const button of [...left, ...right]) {
    assert.ok(Number.isFinite(parseFloat(button.style['--mobile-dome-rx'])));
    assert.ok(parseFloat(button.style['--dome-scale']) >= 0.88);
  }
  const previousLeft = left.map(button => button.textContent);
  const previousRight = right.map(button => button.textContent);
  Math.random.mock.mockImplementation(() => 0.5);
  await match(left[0]);
  assert.equal(element('progress-count').textContent, '1 / 12');
  assert.equal(left[0].textContent, 'en-0-5');
  assert.notDeepEqual([...left, ...right].map(button => button.style['--sphere-x'] + button.style['--sphere-y']), initialPositions);
  element('view-columns').click();
  assert.equal(element('game').className, 'game');
  assert.equal(element('board').className, 'board');
  assert.equal(element('progress-count').textContent, '1 / 12');
  assert.equal(data.get('vocoby-view'), 'columns');
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

test('the newest English selection stays active during the short match feedback', async () => {
  const data = new Map();
  class Element {
    constructor() {
      this.style = { setProperty(name, value) { this[name] = value; } };
      this.listeners = {};
      this.children = [];
      this.value = 'all';
      this.textContent = '';
      this.attributes = {};
      this.classList = {
        classes: new Set(),
        add(...names) { names.forEach(name => this.classes.add(name)); },
        remove(...names) { names.forEach(name => this.classes.delete(name)); },
        contains(name) { return this.classes.has(name); },
      };
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    append(child) { this.children.push(child); }
    add(option) { this.children.push(option); }
    click() { if (!this.disabled) this.listeners.click?.(); }
  }
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  globalThis.window = { localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, addEventListener() {} };
  globalThis.document = {
    getElementById: element, querySelector: element, addEventListener() {},
    createElement() { return new Element(); },
  };
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  const chunks = [{ path: 'chunks/quick.json', revision: 'r1', count: 3, level: 'A1', letter: 'a' }];
  const words = Array.from({ length: 3 }, (_, j) => ({ id: `w-${j}`, en: `en-${j}`, ru: `ru-${j}`, chunk: chunks[0] }));
  globalThis.fetch = async path => ({ ok: true, json: async () => {
    if (path === 'data/manifest.json') return { total: 3, levels: ['A1', 'B1'], chunks: [{ ...chunks[0], level: 'A1', path: 'chunks/legacy-a1.json' }, { ...chunks[0], level: 'B1', path: 'chunks/legacy-b1.json' }] };
    if (path === 'data/most-1000/manifest.json') return { total: 0, chunks: [] };
    if (path === 'data/a1-vocabden/manifest.json') return { total: 3, levels: ['A1'], chunks };
    if (path === 'data/a2-user/manifest.json') return { total: 0, levels: ['A2'], chunks: [] };
    if (path === 'data/b1-user/manifest.json') return { total: 0, levels: ['B1'], chunks: [] };
    if (path === 'data/b2-user/manifest.json') return { total: 0, levels: ['B2'], chunks: [] };
    if (path.includes('/quick.')) return words;
    return words;
  } });
  await import('../app.js?quick-selection');
  await new Promise(resolve => setTimeout(resolve, 100));
  const left = element('english').children;
  const right = element('russian').children;
  assert.ok(left.length >= 2, 'board has enough English buttons');
  assert.ok(right.length >= 2, 'board has enough Russian buttons');
  left[0].click();
  right.find(button => button.textContent === 'ru-0').click();
  left[1].click();
  assert.equal(left[1].getAttribute('aria-pressed'), 'true');
  assert.equal(left[0].getAttribute('aria-pressed'), 'false');
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(left[1].getAttribute('aria-pressed'), 'true');
  right.find(button => button.textContent === 'ru-1').click();
  left[2].click();
  right.find(button => button.textContent === 'ru-2').click();
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.equal(element('progress-count').textContent, '3 / 3');
});
