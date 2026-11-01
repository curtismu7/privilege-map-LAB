// Regenerates diagrams/<feature id>.json (diagram-studio/1 data) from src/data/features.json, one file per feature.
// Edit the feature data, not the generated files; test/feature-diagrams.test.js fails if they drift.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../src/data/pages.js';
import { buildFeatureDiagram, featureDiagramName } from '../lib/feature-diagram.js';
import { MAP_DIAGRAMS } from '../lib/diagrams.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const features = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'features.json'), 'utf8'));
const dir = path.join(ROOT, 'diagrams');

const wanted = new Set(MAP_DIAGRAMS.map((n) => `${n}.json`));
for (const f of features) {
  const page = PAGES.find((p) => p.id === f.page);
  const name = featureDiagramName(f.id);
  wanted.add(`${name}.json`);
  fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(buildFeatureDiagram(f, page?.title), null, 2)}\n`);
}
// A feature that was removed or renamed leaves no stale diagram behind.
for (const file of fs.readdirSync(dir)) if (file.endsWith('.json') && !wanted.has(file)) fs.rmSync(path.join(dir, file));
console.log(`wrote ${features.length} feature diagrams to diagrams/`);
