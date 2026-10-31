// Regenerates docs/standard-ui.md from src/data/features.json so the spec and the UI cannot drift.
import { readFileSync, writeFileSync } from 'node:fs';
import { PAGES } from '../src/data/pages.js';

const features = JSON.parse(readFileSync(new URL('../src/data/features.json', import.meta.url), 'utf8'));
const lines = [];
lines.push('# Privilege Map LAB: standard UI specification', '');
lines.push('Audience: Solutions Engineers and the engineers building the Privilege Map LAB.');
lines.push('Generated from `src/data/features.json` by `npm run spec`. Edit the data, not this file.', '');
lines.push('## Pages', '');
for (const p of PAGES) {
  const list = features.filter((f) => f.page === p.id).map((f) => f.name).join('; ');
  lines.push(`### ${p.title}`, p.purpose, '', `Features: ${list}`, '');
}
lines.push('## Features', '');
for (const f of features) {
  lines.push(`### ${f.name}`, '');
  lines.push('#### Why we need it', f.why, '');
  lines.push('#### How it works', f.how, '');
  lines.push('#### Value to the end user', f.userValue, '');
  lines.push('#### Components used', ...f.components.map((c) => `- ${c}`), '');
  lines.push(`Sources: ${f.sources.join('; ')}`, '');
  if (f.unverified.length) lines.push('Not verified:', ...f.unverified.map((u) => `- ${u}`), '');
}
writeFileSync(new URL('../docs/standard-ui.md', import.meta.url), lines.join('\n'));
console.log(`wrote docs/standard-ui.md (${features.length} features)`);
