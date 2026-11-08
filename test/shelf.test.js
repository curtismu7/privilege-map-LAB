import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './support/helpers.mjs';

// Its own file on purpose: startServer names the workspace after port and process id, so two servers in one file can be mistaken for each other.
test('shelf button: GET /api/shelf is reachable and returns SHELF_URL (trailing slash trimmed); POST is refused', async () => {
  const app = await startServer({ SHELF_URL: 'https://shelf.example:8443/' });
  try {
    const res = await fetch(`${app.base}/api/shelf`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { shelfUrl: 'https://shelf.example:8443' });
    const posted = await fetch(`${app.base}/api/shelf`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.notEqual(posted.status, 200);
  } finally {
    await app.stop();
  }
});
