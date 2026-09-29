import { shuffle, checkAnswer, makeChoices } from './engine.js';
import { ChunkStream, ProgressStore } from './dictionary.js';
import { Sounds } from './sounds.js';
import { StudySession, currentStreak } from './session.js';
const $ = id => document.getElementById(id);
function levelLabel(level) {
  if (level === 'most-1000') return '1000 сложных слов';
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
const sounds = new Sounds(storage);
function updateSoundButton() {
  $('sound-toggle').setAttribute('aria-pressed', String(sounds.enabled));
  $('sound-toggle').setAttribute('aria-label', sounds.enabled ? 'Выключить звуки' : 'Включить звуки');
  $('sound-toggle').setAttribute('title', sounds.enabled ? 'Выключить звуки' : 'Включить звуки');
}
updateSoundButton();
$('sound-toggle').addEventListener('click', () => { sounds.toggle(); updateSoundButton(); });
let pairStreak = 0, celebrationTimer;
function clearCelebration() {
  clearTimeout(celebrationTimer);
  $('celebration').hidden = true;
  $('celebration').textContent = '';
}
function celebrate() {
  if (![3, 5].includes(pairStreak) && (pairStreak < 10 || pairStreak % 5 !== 0)) return;
  clearCelebration();
  $('celebration').textContent = pairStreak === 3 ? '✦ 3 пары подряд! Отличный старт!' :
    pairStreak === 5 ? '✦ 5 пар подряд! Так держать!' : `✦ ${pairStreak} пар подряд! Блестяще!`;
  $('celebration').hidden = false;
  celebrationTimer = setTimeout(clearCelebration, 2800);
}
let boardView = 'columns';
try { const saved = storage.getItem('vocoby-view'); if (['choice', 'typing'].includes(saved)) boardView = saved; } catch {}
let advanceTimer, autoAdvancing = false;
let direction = 'en-ru', tolerance = 'strict', question = null, options = [], answerPool = [], answered = false;
try { direction = storage.getItem('vocoby-direction') === 'ru-en' ? 'ru-en' : 'en-ru'; tolerance = storage.getItem('vocoby-tolerance') === 'typo' ? 'typo' : 'strict'; } catch {}
let manifest, most1000, chunks = [], stream, active = Array(5).fill(null), right = Array(5).fill(null);
let queuedMatch = null;
let reviewing = false, lessonEnded = false;
let selected = null, busy = false, generation = 0, completed = 0, total = 0;
let pumping = null, saveScheduled = false, feedback = [];
const statsKey = 'vocoby-study-stats-v1';
const selectionKey = 'vocoby-selection-v1';
function saveSelection() {
  try {
    storage.setItem(selectionKey, JSON.stringify({ level: $('level').value, letter: $('letter').value }));
  } catch { progress.failed = true; }
}
function restoreSelection() {
  try {
    const selection = JSON.parse(storage.getItem(selectionKey));
    for (const id of ['level', 'letter']) {
      if (selection && [...$(id).children].some(option => option.value === selection[id])) {
        $(id).value = selection[id];
      }
    }
  } catch {}
}
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
  $('streak-count').textContent = currentStreak(readStats(), localDay(), yesterday(localDay()));
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
  $('session-count').textContent = stream?.finished.size || 0;
  $('lesson-progress').textContent = `${reviewing ? 'Повторение' : 'Тренировка'} · закреплено ${stream?.finished.size || 0} · до 15 слов`;
  const level = $('level').value === 'all' ? 'Все уровни' : levelLabel($('level').value);
  const letter = $('letter').value === 'all' ? 'A–Z' : $('letter').value.toUpperCase();
  $('selection-summary').textContent = `${level} · ${letter}${boardView === 'columns' ? '' : direction === 'en-ru' ? ' · EN → RU' : ' · RU → EN'}`;
  updateStats();
}
// Create ten buttons once; selecting a card never rebuilds the board.
const cards = {};
for (const side of ['english', 'russian']) {
  cards[side] = Array.from({ length: 5 }, (_, slot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('lang', side === 'english' ? 'en' : 'ru');
    let pressed = null;
    button.addEventListener('pointerdown', () => {
      const word = (side === 'english' ? active : right)[slot];
      pressed = { id: word?.id, generation };
    });
    button.addEventListener('pointercancel', () => { pressed = null; });
    button.addEventListener('click', event => {
      const word = (side === 'english' ? active : right)[slot];
      const start = pressed;
      pressed = null;
      const keyboard = event?.detail === 0;
      // A completed pair can replace or move this card while a finger is down.
      if (!keyboard && start && (start.generation !== generation || start.id !== word?.id)) return;
      if (word) void choose(side, word.id, keyboard);
    });
    $(side).append(button);
    return button;
  });
}
function setBoardView(view) {
  boardView = view;
  $('game').setAttribute('data-view', view);
  $('game-instructions').textContent = { columns: 'Выберите слово и найдите его перевод.', choice: 'Выберите правильный перевод из предложенных.', typing: 'Введите перевод и нажмите Enter или «Проверить».' }[view];
  $('column-labels').hidden = view !== 'columns';
  $('board-viewport').hidden = view !== 'columns';
  $('exercise').hidden = view === 'columns';
  $('exercise-settings').hidden = view === 'columns';
  $('tolerance-field').hidden = view !== 'typing';
  $('choices').hidden = view !== 'choice';
  $('answer-form').hidden = view !== 'typing';
  $('game-title').textContent = { columns: 'Найдите пару', choice: 'Выберите перевод', typing: 'Напишите перевод' }[view];
  for (const name of ['columns', 'choice', 'typing']) $(`view-${name}`).setAttribute('aria-pressed', String(name === view));
  try { storage.setItem('vocoby-view', view); } catch {}
}
for (const view of ['columns', 'choice', 'typing']) {
  $(`view-${view}`).addEventListener('click', () => {
    if (boardView === view) return;
    setBoardView(view);
    if (manifest) start(reviewing);
  });
}
$('direction').value = direction;
$('tolerance').value = tolerance;
for (const name of ['direction', 'tolerance']) $(name).addEventListener('change', () => {
  direction = $('direction').value;
  tolerance = $('tolerance').value;
  try { storage.setItem(`vocoby-${name}`, $(name).value); } catch {}
  if (manifest) start(reviewing);
});
const choiceButtons = Array.from({ length: 5 }, () => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'word';
  let pressed = null;
  button.addEventListener('pointerdown', () => { pressed = { question, generation }; });
  button.addEventListener('pointercancel', () => { pressed = null; });
  button.addEventListener('click', event => {
    const start = pressed; pressed = null;
    if (event?.detail !== 0 && start && (start.question !== question || start.generation !== generation)) return;
    submitAnswer(button.textContent);
  });
  $('choices').append(button);
  return button;
});
$('answer-form').addEventListener('submit', event => {
  event.preventDefault();
  submitAnswer($('answer-input').value);
});
$('show-answer').addEventListener('click', () => {
  if (!question || answered) return;
  stream.mistake(question);
  stream.answer(question);
  answered = true;
  $('answer-feedback').textContent = `Перевод: ${question[direction === 'en-ru' ? 'ru' : 'en']}. Слово вернётся через несколько вопросов или в конце тренировки.`;
  render(); $('next-question').focus();
});
$('next-question').addEventListener('click', nextQuestion);
function nextQuestion() {
  if (!question || !answered) return;
  const slot = active.findIndex(word => word?.id === question.id);
  active[slot] = null;
  active[slot] = stream.take(active);
  question = null; answered = false; autoAdvancing = false;
  syncRight(); render(); readyMessage();
  void replenish();
  if (lessonEnded) return;
  if (boardView === 'typing') $('answer-input').focus();
  else choiceButtons.find(button => !button.disabled)?.focus();
}
function renderExercise() {
  if (boardView === 'columns') return;
  const word = active.find(Boolean);
  if (word && !question) {
    question = word;
    options = makeChoices(word, [...active.filter(Boolean), ...answerPool], direction);
    $('answer-input').value = '';
    $('answer-input').setAttribute('aria-invalid', 'false');
    $('answer-feedback').textContent = '';
  }
  const from = direction === 'en-ru' ? 'en' : 'ru';
  const to = from === 'en' ? 'ru' : 'en';
  $('prompt-word').textContent = question?.[from] || 'Нет слов';
  $('prompt-word').setAttribute('lang', from);
  $('answer-input').setAttribute('lang', to);
  $('show-answer').hidden = boardView !== 'typing' || !question || answered;
  $('answer-input').disabled = !question || answered;
  $('check-answer').disabled = !question || answered;
  $('next-question').hidden = boardView === 'choice' || !answered || autoAdvancing;
  choiceButtons.forEach((button, i) => {
    if (!answered) button.className = 'word';
    button.textContent = options[i] || '';
    button.hidden = !question || !options[i];
    button.disabled = !question || answered;
    button.setAttribute('lang', to);
  });
}
function submitAnswer(value) {
  if (boardView === 'columns' || !question || answered || !value.trim()) return;
  const expected = question[direction === 'en-ru' ? 'ru' : 'en'];
  const result = checkAnswer(value, expected, boardView === 'typing' && tolerance === 'typo');
  sounds.play(result.correct ? 'match' : 'wrong');
  if (!result.correct) {
    stream.mistake(question);
    $('answer-feedback').textContent = 'Пока неверно. Попробуйте ещё раз.';
    if (boardView === 'typing') $('answer-input').setAttribute('aria-invalid', 'true');
    else choiceButtons.forEach(button => {
      button.className = button.textContent === value ? 'word choice-wrong' : 'word';
    });
    return;
  }
  answered = true;
  autoAdvancing = true;
  $('answer-input').setAttribute('aria-invalid', 'false');
  if (result.typo) stream.mistake(question);
  const clean = stream.answer(question);
  if (clean) completed += progress.add(question.chunk, question.id);
  saveLater(); recordStudyDay();
  $('answer-feedback').textContent = result.typo ? `Зачтено с опечаткой. Правильно: ${expected}` : `Верно! ${expected}`;
  if (!clean) $('answer-feedback').textContent += ' · Повторим это слово в тренировке.';
  render();
  if (boardView === 'choice') {
    choiceButtons.forEach(button => {
      if (button.textContent === expected) button.className = 'word choice-correct';
      else button.className = 'word';
    });
  }
  const token = generation, current = question, mode = boardView;
  advanceTimer = setTimeout(() => {
    if (generation === token && question === current && boardView === mode) nextQuestion();
  }, result.typo ? 1400 : 500);
}
setBoardView(boardView);
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
  renderExercise();
  updateProgress();
}
function readyMessage() {
  $('status').setAttribute('data-state', 'ready');
  if (stream?.done && !active.some(Boolean) && stream.words.size) {
    finishLesson();
    return;
  }
  $('status').textContent = active.some(Boolean)
    ? boardView === 'columns' ? 'Выберите слово и подходящий перевод.' : boardView === 'choice' ? 'Выберите один правильный перевод.' : 'Введите один из переводов из словаря. Регистр, ё/е и пробелы не учитываются.'
    : chunks.length ? completed === total ? 'Подборка пройдена! Повторите её или выберите другую.' : 'Доступные слова закончились. Выберите режим заново, чтобы повторить пропущенные слова.' : 'В этой подборке пока нет слов.';
}
function finishLesson() {
  if (lessonEnded) return;
  lessonEnded = true;
  clearCelebration();
  $('lesson-summary').hidden = false;
  $('exercise').hidden = true;
  $('board-viewport').hidden = true;
  $('column-labels').hidden = true;
  $('lesson-result').textContent = `Слов: ${stream.words.size}. ${stream.firstTry} — верно с первой попытки, ${stream.mistakes.size} — повторили после ошибки или подсказки.`;
  $('status').textContent = 'Тренировка завершена. Можно отдохнуть или продолжить.';
  $('continue-lesson').textContent = !reviewing && completed === total ? 'Повторить подборку ↻' : 'Следующая тренировка →';
  $('continue-lesson').focus();
}
$('continue-lesson').addEventListener('click', () => start(reviewing || completed === total));
function showError() {
  $('status').setAttribute('data-state', 'error');
  $('status').textContent = 'Не удалось загрузить новые слова. Можно продолжить с уже загруженными словами.';
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
function start(review = false) {
  reviewing = review;
  lessonEnded = false;
  $('lesson-summary').hidden = true;
  setBoardView(boardView);
  clearTimeout(advanceTimer);
  autoAdvancing = false;
  pairStreak = 0;
  question = null; options = []; answered = false; answerPool = [];
  $('answer-feedback').textContent = '';
  $('answer-input').setAttribute('aria-invalid', 'false');
  clearCelebration();
  stream?.close();
  generation++;
  pumping = null; selected = null; queuedMatch = null; busy = false; feedback = [];
  active = Array(5).fill(null); right = Array(5).fill(null);
  const collection = $('level').value === 'most-1000' ? most1000 : manifest;
  chunks = collection.chunks.filter(chunk => ($('level').value === 'all' || chunk.level === $('level').value)
    && ($('letter').value === 'all' || chunk.letter === $('letter').value));
  total = chunks.reduce((sum, chunk) => sum + chunk.count, 0);
  completed = chunks.reduce((sum, chunk) => sum + progress.count(chunk), 0);
  const sourceProgress = reviewing ? { count: () => 0, get: () => new Set(), migrate() {} } : progress;
  stream = new StudySession(new ChunkStream(reviewing ? shuffle(chunks) : chunks, sourceProgress, async (path, signal) => {
    const words = await getJSON(path, signal);
    if (!signal.aborted) answerPool = [...answerPool, ...words].slice(-200);
    return reviewing ? shuffle(words) : words;
  }, count => { completed += count; }));
  $('retry').hidden = true; $('status').setAttribute('data-state', 'loading'); $('status').textContent = 'Загружаем слова…'; render();
  void replenish();
}
async function choose(side, id, keyboard = false) {
  if (queuedMatch || feedback.some(item => item.side === side && item.id === id)) return;
  if (!selected || selected.side === side) {
    sounds.play('select');
    selected = selected?.id === id && selected.side === side ? null : { side, id };
    render();
    if (selected && keyboard) focusFirstAvailable(side === 'english' ? 'russian' : 'english');
    return;
  }
  if (busy) {
    queuedMatch = { side, id };
    render();
    return;
  }
  const first = selected; selected = null; busy = true;
  const correct = first.id === id, token = generation;
  sounds.play(correct ? 'match' : 'wrong');
  if (correct) { pairStreak++; celebrate(); }
  else {
    pairStreak = 0; clearCelebration();
    for (const word of active) if (word && (word.id === first.id || word.id === id)) stream.mistake(word);
  }
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
    if (stream.answer(word)) completed += progress.add(word.chunk, id);
    saveLater();
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
    restoreSelection();
    start();
  } catch { showError(); }
}
function changeSelection() {
  if (!manifest) return;
  saveSelection();
  start();
}
$('level').addEventListener('change', changeSelection);
$('letter').addEventListener('change', changeSelection);
$('restart').addEventListener('click', () => {
  if (manifest) start(true);
});
$('retry').addEventListener('click', () => manifest ? replenish() : init());
init();
