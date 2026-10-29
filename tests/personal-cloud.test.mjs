import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sync = await readFile(new URL('../cloud-sync.js', import.meta.url), 'utf8');
const gate = await readFile(new URL('../auth-gate.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('production entrypoint includes cloud assets, cloud panel and local ledger bridge', () => {
  assert.match(html, /id="bCloudSync"/);
  assert.match(html, /id="bCloudPull"/);
  assert.match(html, /id="bCloudPush"/);
  assert.match(html, /cloud-sync\.js/);
  assert.match(html, /MIKASA_LOCAL_LEDGER/);
});

test('cloud features share the authenticated Supabase client', () => {
  assert.match(gate, /window\.MIKASA_AUTH_CLIENT=client/);
  assert.match(sync, /window\.MIKASA_AUTH_CLIENT\|\|/);
  assert.match(sync, /getSession/);
  assert.match(sync, /getUser/);
});

test('cloud snapshot saving is explicit and revision checked', () => {
  assert.match(sync, /confirm\(question\)/);
  assert.match(sync, /p_expected_revision:v\.revision/);
  assert.match(sync, /mikasa_save_vault/);
});

test('cloud restore refuses to overwrite a nonempty local ledger', () => {
  assert.match(sync, /if\(!l\.isEmpty\(\)\)/);
  assert.match(sync, /Pemulihan diblokir/);
});

test('local JSON backup and restore remain present', () => {
  assert.match(html, /Backup JSON/);
  assert.match(html, /Pulihkan data/);
  assert.match(html, /JSON tidak valid/);
});

test('service worker cache is versioned and avoids cross-origin requests', () => {
  assert.match(sw, /const CACHE = 'mikasa-v01-release-3'/);
  assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return/);
});
