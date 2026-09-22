import { takeNext } from './engine.js';

// Progress is bounded by chunk size, never by the size of the dictionary.
export class ProgressStore {
  constructor(storage) {
    this.storage = storage;
    this.records = new Map();
    this.dirty = new Set();
    this.failed = false;
    try { this.legacy = new Set(JSON.parse(storage.getItem('vocoby-progress-v1') || '[]')); }
    catch { this.legacy = new Set(); }
  }
  key(chunk) { return `vocoby-chunk-v2:${chunk.path}:${chunk.revision}`; }
  get(chunk) {
    const key = this.key(chunk);
    if (!this.records.has(key)) {
      let ids = [];
      try {
        const value = JSON.parse(this.storage.getItem(key) || '[]');
        if (Array.isArray(value)) ids = value.filter(id => typeof id === 'string').slice(0, chunk.count);
      } catch { this.failed = true; }
      this.records.set(key, new Set(ids));
    }
    return this.records.get(key);
  }
  count(chunk) { return this.get(chunk).size; }
  add(chunk, id) {
    const ids = this.get(chunk);
    const before = ids.size;
    ids.add(id);
    this.dirty.add(this.key(chunk));
    return ids.size - before;
  }
  migrate(chunk, words) {
    const key = this.key(chunk);
    // A persisted empty record means this chunk was deliberately reset.
    let existing = false;
    try { existing = this.storage.getItem(key) !== null; } catch { this.failed = true; }
    if (!existing) for (const word of words) if (this.legacy.has(word.id)) this.add(chunk, word.id);
  }
  reset(chunks) {
    for (const chunk of chunks) {
      const key = this.key(chunk);
      this.records.set(key, new Set());
      this.dirty.add(key);
    }
    this.flush();
  }
  flush() {
    for (const key of this.dirty) {
      try {
        this.storage.setItem(key, JSON.stringify([...this.records.get(key)]));
        this.dirty.delete(key);
      } catch { this.failed = true; }
    }
  }
}

export class ChunkStream {
  constructor(chunks, progress, fetchWords, onMigrated = () => {}) {
    this.chunks = chunks.filter(chunk => progress.count(chunk) < chunk.count);
    this.progress = progress;
    this.fetchWords = fetchWords;
    this.onMigrated = onMigrated;
    this.cursor = 0;
    this.queue = [];
    this.requests = new Map();
    this.controller = new AbortController();
  }
  close() { this.controller.abort(); this.requests.clear(); }
  load(index) {
    if (!this.requests.has(index)) {
      const chunk = this.chunks[index];
      const request = this.fetchWords(`data/${chunk.path}?v=${chunk.revision}`, this.controller.signal)
        .catch(error => { this.requests.delete(index); throw error; });
      this.requests.set(index, request);
    }
    return this.requests.get(index);
  }
  async prepare() {
    while (!this.queue.length && this.cursor < this.chunks.length) {
      const index = this.cursor;
      const chunk = this.chunks[index];
      const words = await this.load(index);
      if (this.controller.signal.aborted) return;
      this.requests.delete(index);
      this.cursor++;
      const before = this.progress.count(chunk);
      this.progress.migrate(chunk, words);
      this.onMigrated(this.progress.count(chunk) - before);
      const learned = this.progress.get(chunk);
      this.queue = words.filter(word => !learned.has(word.id)).map(word => ({ ...word, chunk }));
      // Only one future chunk is fetched. Failed prefetch is retried on demand.
      if (this.cursor < this.chunks.length) void this.load(this.cursor).catch(() => {});
    }
  }
  take(active) { return takeNext(this.queue, active); }
  get done() { return !this.queue.length && this.cursor >= this.chunks.length; }
}
