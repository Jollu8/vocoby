import { shuffle } from './engine.js';
import { ChunkStream, ProgressStore } from './dictionary.js';
const $ = id => document.getElementById(id);
const levelLabel = level => level === 'most-1000' ? 'Most 1000' : level === 'ungraded' ? 'Без уровня' : level === 'A1' ? 'A1 · база 400' : level === 'A2' ? 'A2 · база 400' : level === 'B1' ? 'B1 · база 400' : level === 'B2' ? 'B2 · база 400' : level;
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw Error(); }, setItem() { throw Error(); } }; }
const progress = new ProgressStore(storage);
let manifest, most1000, chunks = [], stream, active = Array(5).fill(null), right = Array(5).fill(null);
let selected = null, busy = false, generation = 0, session = 0, completed = 0, total = 0;
let pumping = null, saveScheduled = false, feedback = [];
const statsKey = 'vocoby-study-stats-v1';
$('year').textContent = new Date().getFullYear();
const mobileLayout = matchMedia('(max-width: 760px)');
function syncSettingsLayout() { $('collection-settings').open = !mobileLayout.matches; }
syncSettingsLayout();
mobileLayout.addEventListener('change', syncSettingsLayout);
function flushProgress() {
  progress.flush();
  $('local-note').textContent = progress.failed ? 'Прогресс только до закрытия страницы' : 'Прогресс сохранён';
}
function saveLater() {
  if (saveScheduled) return;
  $('local-note').textContent = 'Сохраняем прогресс…';
  saveScheduled = true;
  const save = () => { saveScheduled = false; flushProgress(); };
  if ('requestIdleCallback' in window) window.requestIdleCallback(save, { timeout: 1000 });
  else setTimeout(save, 0);
}
function readStats() {
  try {
    const value = JSON.parse(storage.getItem(statsKey) || '{}');
    return { streak: Number.isInteger(value.streak) ? value.streak : 0, lastDay: typeof value.lastDay === 'string' ? value.lastDay : '' };
  } catch { return { streak: 0, lastDay: '' }; }
}
function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function yesterday(day) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function updateStats() {
  const learned = manifest ? [...manifest.chunks, ...most1000.chunks].reduce((sum, chunk) => sum + progress.count(chunk), 0) : 0;
  $('learned-total').textContent = learned;
  $('streak-count').textContent = readStats().streak;
}
function recordStudyDay() {
  const today = localDay();
  const stats = readStats();
  if (stats.lastDay !== today) {
    stats.streak = stats.lastDay === yesterday(today) ? stats.streak + 1 : 1;
    stats.lastDay = today;
    try { storage.setItem(statsKey, JSON.stringify(stats)); } catch { progress.failed = true; }
  }
  updateStats();
}
function focusFirstAvailable(side) {
  const button = cards[side].find(candidate => !candidate.disabled);
  if (button && typeof button.focus === 'function') button.focus();
}
window.addEventListener('pagehide', flushProgress);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushProgress(); });
async function getJSON(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function updateProgress() {
  $('progress-count').textContent = `${completed} / ${total}`;
  $('progress').max = total || 1;
  $('progress').value = completed;
  $('collection-count').textContent = `Слов в подборке: ${total}`;
  $('session-count').textContent = session;
  const level = $('level').value === 'all' ? 'Все уровни' : levelLabel($('level').value);
  const letter = $('letter').value === 'all' ? 'A–Z' : $('letter').value.toUpperCase();
  $('selection-summary').textContent = `${level} · ${letter}`;
  updateStats();
}
// Create ten buttons once; selecting a card never rebuilds the board.
const cards = {};
for (const side of ['english', 'russian']) {
  cards[side] = Array.from({ length: 5 }, (_, slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => {
      const word = (side === 'english' ? active : right)[slot];
      if (word) void choose(side, word.id);
    });
    $(side).append(button);
    return button;
  });
}
function render() {
  for (const [side, values] of [['english', active], ['russian', right]]) {
    values.forEach((word, slot) => {
      const button = cards[side][slot];
      const text = word ? side === 'english' ? word.en : word.ru : '';
      if (button.textContent !== text) button.textContent = text;
      button.className = `word${word ? '' : ' empty'}${text.length > 20 ? ' long' : ''}`;
      button.disabled = !word || busy;
      const isSelected = !!word && selected?.side === side && selected.id === word.id;
      button.setAttribute('aria-pressed', String(isSelected));
      if (isSelected) button.classList.add('selected');
      const state = feedback.find(item => item.side === side && item.id === word?.id);
      if (state) button.classList.add(state.correct ? 'correct' : 'wrong');
    });
  }
  updateProgress();
}
function readyMessage() {
  $('status').textContent = active.some(Boolean)
    ? 'Выберите слово и подходящий перевод.'
    : chunks.length ? 'Подборка пройдена! Повторите её или выберите другую.' : 'В этой подборке пока нет слов.';
}
function showError() {
  $('status').textContent = 'Не удалось загрузить новые слова. Доступные пары можно продолжать собирать.';
  $('retry').hidden = false;
}
function syncRight() {
  // Shuffle the whole translation column so a replacement's position isn't a hint.
  right = shuffle(active);
}
function replenish() {
  if (pumping) return pumping;
  const current = stream, token = generation;
  const work = async () => {
    try {
      for (let slot = 0; slot < active.length; slot++) {
        if (active[slot]) continue;
        await current.prepare();
        if (token !== generation) return;
        active[slot] = current.take(active);
        if (active[slot]) syncRight();
        render();
        // Do not scan other chunks to resolve identical translations.
        if (!active[slot] && !current.done) break;
      }
      if (token !== generation) return;
      updateProgress(); saveLater();
      $('retry').hidden = true;
      if (!busy) readyMessage();
    } catch {
      if (token === generation) showError();
    } finally {
      if (token === generation) pumping = null;
    }
  };
  pumping = Promise.resolve().then(work);
  return pumping;
}
function start() {
  stream?.close();
  generation++;
  pumping = null; selected = null; busy = false; feedback = [];
  active = Array(5).fill(null); right = Array(5).fill(null);
  const collection = $('level').value === 'most-1000' ? most1000 : manifest;
  chunks = collection.chunks.filter(chunk => ($('level').value === 'all' || chunk.level === $('level').value)
    && ($('letter').value === 'all' || chunk.letter === $('letter').value));
  total = chunks.reduce((sum, chunk) => sum + chunk.count, 0);
  completed = chunks.reduce((sum, chunk) => sum + progress.count(chunk), 0);
  stream = new ChunkStream(chunks, progress, getJSON, count => { completed += count; });
  $('retry').hidden = true; $('status').textContent = 'Загружаем слова…'; render();
  void replenish();
}
async function choose(side, id) {
  if (busy) return;
  if (!selected || selected.side === side) {
    selected = selected?.id === id && selected.side === side ? null : { side, id };
    render();
    if (selected) focusFirstAvailable(side === 'english' ? 'russian' : 'english');
    return;
  }
  const first = selected; selected = null; busy = true;
  const correct = first.id === id, token = generation;
  feedback = [{ ...first, correct }, { side, id, correct }];
  render();
  $('status').textContent = correct ? 'Верно! Ещё одно слово в копилке.' : 'Пока не совпало. Попробуйте другую пару.';
  await new Promise(resolve => setTimeout(resolve, correct ? 420 : 350));
  if (token !== generation) return;
  feedback = []; busy = false;
  if (correct) {
    const slot = active.findIndex(word => word?.id === id);
    const word = active[slot];
    completed += progress.add(word.chunk, id); session++; saveLater();
    recordStudyDay();
    active[slot] = null;
    right[right.findIndex(word => word?.id === id)] = null;
    // Synchronous replacement from the small buffer, without waiting for fetch.
    active[slot] = stream.take(active);
    syncRight();
    render();
    if (pumping) await pumping;
    if (token !== generation) return;
    void replenish();
  } else render();
}
async function init() {
  try {
    if (globalThis.navigator?.serviceWorker) void navigator.serviceWorker.register('./sw.js');
    [manifest, most1000] = await Promise.all([
      getJSON('data/manifest.json'), getJSON('data/most-1000/manifest.json')
    ]);
    most1000.chunks = most1000.chunks.map(chunk => ({
      ...chunk, level: 'most-1000', path: `most-1000/${chunk.path}`
    }));
    $('total-count').textContent = manifest.total;
    for (const level of ['most-1000', 'A1', 'A2', 'B1', 'B2', 'ungraded']) {
      if (level === 'most-1000' || manifest.levels.includes(level)) {
        $('level').add(new Option(levelLabel(level), level));
      }
    }
    for (const letter of [...new Set([...manifest.chunks, ...most1000.chunks].map(chunk => chunk.letter))].sort()) $('letter').add(new Option(letter.toUpperCase(), letter));
    if (manifest.levels.includes('A1')) $('level').value = 'A1';
    start();
  } catch { showError(); }
}
$('level').addEventListener('change', () => manifest && start());
$('letter').addEventListener('change', () => manifest && start());
$('restart').addEventListener('click', () => {
  if (!manifest || !window.confirm('Сбросить прогресс этой подборки?')) return;
  progress.reset(chunks); start();
});
$('retry').addEventListener('click', () => manifest ? replenish() : init());
init();
