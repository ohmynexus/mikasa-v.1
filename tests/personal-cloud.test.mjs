import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sync = await readFile(new URL('../cloud-sync.js', import.meta.url), 'utf8');

test('personal cloud sync has an explicit sync panel and actions', () => {
  assert.match(html, /id="bCloudSync"/);
  assert.match(html, /id="cloudSyncStatus"/);
  assert.match(html, /cloud-sync\.js/);
});

test('cloud sync refuses to run without an authenticated session', () => {
  assert.match(sync, /getSession/);
  assert.match(sync, /Tidak ada sesi login/);
});

test('cloud synchronization never auto-imports local data to cloud', () => {
  assert.match(sync, /PUSH_DISABLED_UNTIL_CONFIRMED/);
  assert.match(sync, /Tidak ada unggah otomatis/);
});

test('local restore validates a backup before replacing current data', () => {
  assert.match(html, /Pulihkan data/);
  assert.match(html, /JSON tidak valid/);
});
