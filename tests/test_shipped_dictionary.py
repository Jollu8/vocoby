import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from scripts.build_dictionary import build


class ShippedDictionaryTests(unittest.TestCase):
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
