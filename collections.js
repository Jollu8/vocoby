export const COLLECTIONS = [
  { id: 'A1', directory: 'a1-vocabden', group: 'levels', label: 'A1', description: 'Базовые слова и выражения для первых шагов.' },
  { id: 'A2', directory: 'a2-user', group: 'levels', label: 'A2', description: 'Знакомые ситуации и повседневное общение.' },
  { id: 'B1', directory: 'b1-user', group: 'levels', label: 'B1', description: 'Слова для общения, работы и самостоятельных поездок.' },
  { id: 'B2', directory: 'b2-user', group: 'levels', label: 'B2', description: 'Более сложная лексика и разные оттенки значений.' },
  { id: 'C1', directory: 'c1-core', group: 'levels', label: 'C1', migrateLegacy: false, description: 'Слова C1 из Oxford 5000 с русскими переводами.' },
  { id: 'phrasal-verbs', directory: 'phrasal-verbs', group: 'topics', label: 'Фразовые глаголы', migrateLegacy: false, description: 'Частые глаголы с частицами: give up, find out, put off.' },
  { id: 'travel', directory: 'travel', group: 'topics', label: 'Для путешествий', migrateLegacy: false, description: 'Аэропорт, отель, кафе, транспорт и помощь в поездке.' },
  { id: 'collocations', directory: 'collocations', group: 'topics', label: 'Устойчивые сочетания', migrateLegacy: false, description: 'Слова, которые употребляют вместе: make a decision, pay attention.' },
  { id: 'most-1000', directory: 'most-1000', group: 'other', label: '1000 сложных слов', description: 'Сложные слова для академических и деловых текстов.' },
];

export const COLLECTION_GROUPS = [
  { id: 'levels', label: 'По уровню' },
  { id: 'topics', label: 'По темам' },
  { id: 'other', label: 'Другие подборки' },
];

// Preserve the published directory/revision keys of existing collections.
// Topics stay separate from the level dictionary even when headwords overlap.
export function buildCollections(base, manifests) {
  const collections = new Map(COLLECTIONS.map(definition => {
    const source = manifests[definition.id];
    const chunks = source.chunks.map(chunk => ({
      ...chunk, level: definition.id, path: `${definition.directory}/${chunk.path}`,
      migrateLegacy: definition.migrateLegacy !== false,
    }));
    return [definition.id, { ...definition, chunks,
      total: chunks.reduce((sum, chunk) => sum + chunk.count, 0) }];
  }));
  const levelIds = new Set(COLLECTIONS.filter(item => item.group === 'levels').map(item => item.id));
  const chunks = [
    ...base.chunks.filter(chunk => !levelIds.has(chunk.level)),
    ...[...collections.values()].filter(item => item.group === 'levels').flatMap(item => item.chunks),
  ];
  const manifest = { ...base, chunks,
    levels: [...new Set(chunks.map(chunk => chunk.level))],
    total: chunks.reduce((sum, chunk) => sum + chunk.count, 0) };
  const allChunks = [...chunks,
    ...[...collections.values()].filter(item => item.group !== 'levels').flatMap(item => item.chunks)];
  return { manifest, collections, allChunks };
}
