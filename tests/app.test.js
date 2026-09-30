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
    focus() { document.activeElement = this; }
    click(event) { if (!this.disabled) this.listeners.click?.(event); }
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
  assert.equal(buttonsCreated, 15);
  element('sound-toggle').click();
  assert.equal(data.get('vocoby-sound'), 'off');
  assert.equal(element('sound-toggle').getAttribute('aria-pressed'), 'false');
  element('sound-toggle').click();
  assert.equal(data.get('vocoby-sound'), 'on');
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
  assert.match(element('celebration').textContent, /3 пары подряд/);
  assert.equal(element('celebration').hidden, false);
  releaseNext(); await wait(20);
  assert.equal(left.filter(button => !button.disabled).length, 5);
  assert.equal(buttonsCreated, 15);
  await match(left.find(button => !button.disabled));
  assert.equal(element('progress-count').textContent, '4 / 12');
  assert.equal(buttonsCreated, 15);
  assert.ok(element('level').children.some(option => option.value === 'most-1000' && option.text === '1000 сложных слов'));
  element('level').value = 'most-1000';
  element('level').listeners.change();
  await wait(20);
  assert.equal(element('progress-count').textContent, '0 / 6', 'collection has independent progress');
  assert.equal(element('celebration').hidden, true);
  assert.equal(element('selection-summary').textContent, '1000 сложных слов · A–Z');
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
  assert.equal(element('progress-count').textContent, '1 / 6', 'review preserves learned words');
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
  element('level').value = 'A2';
  element('level').listeners.change();
  element('letter').value = 'a';
  element('letter').listeners.change();
  assert.deepEqual(JSON.parse(data.get('vocoby-selection-v1')), { level: 'A2', letter: 'a' },
    'selection is saved immediately when changed');
  await wait(20);
  await match(left.find(button => !button.disabled));
  assert.equal(element('progress-count').textContent, '2 / 6');
  const learnedWords = JSON.parse(data.get('vocoby-chunk-v2:a2-user/chunks/0.json:r1'));
  elements.clear();
  await import('../app.js?restore-selection');
  await wait(20);
  assert.equal(element('level').value, 'A2');
  assert.equal(element('letter').value, 'a');
  assert.equal(element('progress-count').textContent, '2 / 6', 'reload resumes A2 progress');
  assert.ok(element('english').children.filter(button => !button.disabled)
    .every(button => !learnedWords.some(id => button.textContent === `en-${id}`)),
  'learned A2 words are not shown again');
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
    focus() { document.activeElement = this; }
    click(event) { if (!this.disabled) this.listeners.click?.(event); }
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
  left[0].click({ detail: 1 });
  assert.equal(document.activeElement, undefined, 'a tap does not focus another card');
  left[0].click({ detail: 1 });
  left[0].click({ detail: 0 });
  assert.ok(right.includes(document.activeElement), 'keyboard selection focuses the translation column');
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

  const originalRandom = Math.random;
  Math.random = () => 0.999;
  window.confirm = () => true;
  element('restart').click();
  await new Promise(resolve => setTimeout(resolve, 20));
  left[0].click();
  right.find(button => button.textContent === 'ru-0').click();
  left[1].click({ detail: 1 });
  const held = right.find(button => button.textContent === 'ru-1');
  held.listeners.pointerdown();
  // Reproduce a reshuffle between pointerdown and click deterministically.
  Math.random = () => 0;
  try {
    await new Promise(resolve => setTimeout(resolve, 450));
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(held.textContent, 'ru-2');
  assert.equal(held.disabled, false);
  held.click({ detail: 1 });
  assert.equal(left[1].getAttribute('aria-pressed'), 'true', 'a moved card cannot consume the selection');
  const translation = right.find(button => button.textContent === 'ru-1');
  translation.listeners.pointerdown();
  translation.click({ detail: 1 });
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(element('progress-count').textContent, '3 / 3', 'review does not erase prior progress');
  assert.equal(element('session-count').textContent, 2);
  // Only w-2 remains a lesson task; the other two pairs are neutral helpers.
  const matchText = async text => {
    left.find(button => button.textContent === text).click();
    right.find(button => button.textContent === text.replace('en-', 'ru-')).click();
    await new Promise(resolve => setTimeout(resolve, 450));
  };
  left.find(button => button.textContent === 'en-2').click();
  right.find(button => button.textContent === 'ru-0').click();
  await new Promise(resolve => setTimeout(resolve, 380));
  await matchText('en-2');
  assert.equal(element('lesson-summary').hidden, true, 'last mistaken word still needs a retry');
  assert.equal(left.filter(button => !button.disabled).length, 3, 'retry appears with two support pairs');
  assert.equal(element('session-count').textContent, 2);
  await matchText('en-0');
  assert.equal(element('session-count').textContent, 2, 'helpers never increase the lesson score');
  assert.equal(left.filter(button => !button.disabled).length, 3);
  await matchText('en-2');
  assert.equal(element('lesson-summary').hidden, false, 'helpers do not delay completion');
  assert.equal(element('session-count').textContent, 3);
  assert.match(element('lesson-result').textContent, /Слов: 3. 2.*1/);
});


test('choice and typing share progress, persist settings and cancel stale pair feedback', async () => {
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
    focus() { document.activeElement = this; }
    click(event) { if (!this.disabled) this.listeners.click?.(event); }
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

  data.set('vocoby-view', 'sphere'); // Removed view falls back to pairs.
  await import('../app.js?exercise-modes');
  const wait = () => new Promise(resolve => setTimeout(resolve, 30));
  await wait();
  assert.equal(element('board-viewport').hidden, false);
  element('view-choice').click();
  await wait();
  assert.equal(element('board-viewport').hidden, true);
  assert.equal(element('choices').hidden, false);
  assert.equal(element('choices').children.filter(button => !button.hidden).length, 3);
  const prompt = element('prompt-word').textContent;
  const choices = element('choices').children;
  choices.find(button => button.textContent !== prompt.replace('en-', 'ru-')).click();
  assert.equal(element('progress-count').textContent, '0 / 3');
  assert.ok(choices.filter(button => !button.hidden).every(button => !button.disabled), 'wrong answer allows another attempt');
  assert.equal(element('next-question').hidden, true);
  await new Promise(resolve => setTimeout(resolve, 1450));
  assert.equal(element('prompt-word').textContent, prompt, 'wrong answer never advances automatically');
  assert.equal(element('progress-count').textContent, '0 / 3');
  const wrongChoice = choices.find(button => button.textContent !== prompt.replace('en-', 'ru-'));
  wrongChoice.click();
  assert.equal(wrongChoice.className, 'word choice-wrong');
  assert.equal(element('prompt-word').textContent, prompt, 'repeated errors keep the same question');
  const nextPrompt = element('prompt-word').textContent;
  choices.find(button => button.textContent === nextPrompt.replace('en-', 'ru-')).click();
  assert.equal(element('progress-count').textContent, '0 / 3', 'answer after error waits for a clean retry');
  assert.ok(choices.every(button => button.disabled));
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.notEqual(element('prompt-word').textContent, nextPrompt);
  element('view-typing').click();
  await wait();
  element('direction').value = 'ru-en';
  element('direction').listeners.change();
  await wait();
  assert.equal(element('prompt-word').getAttribute('lang'), 'ru');
  const answer = element('prompt-word').textContent.replace('ru-', 'en-');
  const submit = value => {
    element('answer-input').value = value;
    element('answer-form').listeners.submit({ preventDefault() {} });
  };
  submit(answer.replace('en', 'em'));
  assert.equal(element('progress-count').textContent, '0 / 3');
  element('tolerance').value = 'typo';
  element('tolerance').listeners.change();
  await wait();
  submit(answer.replace('en', 'em'));
  assert.equal(element('progress-count').textContent, '0 / 3', 'typo schedules a clean retry');
  assert.match(element('answer-feedback').textContent, /опечаткой/);
  submit(answer);
  assert.equal(element('session-count').textContent, 0, 'repeat submit cannot count twice');
  assert.equal(element('next-question').hidden, true);
  await new Promise(resolve => setTimeout(resolve, 1450));
  assert.notEqual(element('prompt-word').textContent.replace('ru-', 'en-'), answer);
  assert.equal(element('answer-input').value, '');
  assert.equal(document.activeElement, element('answer-input'));
  const revealed = element('prompt-word').textContent;
  element('show-answer').click();
  assert.equal(element('progress-count').textContent, '0 / 3');
  element('next-question').click();
  await wait();
  assert.notEqual(element('prompt-word').textContent, revealed);
  // Finish the remaining word, then both retries from this short collection.
  for (let i = 1; i <= 3; i++) {
    submit(element('prompt-word').textContent.replace('ru-', 'en-'));
    assert.equal(element('progress-count').textContent, `${i} / 3`);
    await new Promise(resolve => setTimeout(resolve, 550));
  }
  assert.equal(element('lesson-summary').hidden, false);
  assert.match(element('lesson-result').textContent, /Слов: 3. 1.*2/);
  assert.equal(document.activeElement, element('continue-lesson'));
  assert.equal(element('check-answer').disabled, true);
  assert.equal(data.get('vocoby-view'), 'typing');
  assert.equal(data.get('vocoby-direction'), 'ru-en');
  assert.equal(data.get('vocoby-tolerance'), 'typo');
  element('continue-lesson').click();
  await wait();
  assert.equal(element('progress-count').textContent, '3 / 3');
  assert.equal(element('lesson-summary').hidden, true);
  assert.equal(element('check-answer').disabled, false, 'learned words can be reviewed');
  submit(element('prompt-word').textContent.replace('ru-', 'en-'));
  assert.equal(element('progress-count').textContent, '3 / 3', 'review never inflates progress');
  element('view-columns').click();
  await new Promise(resolve => setTimeout(resolve, 550));
  element('restart').click();
  await wait();
  const left = element('english').children.find(button => !button.disabled);
  left.click();
  element('russian').children.find(button => button.textContent === left.textContent.replace('en-', 'ru-')).click();
  element('view-choice').click();
  await new Promise(resolve => setTimeout(resolve, 460));
  assert.equal(element('session-count').textContent, 0, 'stale pair feedback cannot affect the next lesson');
  assert.equal(element('progress-count').textContent, '3 / 3');
  elements.clear();
  await import('../app.js?exercise-restore');
  await wait();
  assert.equal(element('view-choice').getAttribute('aria-pressed'), 'true');
  assert.equal(element('direction').value, 'ru-en');
  assert.equal(element('tolerance').value, 'typo');
  assert.equal(element('progress-count').textContent, '3 / 3', 'review preserves progress after reload');
});
