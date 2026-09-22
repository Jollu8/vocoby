#!/usr/bin/env python3
"""Promote the most frequent available words into the practical A1 base."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


def promote(source, frequency, report, target=400):
    source = Path(source)
    with source.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    with Path(frequency).open(encoding='utf-8') as stream:
        ranking = list(dict.fromkeys(line.strip().lower() for line in stream if line.strip()))
    current = sum(row['level'] == 'A1' for row in rows)
    if current > target:
        raise ValueError(f'A1 already contains {current} words, above target {target}')
    by_word = {row['en'].strip().lower(): row for row in rows}
    promoted = []
    for word in ranking:
        row = by_word.get(word)
        if row and row['level'] == 'ungraded' and current < target:
            row['level'] = 'A1'
            current += 1
            promoted.append(word)
    if current != target:
        raise ValueError(f'Only {current} available A1 words, target is {target}')
    with source.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    report_path = Path(report)
    data = json.loads(report_path.read_text(encoding='utf-8'))
    data['levels'] = dict(sorted(Counter(row['level'] for row in rows).items()))
    data['frequency_promoted'] = len(promoted)
    data['csv_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    report_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return promoted


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frequency', help='One English word per line, ordered by frequency')
    parser.add_argument('--source', default='data/words.csv')
    parser.add_argument('--report', default='data/import-report.json')
    parser.add_argument('--target', type=int, default=400)
    args = parser.parse_args()
    promoted = promote(args.source, args.frequency, args.report, args.target)
    print(f'Promoted {len(promoted)} words; A1 now contains {args.target} words')