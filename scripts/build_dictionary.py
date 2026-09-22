#!/usr/bin/env python3
"""Build small, alphabetically ordered dictionary chunks from a UTF-8 CSV."""
import argparse
import csv
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

LEVELS = ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'ungraded')


def build(source, output, size=200):
    if size < 1 or size > 200:
        raise ValueError('Chunk size must be between 1 and 200')
    groups = defaultdict(list)
    seen = set()
    with Path(source).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if not {'en', 'ru', 'level'} <= set(reader.fieldnames or []):
            raise ValueError('CSV must contain en,ru,level columns')
        for line, row in enumerate(reader, 2):
            en, ru, level = ((row.get(key) or '').strip() for key in ('en', 'ru', 'level'))
            en = en.lower()
            if not re.match(r'^[a-z]', en) or not ru or level not in LEVELS:
                raise ValueError(f'Invalid word or level on line {line}')
            if en in seen:
                raise ValueError(f'Duplicate English word on line {line}: {en}')
            seen.add(en)
            word = {'id': hashlib.sha256(en.encode()).hexdigest()[:16], 'en': en, 'ru': ru}
            groups[level, en[0]].append(word)
    if not seen:
        raise ValueError('Dictionary must not be empty')
    # Validate the whole source before touching generated files.
    output = Path(output)
    directory = output / 'chunks'
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 2, 'total': len(seen), 'levels': [level for level in LEVELS if any(key[0] == level for key in groups)], 'chunks': []}
    generated = set()
    for (level, letter), words in sorted(groups.items()):
        words.sort(key=lambda word: word['en'])
        for start in range(0, len(words), size):
            batch = words[start:start + size]
            filename = f'{level.lower()}-{letter}-{start // size + 1:03}.json'
            generated.add(filename)
            payload = json.dumps(batch, ensure_ascii=False, separators=(',', ':')) + '\n'
            revision = hashlib.sha256(payload.encode()).hexdigest()[:16]
            (directory / filename).write_text(payload, encoding='utf-8')
            manifest['chunks'].append({'level': level, 'letter': letter, 'path': f'chunks/{filename}', 'count': len(batch), 'revision': revision})
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Remove only generated chunk files left over from earlier builds.
    for old in directory.glob('*.json'):
        if re.fullmatch(r'(?:a[12]|b[12]|c[12]|ungraded)-[a-z]-[0-9]+\.json', old.name) and old.name not in generated:
            old.unlink()
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', default='data/words.csv')
    parser.add_argument('--output', default='data')
    parser.add_argument('--chunk-size', type=int, default=200)
    args = parser.parse_args()
    result = build(args.source, args.output, args.chunk_size)
    print(f"Built {result['total']} words in {len(result['chunks'])} chunks")
