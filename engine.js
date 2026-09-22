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
