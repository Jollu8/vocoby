import { shuffle } from './engine.js';
import { ChunkStream, ProgressStore } from './dictionary.js';
const $ = id => document.getElementById(id);
function levelLabel(level) {
  if (level === 'most-1000') return 'Most 1000';
  if (level === 'ungraded') return 'Без уровня';
  if (['A1', 'A2', 'B1', 'B2'].includes(level)) {
    const count = manifest.chunks.filter(chunk => chunk.level === level)
      .reduce((sum, chunk) => sum + chunk.count, 0);
    return `${level} · ${count} слов`;
  }
  return level;
}
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw Error(); }, setItem() { throw Error(); } }; }
const progress = new ProgressStore(storage);
let boardView = 'columns';
try { if (storage.getItem('vocoby-view') === 'sphere') boardView = 'sphere'; } catch {}
let manifest, most1000, chunks = [], stream, active = Array(5).fill(null), right = Array(5).fill(null);
let queuedMatch = null;
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
    button.setAttribute('lang', side === 'english' ? 'en' : 'ru');
    button.addEventListener('click', () => {
      const word = (side === 'english' ? active : right)[slot];
      if (word) void choose(side, word.id);
    });
    $(side).append(button);
    return button;
  });
}
// Separate, non-overlapping positions for desktop and narrow screens.
const spherePositions = [[36, 20], [64, 20], [22, 40], [50, 40], [78, 40],
  [22, 60], [50, 60], [78, 60], [36, 80], [64, 80]];
const mobileSpherePositions = [[50, 10], [30, 26], [70, 26], [30, 42], [70, 42],
  [30, 58], [70, 58], [30, 74], [70, 74], [50, 90]];
function setDomePosition(button, x, y, prefix) {
  const nx = (x - 50) / 50, ny = (y - 50) / 50;
  const depth = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  button.style.setProperty(`${prefix}-depth`, `${(depth * 32).toFixed(2)}px`);
  button.style.setProperty(`${prefix}-scale`, (0.88 + depth * 0.1).toFixed(3));
  button.style.setProperty(`${prefix}-rx`, `${(-ny * 14).toFixed(2)}deg`);
  button.style.setProperty(`${prefix}-ry`, `${(nx * 16).toFixed(2)}deg`);
}
function scatterWords() {
  const positions = shuffle(Array.from({ length: 10 }, (_, index) => index));
  [...cards.english, ...cards.russian].forEach((button, index) => {
    const slot = positions[index];
    const [x, y] = spherePositions[slot];
    button.style.setProperty('--sphere-x', `${x}%`);
    button.style.setProperty('--sphere-y', `${y}%`);
    const [mobileX, mobileY] = mobileSpherePositions[slot];
    button.style.setProperty('--sphere-mobile-x', `${mobileX}%`);
    button.style.setProperty('--sphere-mobile-y', `${mobileY}%`);
    setDomePosition(button, x, y, '--dome');
    setDomePosition(button, mobileX, mobileY, '--mobile-dome');
  });
}
function setBoardView(view) {
  boardView = view;
  resetDomeTilt();
  $('game').className = `game${view === 'sphere' ? ' sphere-fullscreen' : ''}`;
  $('board').className = `board${view === 'sphere' ? ' sphere' : ''}`;
  $('column-labels').hidden = view === 'sphere';
  const viewport = $('board-viewport');
  viewport.scrollLeft = view === 'sphere' ? Math.max(0, ((viewport.scrollWidth || 0) - (viewport.clientWidth || 0)) / 2) : 0;
  viewport.scrollTop = view === 'sphere' ? Math.max(0, ((viewport.scrollHeight || 0) - (viewport.clientHeight || 0)) / 2) : 0;
  for (const name of ['columns', 'sphere']) {
    $(`view-${name}`).setAttribute('aria-pressed', String(name === view));
  }
  try { storage.setItem('vocoby-view', view); } catch {}
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function resetDomeTilt() {
  $('board').style.setProperty('--tilt-x', '0deg');
  $('board').style.setProperty('--tilt-y', '0deg');
}
function tiltDome(event) {
  if (boardView !== 'sphere' || reducedMotion.matches || selected || busy) return;
  const bounds = $('board').getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
  const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
  $('board').style.setProperty('--tilt-x', `${(-y * 3).toFixed(2)}deg`);
  $('board').style.setProperty('--tilt-y', `${(x * 3).toFixed(2)}deg`);
}
$('board').addEventListener('pointermove', tiltDome);
for (const event of ['pointerleave', 'pointerup', 'pointercancel']) {
  $('board').addEventListener(event, resetDomeTilt);
}
reducedMotion.addEventListener('change', resetDomeTilt);
const viewport = $('board-viewport');
let drag = null, dragged = false;
viewport.addEventListener('pointerdown', event => {
  if (boardView !== 'sphere' || event.button !== 0 || event.isPrimary === false) return;
  dragged = false;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
    left: viewport.scrollLeft, top: viewport.scrollTop };
});
viewport.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!dragged && Math.hypot(dx, dy) < 6) return;
  if (!dragged) viewport.setPointerCapture(event.pointerId);
  dragged = true;
  viewport.style.cursor = 'grabbing';
  viewport.scrollLeft = drag.left - dx;
  viewport.scrollTop = drag.top - dy;
});
function stopDragging(event) {
  if (!drag || event.pointerId !== drag.id) return;
  drag = null;
  viewport.style.cursor = '';
  if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  viewport.addEventListener(name, stopDragging);
}
viewport.addEventListener('click', event => {
  if (dragged && event.detail !== 0) {
    event.preventDefault();
    event.stopPropagation();
    dragged = false;
  }
}, true);
scatterWords();
setBoardView(boardView);
$('view-columns').addEventListener('click', () => setBoardView('columns'));
$('view-sphere').addEventListener('click', () => setBoardView('sphere'));
function exitSphere() {
  setBoardView('columns');
  $('view-sphere').focus?.();
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && boardView === 'sphere') exitSphere();
});
function render() {
  for (const [side, values] of [['english', active], ['russian', right]]) {
    values.forEach((word, slot) => {
      const button = cards[side][slot];
      const text = word ? side === 'english' ? word.en : word.ru : '';
      if (button.textContent !== text) button.textContent = text;
      button.className = `word${word ? '' : ' empty'}${text.length > 20 ? ' long' : ''}`;
      button.disabled = !word || !!queuedMatch || feedback.some(item => item.side === side && item.id === word.id);
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
  if (boardView === 'sphere') scatterWords();
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
  pumping = null; selected = null; queuedMatch = null; busy = false; feedback = [];
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
  if (queuedMatch || feedback.some(item => item.side === side && item.id === id)) return;
  if (!selected || selected.side === side) {
    selected = selected?.id === id && selected.side === side ? null : { side, id };
    render();
    if (selected) focusFirstAvailable(side === 'english' ? 'russian' : 'english');
    return;
  }
  if (busy) {
    queuedMatch = { side, id };
    render();
    return;
  }
  const first = selected; selected = null; busy = true;
  const correct = first.id === id, token = generation;
  feedback = [{ ...first, correct }, { side, id, correct }];
  render();
  $('status').textContent = correct ? 'Верно! Ещё одно слово в копилке.' : 'Пока не совпало. Попробуйте другую пару.';
  await new Promise(resolve => setTimeout(resolve, correct ? 420 : 350));
  if (token !== generation) return;
  feedback = [];
  busy = false;
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
    playQueuedMatch();
    if (pumping) await pumping;
    if (token !== generation) return;
    void replenish();
  } else {
    render();
    playQueuedMatch();
  }
}
function playQueuedMatch() {
  const next = queuedMatch;
  queuedMatch = null;
  if (next) void choose(next.side, next.id);
}
async function init() {
  try {
    if (globalThis.navigator?.serviceWorker) void navigator.serviceWorker.register('./sw.js');
    const [base, most, a1, a2, b1, b2] = await Promise.all([
      getJSON('data/manifest.json'), getJSON('data/most-1000/manifest.json'),
      getJSON('data/a1-vocabden/manifest.json'), getJSON('data/a2-user/manifest.json'),
      getJSON('data/b1-user/manifest.json'), getJSON('data/b2-user/manifest.json')
    ]);
    // Replace the legacy A1–B2 collections; keep other levels and their progress keys.
    const currentChunks = [
      ...base.chunks.filter(chunk => !['A1', 'A2', 'B1', 'B2'].includes(chunk.level)),
      ...a1.chunks.map(chunk => ({ ...chunk, path: `a1-vocabden/${chunk.path}` })),
      ...a2.chunks.map(chunk => ({ ...chunk, path: `a2-user/${chunk.path}` })),
      ...b1.chunks.map(chunk => ({ ...chunk, path: `b1-user/${chunk.path}` })),
      ...b2.chunks.map(chunk => ({ ...chunk, path: `b2-user/${chunk.path}` }))
    ];
    manifest = { ...base, chunks: currentChunks,
      total: currentChunks.reduce((sum, chunk) => sum + chunk.count, 0) };
    most1000 = most;
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
