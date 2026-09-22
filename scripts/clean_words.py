#!/usr/bin/env python3
"""Remove explicitly excluded low-value entries from an existing dictionary."""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from import_wikdict import EXCLUDED_WORDS


def clean(source, report):
    source = Path(source)
    with source.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    kept = [row for row in rows if row['en'].strip().lower() not in EXCLUDED_WORDS]
    removed = len(rows) - len(kept)
    with source.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), lineterminator='\n')
        writer.writeheader()
        writer.writerows(kept)
    report_path = Path(report)
    data = json.loads(report_path.read_text(encoding='utf-8'))
    data['exported_words'] = len(kept)
    data['levels'] = dict(sorted(Counter(row['level'] for row in kept).items()))
    data['excluded_words'] = sorted(EXCLUDED_WORDS)
    data['csv_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    report_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return removed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default='data/words.csv')
    parser.add_argument('--report', default='data/import-report.json')
    args = parser.parse_args()
    print(f"Removed {clean(args.source, args.report)} excluded words")