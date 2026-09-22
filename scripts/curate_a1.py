#!/usr/bin/env python3
"""Replace low-quality A1 cards with the next frequent dictionary entries."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

# These entries have a misleading, overly specific, or unusable translation.
A1_EXCLUDED_WORDS = frozenset({
    'check', 'content', 'current', 'digital', 'e', 'f', 'found', 'game',
    'get', 'go', 'i', 'index', 'john', 'm', 'make', 'must', 'n', 'north',
    'o', 'office', 'or', 'page', 'phone', 'please', 'policy', 'property',
    'public', 'rate', 'real', 're', 'section', 'security', 'service', 'set',
    'show', 'size', 'u', 'used', 'user', 'very', 'will',
})


def curate(source, frequency, report, target=400):
    source = Path(source)
    with source.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    removed = []
    for row in rows:
        if row['level'] == 'A1' and row['en'] in A1_EXCLUDED_WORDS:
            row['level'] = 'ungraded'
            removed.append(row['en'])
    with Path(frequency).open(encoding='utf-8') as stream:
        ranking = list(dict.fromkeys(line.strip().lower() for line in stream if line.strip()))
    current = sum(row['level'] == 'A1' for row in rows)
    by_word = {row['en'].strip().lower(): row for row in rows}
    promoted = []
    for word in ranking:
        row = by_word.get(word)
        if row and row['level'] == 'ungraded' and current < target and word not in A1_EXCLUDED_WORDS:
            row['level'] = 'A1'
            current += 1
            promoted.append(word)
    if current != target:
        raise ValueError(f'Only {current} A1 words available, target is {target}')
    with source.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    report_path = Path(report)
    data = json.loads(report_path.read_text(encoding='utf-8'))
    data['levels'] = dict(sorted(Counter(row['level'] for row in rows).items()))
    data['a1_curated'] = len(removed)
    data['a1_replacements'] = len(promoted)
    data['csv_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    report_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return removed, promoted


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frequency', help='One English word per line, ordered by frequency')
    parser.add_argument('--source', default='data/words.csv')
    parser.add_argument('--report', default='data/import-report.json')
    args = parser.parse_args()
    removed, promoted = curate(args.source, args.frequency, args.report)
    print(f'Replaced {len(removed)} A1 cards with {len(promoted)} frequent entries')