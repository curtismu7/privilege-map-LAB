// The vendored diagram kit (src/diagram-kit) must stay byte for byte what diagram-kit.sha256 pins, and the pin names the
// AI-DEMO-Standalone commit it came from. To update: copy shared/diagram-kit from AI-DEMO-Standalone main again, then re-pin.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'diagram-kit');

test('vendored diagram-kit matches diagram-kit.sha256, which names the AI-DEMO-Standalone commit', () => {
  const text = fs.readFileSync(path.join(dir, 'diagram-kit.sha256'), 'utf8');
  assert.match(text.split('\n')[0], /^# vendored byte for byte from curtismu7\/AI-DEMO-Standalone shared\/diagram-kit at [0-9a-f]{7,40}/);
  const pins = text.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  assert.deepEqual(pins.map(([, f]) => f).sort(), ['DiagramKit.jsx', 'DiagramKit.test.jsx', 'diagram-kit.css', 'diagramKit.js', 'diagramKit.test.js']);
  for (const [h, f] of pins) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'), h, f);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['DiagramKit.jsx', 'DiagramKit.test.jsx', 'diagram-kit.css', 'diagram-kit.sha256', 'diagramKit.js', 'diagramKit.test.js']);
});
