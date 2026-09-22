import json
import tempfile
import unittest
from pathlib import Path
from scripts.build_dictionary import build


class DictionaryTests(unittest.TestCase):
    def test_chunks_and_stable_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'words.csv'
            source.write_text('en,ru,level\napple,яблоко,A1\nanimal,животное,A1\nanswer,ответ,A1\n', encoding='utf-8')
            first = build(source, root / 'out', 2)
            self.assertEqual([chunk['count'] for chunk in first['chunks']], [2, 1])
            self.assertEqual(first['total'], 3)
            ids = set()
            for chunk in first['chunks']:
                words = json.loads((root / 'out' / chunk['path']).read_text())
                self.assertNotIn('ids', chunk)
                self.assertEqual(len(chunk['revision']), 16)
                ids.update(word['id'] for word in words)
            second = build(source, root / 'out', 1)
            self.assertEqual(ids, {word['id'] for chunk in second['chunks'] for word in json.loads((root / 'out' / chunk['path']).read_text())})

    def test_invalid_source_does_not_write(self):
        for content in ['en,ru,level\ncat,кот,A1\nCat,кошка,A2\n', 'en,ru,level\ncat,,A1\n', 'en,ru,level\ncat,кот,Z9\n']:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / 'words.csv'
                source.write_text(content, encoding='utf-8')
                with self.assertRaises(ValueError):
                    build(source, root / 'out')
                self.assertFalse((root / 'out').exists())

    def test_large_dictionary_has_small_index_and_bounded_chunks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'words.csv'
            source.write_text('en,ru,level\n' + ''.join(
                f'word{i:05},перевод{i},B1\n' for i in range(30000)), encoding='utf-8')
            result = build(source, root / 'out')
            self.assertEqual(result['total'], 30000)
            self.assertEqual(len(result['chunks']), 150)
            self.assertLess((root / 'out' / 'manifest.json').stat().st_size, 40000)
            self.assertTrue(all(chunk['count'] <= 200 for chunk in result['chunks']))
            first_revision = result['chunks'][0]['revision']
            self.assertEqual(first_revision, build(source, root / 'out')['chunks'][0]['revision'])
            source.write_text(source.read_text().replace('перевод0,', 'другой перевод,'), encoding='utf-8')
            self.assertNotEqual(first_revision, build(source, root / 'out')['chunks'][0]['revision'])
