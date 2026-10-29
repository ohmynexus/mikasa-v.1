import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sync = await readFile(new URL('../cloud-sync.js', import.meta.url), 'utf8');

test('personal cloud panel exposes sync, guarded pull, and explicit push controls', () => {
  assert.match(html, /id="bCloudSync"/);
  assert.match(html, /id="bCloudPull"/);
  assert.match(html, /id="bCloudPush"/);
  assert.match(html, /id="cloudSyncStatus"/);
  assert.match(html, /cloud-sync\.js/);
});

test('cloud operations require an authenticated session', () => {
  assert.match(sync, /getSession/);
  assert.match(sync, /Tidak ada sesi login/);
});

test('cloud upload requires explicit confirmation and expected revision', () => {
  assert.match(sync, /confirm\(question\)/);
  assert.match(sync, /p_expected_revision:v\.revision/);
  assert.match(sync, /mikasa_save_vault/);
});

test('cloud pull refuses to replace nonempty local ledger', () => {
  assert.match(sync, /if\(!l\.isEmpty\(\)\)/);
  assert.match(sync, /Pemulihan diblokir/);
});

test('local restore continues to validate backup before replacing current data', () => {
  assert.match(html, /Pulihkan data/);
  assert.match(html, /JSON tidak valid/);
});
