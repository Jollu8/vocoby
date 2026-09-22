#!/usr/bin/env python3
"""Expand the practical A2 and B1 collections with frequent dictionary words."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


def expand(source, frequency, report, target=400):
    source = Path(source)
    with source.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    with Path(frequency).open(encoding='utf-8') as stream:
        ranking = list(dict.fromkeys(line.strip().lower() for line in stream if line.strip()))
    assigned = {row['en'].strip().lower() for row in rows if row['level'] != 'ungraded'}
    added = Counter()
    by_word = {row['en'].strip().lower(): row for row in rows}
    for level in ('A2', 'B1', 'B2'):
        current = sum(row['level'] == level for row in rows)
        for word in ranking:
            if current >= target:
                break
            row = by_word.get(word)
            if word in assigned or row is None or row['level'] != 'ungraded':
                continue
            row['level'] = level
            assigned.add(word)
            current += 1
            added[level] += 1
        if current != target:
            raise ValueError(f'Only {current} {level} words available, target is {target}')
    with source.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    report_path = Path(report)
    data = json.loads(report_path.read_text(encoding='utf-8'))
    data['levels'] = dict(sorted(Counter(row['level'] for row in rows).items()))
    data['level_expansions'] = dict(added)
    data['csv_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    report_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return added


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frequency', help='One English word per line, ordered by frequency')
    parser.add_argument('--source', default='data/words.csv')
    parser.add_argument('--report', default='data/import-report.json')
    parser.add_argument('--target', type=int, default=400)
    args = parser.parse_args()
    added = expand(args.source, args.frequency, args.report, args.target)
    print(f"Added {added['A2']} A2, {added['B1']} B1 and {added['B2']} B2 words")