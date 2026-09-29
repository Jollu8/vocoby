export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Avoid ambiguous cards: only one instance of a displayed translation or word.
export function takeNext(queue, active) {
  const index = queue.findIndex(word => !active.some(other =>
    other && (other.en === word.en || other.ru === word.ru)));
  return index === -1 ? null : queue.splice(index, 1)[0];
}

export function normalizeAnswer(value) {
  return value.normalize('NFC').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

export function answerVariants(value) {
  return [...new Set([value, ...value.split(/[,;/]/)].map(normalizeAnswer).filter(Boolean))];
}

// Linear, bounded comparison: a single edit or adjacent transposition.
function oneTypo(a, b) {
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function checkAnswer(input, expected, allowTypo = false) {
  const value = normalizeAnswer(input);
  const variants = answerVariants(expected);
  if (!value) return { correct: false, typo: false };
  if (variants.includes(value)) return { correct: true, typo: false };
  const typo = allowTypo && variants.some(answer => oneTypo(value, answer));
  return { correct: typo, typo };
}

export function makeChoices(word, pool, direction, random = Math.random) {
  const from = direction === 'en-ru' ? 'en' : 'ru';
  const to = from === 'en' ? 'ru' : 'en';
  const equivalent = pool.filter(other => answerVariants(other[from]).some(value => answerVariants(word[from]).includes(value)));
  const excluded = new Set([word, ...equivalent].flatMap(other => answerVariants(other[to])));
  const candidates = shuffle(pool, random);
  const result = [word[to]];
  for (const candidate of candidates) {
    const variants = answerVariants(candidate[to]);
    if (variants.some(value => excluded.has(value))) continue;
    result.push(candidate[to]);
    variants.forEach(value => excluded.add(value));
    if (result.length === 5) break;
  }
  return shuffle(result, random);
}
