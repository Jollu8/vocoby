import csv
import hashlib
import json
import re
import tempfile
import unittest
from pathlib import Path
from scripts.build_dictionary import build


class ShippedDictionaryTests(unittest.TestCase):
    def test_user_a2_preserves_all_words_and_translations(self):
        data = Path(__file__).resolve().parents[1] / 'data'
        entries = re.findall(r'^\d+\.\s+(.+?)\s+—\s+(.+?)\s*$',
                             (data / 'a2-user.md').read_text(), re.M)
        self.assertEqual(len(entries), 1000)
        expected = {}
        for en, ru in entries:
            meanings = expected.setdefault(en.lower(), [])
            for meaning in ru.split(', '):
                if meaning not in meanings:
                    meanings.append(meaning)
        with (data / 'a2-user.csv').open() as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 877)
        self.assertTrue(all(row['level'] == 'A2' for row in rows))
        self.assertEqual({row['en']: row['ru'] for row in rows},
                         {en: ', '.join(ru) for en, ru in expected.items()})
        manifest = json.loads((data / 'a2-user/manifest.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(build(data / 'a2-user.csv', directory), manifest)
            for chunk in manifest['chunks']:
                self.assertEqual((data / 'a2-user' / chunk['path']).read_bytes(),
                                 (Path(directory) / chunk['path']).read_bytes())

    def test_user_b1_preserves_all_words_and_translations(self):
        data = Path(__file__).resolve().parents[1] / 'data'
        entries = re.findall(r'^\d+\.\s+(.+?)\s+—\s+(.+?)\s*$',
                             (data / 'b1-user.md').read_text(), re.M)
        self.assertEqual(len(entries), 400)
        expected = {}
        for en, ru in entries:
            meanings = expected.setdefault(en.lower(), [])
            for meaning in ru.split(', '):
                if meaning not in meanings:
                    meanings.append(meaning)
        with (data / 'b1-user.csv').open() as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 394)
        self.assertTrue(all(row['level'] == 'B1' for row in rows))
        self.assertEqual({row['en']: row['ru'] for row in rows},
                         {en: ', '.join(ru) for en, ru in expected.items()})
        manifest = json.loads((data / 'b1-user/manifest.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(build(data / 'b1-user.csv', directory), manifest)
            for chunk in manifest['chunks']:
                self.assertEqual((data / 'b1-user' / chunk['path']).read_bytes(),
                                 (Path(directory) / chunk['path']).read_bytes())

    def test_user_b2_preserves_all_words_and_translations(self):
        data = Path(__file__).resolve().parents[1] / 'data'
        entries = re.findall(r'^\d+\.\s+(.+?)\s+—\s+(.+?)\s*$',
                             (data / 'b2-user.md').read_text(), re.M)
        self.assertEqual(len(entries), 400)
        expected = {}
        for en, ru in entries:
            meanings = expected.setdefault(en.lower(), [])
            for meaning in ru.split(', '):
                if meaning not in meanings:
                    meanings.append(meaning)
        with (data / 'b2-user.csv').open() as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 394)
        self.assertTrue(all(row['level'] == 'B2' for row in rows))
        self.assertEqual({row['en']: row['ru'] for row in rows},
                         {en: ', '.join(ru) for en, ru in expected.items()})
        manifest = json.loads((data / 'b2-user/manifest.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(build(data / 'b2-user.csv', directory), manifest)
            for chunk in manifest['chunks']:
                self.assertEqual((data / 'b2-user' / chunk['path']).read_bytes(),
                                 (Path(directory) / chunk['path']).read_bytes())

    def test_vocabden_a1_words_translations_and_rebuild(self):
        data = Path(__file__).resolve().parents[1] / 'data'
        with (data / 'a1-vocabden.csv').open(encoding='utf-8') as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 898)
        self.assertEqual(len({row['en'] for row in rows}), 898)
        self.assertTrue(all(row['level'] == 'A1' and row['ru'] and row['source_url'] for row in rows))
        by_word = {row['en']: row['ru'] for row in rows}
        for word, translation in {'boy': 'мальчик', 'game': 'игра', 'go': 'идти',
                                  'phone': 'телефон', 'office': 'офис',
                                  'spring': 'весна', 'may': 'май',
                                  'ice cream': 'мороженое'}.items():
            self.assertEqual(by_word[word], translation)
        report = json.loads((data / 'a1-vocabden-source.json').read_text())
        self.assertEqual(hashlib.sha256(('\n'.join(sorted(by_word)) + '\n').encode()).hexdigest(),
                         report['headwords_sha256'])
        manifest = json.loads((data / 'a1-vocabden/manifest.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(build(data / 'a1-vocabden.csv', directory), manifest)
            for chunk in manifest['chunks']:
                self.assertEqual((data / 'a1-vocabden' / chunk['path']).read_bytes(),
                                 (Path(directory) / chunk['path']).read_bytes())

    def test_most_1000_is_complete_and_reproducible(self):
        data = Path(__file__).resolve().parents[1] / 'data'
        with (data / 'most-1000.csv').open(encoding='utf-8') as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 1000)
        self.assertEqual(len({row['en'] for row in rows}), 1000)
        self.assertTrue(all(row['ru'] and row['source_url'] for row in rows))
        self.assertEqual(rows[0]['en'], 'consider')
        self.assertEqual(rows[-1]['en'], 'bemused')
        manifest = json.loads((data / 'most-1000/manifest.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(build(data / 'most-1000.csv', directory), manifest)
            for chunk in manifest['chunks']:
                self.assertEqual((data / 'most-1000' / chunk['path']).read_bytes(),
                                 (Path(directory) / chunk['path']).read_bytes())

    def test_real_export_matches_report_and_generated_chunks(self):
        data = Path(__file__).resolve().parents[1] / 'data'
        report = json.loads((data / 'import-report.json').read_text())
        manifest = json.loads((data / 'manifest.json').read_text())
        self.assertGreaterEqual(manifest['total'], 30000)
        self.assertEqual(manifest['total'], report['exported_words'])
        self.assertEqual(hashlib.sha256((data / 'words.csv').read_bytes()).hexdigest(), report['csv_sha256'])
        self.assertLess((data / 'manifest.json').stat().st_size, 60000)
        with (data / 'words.csv').open(encoding='utf-8') as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len({row['en'] for row in rows}), manifest['total'])
        wikdict = [row for row in rows if row['source'] == 'WikDict']
        self.assertTrue(all(row['source_url'] for row in wikdict))
        self.assertEqual(sum(row['level'] == 'A1' for row in rows), 400)
        self.assertEqual(sum(row['level'] == 'A2' for row in rows), 400)
        self.assertEqual(sum(row['level'] == 'B1' for row in rows), 400)
        self.assertEqual(sum(row['level'] == 'B2' for row in rows), 400)
        self.assertFalse({'a', 'ab', 'aah', 'aardvark'} & {row['en'] for row in rows})
        self.assertFalse({'john', 'phone', 'security', 'e', 'f', 'm', 'n', 'o', 'u'} &
                 {row['en'] for row in rows if row['level'] == 'A1'})
        self.assertEqual(len(list((data / 'chunks').glob('*.json'))), len(manifest['chunks']))
        with tempfile.TemporaryDirectory() as directory:
            rebuilt = build(data / 'words.csv', directory)
            self.assertEqual(manifest, rebuilt)
            for chunk in manifest['chunks']:
                self.assertLessEqual(chunk['count'], 200)
                shipped = data / chunk['path']
                self.assertLess(shipped.stat().st_size, 20000)
                self.assertEqual(shipped.read_bytes(), (Path(directory) / chunk['path']).read_bytes())
