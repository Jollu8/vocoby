import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('Pages publishes every local module dependency and cached shell file', () => {
  const workflow = read('.github/workflows/pages.yml');
  const copy = workflow.match(/^\s+cp (.+) _site\/$/m);
  assert.ok(copy, 'Pages has a static file copy step');
  const files = new Set(copy[1].split(/\s+/));
  const checked = new Set();
  function checkModule(file) {
    if (checked.has(file)) return;
    checked.add(file);
    assert.ok(files.has(file), `${file} must be published`);
    const source = read(file);
    for (const match of source.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) {
      checkModule(match[1]);
    }
  }
  checkModule('app.js');
  const shell = read('sw.js').match(/const SHELL = \[([\s\S]*?)\];/)[1];
  for (const match of shell.matchAll(/'\.\/([^']+)'/g)) {
    const file = match[1];
    assert.ok(existsSync(new URL(file, root)), `${file} exists`);
    assert.ok(files.has(file) || (file.startsWith('data/') && workflow.includes('cp -r data _site/data')),
      `${file} in the offline shell must be published`);
  }
});

test('page IDs are unique so loading indicators can be updated', () => {
  const ids = [...read('index.html').matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate IDs in index.html');
});
