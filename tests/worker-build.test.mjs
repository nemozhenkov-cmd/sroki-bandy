import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stampWorker } from '../scripts/worker-build.mjs';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(body, url) {
  return vm.runInNewContext(body + '\n({VERSION,CACHE})', {
    self: { location: { href: url }, addEventListener() {} }, URL
  });
}
test('UI-only publication changes worker bytes and cache even for old client URL', () => {
  const oldURL = 'https://example.test/sroki-bandy/sw.js?v=old-build';
  const a = stampWorker(source, '2.0.1-build-a');
  const b = stampWorker(source, '2.0.2-build-b');
  assert.notEqual(a,b);
  assert.notEqual(worker(a,oldURL).CACHE,worker(b,oldURL).CACHE);
  assert.equal(worker(b,oldURL).VERSION,'2.0.2-build-b');
  assert.equal(worker(b,oldURL).CACHE,worker(b,'https://example.test/sroki-bandy/sw.js').CACHE);
});
test('missing marker fails publication rather than silently losing updates', () => {
  assert.throws(() => stampWorker('no marker', 'build'), /Missing/);
});
