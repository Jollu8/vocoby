#!/usr/bin/env python3
"""Convert a pinned WikDict en-ru SQLite export into Vocoby CSV (offline)."""
import argparse
import csv
import hashlib
import json
import re
import sqlite3
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import quote

SOURCE_URL = 'https://download.wikdict.com/dictionaries/sqlite/2_2026-06/en-ru.sqlite3'
SOURCE_SHA256 = '3f65395883b996131c9b7a7b7b7c14c1b4458c892fae0050decd71dc0a3b4b0a'
FIELDS = ('en', 'ru', 'level', 'source', 'source_url', 'lexentry', 'sense')
ENGLISH = re.compile(r"[a-z]+(?:[-'][a-z]+)*")
RUSSIAN = re.compile(r'[А-Яа-яЁё]+(?:[ -][А-Яа-яЁё]+)*')
EXCLUDED_WORDS = frozenset({'a', 'ab', 'aah', 'aardvark'})


def translations(value):
    result = []
    for raw in value.split(' | '):
        # Strip stress only, retaining ё and й (do not remove all diacritics).
        word = unicodedata.normalize('NFC', raw.replace('\u0301', '')).strip()
        if len(word) <= 32 and RUSSIAN.fullmatch(word) and len(word.split()) <= 3 and word not in result:
            result.append(word)
    return result


def extract(connection):
    chosen = {}
    ranks = {}
    rejected = Counter()
    source_rows = 0
    query = 'SELECT lexentry, written_rep, trans_list, score, is_good, importance, sense FROM translation'
    for lexentry, en, trans_list, score, good, importance, sense in connection.execute(query):
        source_rows += 1
        if not good:
            rejected['not_marked_good'] += 1
            continue
        if lexentry and '__Proper_noun__' in lexentry:
            rejected['proper_noun'] += 1
            continue
        if not ENGLISH.fullmatch(en) or len(en) > 28:
            rejected['english_not_short_lowercase_word'] += 1
            continue
        if en in EXCLUDED_WORDS:
            rejected['excluded_low_value_word'] += 1
            continue
        variants = translations(trans_list or '')
        if not variants:
            rejected['no_short_clean_russian_translation'] += 1
            continue
        # Preserve upstream order within a sense; prefer its highest score.
        # Scores rank candidates, not CEFR levels or guarantees of correctness.
        ru = variants[0]
        rank = (-(score or 0), -(importance or 0), sense or '', lexentry or '', ru)
        if en not in ranks or rank < ranks[en]:
            ranks[en] = rank
            chosen[en] = dict(en=en, ru=ru, level='ungraded', source='WikDict',
                              source_url='https://en.wiktionary.org/wiki/' + quote(en, safe=''),
                              lexentry=lexentry or '', sense=sense or '')
    return chosen, {'source_rows': source_rows, 'rejected_rows': dict(sorted(rejected.items())),
                    'wikdict_unique_words': len(chosen)}


def apply_levels(words, levels_path):
    if not levels_path:
        return 0
    levels = {}
    with Path(levels_path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if not {'en', 'level'} <= set(reader.fieldnames or []):
            raise ValueError('Levels CSV must contain en,level columns')
        for line, row in enumerate(reader, 2):
            en = (row.get('en') or '').strip().lower()
            level = (row.get('level') or '').strip()
            if not en or level not in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'):
                raise ValueError(f'Invalid level mapping on line {line}')
            if en in levels:
                raise ValueError(f'Duplicate level mapping on line {line}: {en}')
            levels[en] = level
    changed = 0
    for en, level in levels.items():
        if en in words and words[en]['level'] != level:
            words[en]['level'] = level
            changed += 1
    return changed


def convert(database, starter, output, report_path, verify=True, levels_path=None):
    database = Path(database)
    digest = hashlib.sha256(database.read_bytes()).hexdigest()
    if verify and digest != SOURCE_SHA256:
        raise ValueError('WikDict checksum mismatch: expected the pinned 2026-06 en-ru export')
    connection = sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        words, report = extract(connection)
    finally:
        connection.close()
    # Retain the original small learning set and its approximate level labels.
    with Path(starter).open(encoding='utf-8', newline='') as stream:
        starters = list(csv.DictReader(stream))
    if not words:
        raise ValueError('No usable translations in WikDict export')
    mapped = apply_levels(words, levels_path)
    overrides = 0
    for row in starters:
        en = row['en'].strip().lower()
        overrides += en in words
        words[en] = dict(en=en, ru=row['ru'], level=row['level'], source='Vocoby starter',
                         source_url='', lexentry='', sense='')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(words[en] for en in sorted(words))
    report.update(source_url=SOURCE_URL, source_sha256=digest, license='CC-BY-SA-4.0',
                  starter_words=len(starters), starter_overrides=overrides,
                  level_mappings=mapped,
                  exported_words=len(words),
                  levels=dict(sorted(Counter(word['level'] for word in words.values()).items())),
                  csv_sha256=hashlib.sha256(output.read_bytes()).hexdigest())
    Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', help='Path to en-ru.sqlite3, release 2_2026-06')
    parser.add_argument('--starter', default='data/starter.csv')
    parser.add_argument('--output', default='data/words.csv')
    parser.add_argument('--report', default='data/import-report.json')
    parser.add_argument('--levels', help='Optional CSV with en,level CEFR mappings for WikDict words')
    args = parser.parse_args()
    print(json.dumps(convert(args.database, args.starter, args.output, args.report, levels_path=args.levels), ensure_ascii=False, indent=2))
