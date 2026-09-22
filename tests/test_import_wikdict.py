import csv
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from scripts.import_wikdict import extract, translations, convert
from scripts.build_dictionary import build


class WikDictTests(unittest.TestCase):
    def connection(self, path=':memory:'):
        connection = sqlite3.connect(path)
        connection.execute('CREATE TABLE translation(lexentry, written_rep, trans_list, score, is_good, importance, sense)')
        return connection

    def test_translation_cleanup_retains_letters_and_does_not_truncate(self):
        self.assertEqual(translations('я́блоко | яблоко | лёгкий | край | [[развод]] | English'), ['яблоко', 'лёгкий', 'край'])
        self.assertEqual(translations('очень длинное пояснение из многих разных слов'), [])

    def test_low_value_words_are_excluded(self):
        connection = self.connection()
        connection.execute('INSERT INTO translation VALUES(?,?,?,?,?,?,?)',
                           ('eng/a__Letter__1', 'a', 'а', 100, 1, 1, 'letter'))
        words, report = extract(connection)
        self.assertNotIn('a', words)
        self.assertEqual(report['rejected_rows']['excluded_low_value_word'], 1)
        connection.close()

    def test_filter_deduplicate_and_rank_without_inventing_levels(self):
        connection = self.connection()
        rows = [
            ('eng/bank__Noun__1', 'bank', 'банк', 240, 1, 2.6, 'institution'),
            ('eng/bank__Noun__2', 'bank', 'бе́рег', 110, 1, 0.1, 'river edge'),
            ('eng/cat__Noun__1', 'cat', 'кот | ко́шка', 200, 1, 2.0, 'domestic animal'),
            ('eng/london__Proper_noun__1', 'london', 'Лондон', 100, 1, 1, ''),
            (None, 'bad', 'плохой', 2, 0, 1, ''),
            (None, 'two words', 'фраза', 100, 1, 1, ''),
            (None, 'broken', '[[разметка]]', 100, 1, 1, ''),
        ]
        connection.executemany('INSERT INTO translation VALUES(?,?,?,?,?,?,?)', rows)
        words, report = extract(connection)
        self.assertEqual(set(words), {'bank', 'cat'})
        self.assertEqual(words['bank']['ru'], 'банк')
        self.assertEqual(words['bank']['level'], 'ungraded')
        self.assertEqual(words['bank']['sense'], 'institution')
        self.assertEqual(report['source_rows'], 7)
        self.assertEqual(sum(report['rejected_rows'].values()), 4)
        connection.close()

    def test_import_and_build_reproducible_with_starter_override(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = root / 'source.sqlite3'
            connection = self.connection(database)
            connection.executemany('INSERT INTO translation VALUES(?,?,?,?,?,?,?)', [
                ('eng/bank__Noun__1', 'bank', 'банк', 100, 1, 1, 'institution'),
                ('eng/cat__Noun__1', 'cat', 'кошка', 100, 1, 1, 'animal'),
            ])
            connection.commit(); connection.close()
            starter = root / 'starter.csv'
            starter.write_text('en,ru,level\ncat,кот,A1\n', encoding='utf-8')
            output = root / 'words.csv'; report_path = root / 'report.json'
            with self.assertRaises(ValueError):
                convert(database, starter, output, report_path)
            self.assertFalse(output.exists())
            report = convert(database, starter, output, report_path, verify=False)
            original = output.read_bytes()
            convert(database, starter, output, report_path, verify=False)
            self.assertEqual(original, output.read_bytes())
            self.assertEqual(report['exported_words'], 2)
            self.assertEqual(report['starter_overrides'], 1)
            with output.open() as stream:
                records = list(csv.DictReader(stream))
            self.assertEqual(records[1]['ru'], 'кот')
            manifest = build(output, root / 'data')
            self.assertEqual(manifest['levels'], ['A1', 'ungraded'])
            # A later source replacement must remove obsolete generated chunks.
            stale = root / 'data/chunks/ungraded-z-001.json'
            stale.write_text('[]')
            custom = root / 'data/chunks/custom.json'; custom.write_text('[]')
            build(output, root / 'data')
            self.assertFalse(stale.exists())
            self.assertTrue(custom.exists())

    def test_optional_level_mapping_overrides_ungraded_words(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = root / 'source.sqlite3'
            connection = self.connection(database)
            connection.execute('INSERT INTO translation VALUES(?,?,?,?,?,?,?)',
                               ('eng/bank__Noun__1', 'bank', 'банк', 100, 1, 1, 'institution'))
            connection.commit(); connection.close()
            levels = root / 'levels.csv'
            levels.write_text('en,level\nbank,B2\n', encoding='utf-8')
            starter = root / 'starter.csv'
            starter.write_text('en,ru,level\n', encoding='utf-8')
            report = convert(database, starter, root / 'words.csv', root / 'report.json', verify=False, levels_path=levels)
            self.assertEqual(report['level_mappings'], 1)
            with (root / 'words.csv').open(encoding='utf-8') as stream:
                self.assertEqual(next(csv.DictReader(stream))['level'], 'B2')
