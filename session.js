// A lesson admits at most 15 new words; retries do not consume that budget.
export class StudySession {
  constructor(stream, limit = 15) {
    this.source = stream;
    this.limit = limit;
    this.words = new Map();
    this.mistakes = new Set();
    this.failedAttempt = new Set();
    this.finished = new Set();
    this.retries = [];
    this.turn = 0;
  }
  key(word) { return `${word.chunk.path}:${word.id}`; }
  close() { this.source.close(); }
  async prepare() {
    if (this.words.size < this.limit) await this.source.prepare();
  }
  take(active) {
    const exhausted = this.words.size >= this.limit || this.source.done;
    const retry = this.retries.findIndex(item =>
      (item.due <= this.turn || (exhausted && !active.some(Boolean))) &&
      !active.some(word => word && (word.en === item.word.en || word.ru === item.word.ru)));
    if (retry !== -1) return this.retries.splice(retry, 1)[0].word;
    if (this.words.size >= this.limit) return null;
    const word = this.source.take(active);
    if (word) this.words.set(this.key(word), word);
    return word;
  }
  mistake(word) {
    const key = this.key(word);
    this.mistakes.add(key);
    this.failedAttempt.add(key);
  }
  answer(word) {
    this.turn++;
    const key = this.key(word);
    if (this.failedAttempt.delete(key)) {
      this.retries.push({ word, due: this.turn + 3 });
      return false;
    }
    this.finished.add(key);
    return true;
  }
  get firstTry() { return [...this.finished].filter(key => !this.mistakes.has(key)).length; }
  get done() { return (this.words.size >= this.limit || this.source.done) && !this.retries.length; }
}

export function currentStreak(stats, today, previousDay) {
  return stats.lastDay === today || stats.lastDay === previousDay ? stats.streak : 0;
}
