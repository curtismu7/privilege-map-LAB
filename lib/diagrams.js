// Diagrams (rules 5 and 17): loaded by name from diagrams/<name>.json. The files are diagram-studio/1 data
// (boxes, arrows, steps), the same format Diagram Studio reads and writes. The page builds the ReactFlow graph
// from this data; no node or edge is hand-built in the UI.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { featureDiagramName } from './feature-diagram.js';

export const SCHEMA = 'diagram-studio/1';
// The two Map diagrams, then one diagram per feature (generated from src/data/features.json by npm run diagrams).
export const MAP_DIAGRAMS = ['nhi-entity', 'nhi-checks'];
const FEATURES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'features.json'), 'utf8'));
export const FEATURE_DIAGRAMS = FEATURES.map((f) => featureDiagramName(f.id));
export const DEMO_DIAGRAMS = [...MAP_DIAGRAMS, ...FEATURE_DIAGRAMS];
export const DIAGRAM_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'diagrams');
export const COLORS = ['red', 'dark', 'grey', 'blue', 'green', 'amber'];
const ID = /^[a-z0-9][a-z0-9_-]*$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Returns an array of problems; empty means valid. Same rules as diagram-studio's validateDiagram, for the fields used here.
export function validateDiagram(d) {
  const p = [];
  if (!isObj(d)) return ['diagram must be an object'];
  if (d.schema !== SCHEMA) p.push(`schema must be "${SCHEMA}"`);
  if (typeof d.id !== 'string' || !ID.test(d.id)) p.push('bad id');
  if (typeof d.title !== 'string' || !d.title) p.push('title is required');
  const groups = isObj(d.groups) ? d.groups : {};
  for (const [k, g] of Object.entries(groups)) {
    if (!ID.test(k) || !isObj(g) || typeof g.label !== 'string' || !COLORS.includes(g.color)) p.push(`group "${k}" is not valid`);
  }
  const ids = new Set();
  if (!Array.isArray(d.nodes) || !d.nodes.length) p.push('nodes must be a non-empty array');
  else {
    for (const n of d.nodes) {
      if (!isObj(n) || typeof n.id !== 'string' || !ID.test(n.id) || ids.has(n.id)) p.push(`bad or duplicate node id "${n?.id}"`);
      else ids.add(n.id);
      if (!Object.hasOwn(groups, n?.group)) p.push(`node "${n?.id}" has unknown group "${n?.group}"`);
      if (!Number.isFinite(n?.x) || !Number.isFinite(n?.y)) p.push(`node "${n?.id}" needs numeric x and y`);
      if (typeof n?.label !== 'string' || !n.label) p.push(`node "${n?.id}" needs a label`);
    }
  }
  if (!Array.isArray(d.edges)) p.push('edges must be an array');
  else {
    d.edges.forEach((e, i) => {
      if (!ids.has(e?.source) || !ids.has(e?.target)) p.push(`edge ${i + 1} references a missing box`);
      if (typeof e?.label !== 'string' || !e.label.trim()) p.push(`edge ${i + 1} has no label`);
    });
  }
  if (!Array.isArray(d.steps)) p.push('steps must be an array');
  else {
    const n = Array.isArray(d.edges) ? d.edges.length : 0;
    d.steps.forEach((s, i) => {
      if (!isObj(s) || typeof s.title !== 'string' || !s.title) p.push(`step ${i + 1} needs a title`);
      if (!Array.isArray(s?.edges) || !s.edges.every((x) => Number.isInteger(x) && x >= 0 && x < n)) p.push(`step ${i + 1} lists a missing arrow`);
    });
  }
  return p;
}

// Returns the diagram with this name, or throws. Only the demo's named diagrams are served.
export function loadDiagramByName(name, dir = DIAGRAM_DIR) {
  if (!DEMO_DIAGRAMS.includes(name)) throw new Error(`diagram "${name}" is not used by this app`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
  } catch (error) {
    throw new Error(`diagram "${name}" could not be read: ${error.message}`);
  }
  const problems = validateDiagram(data);
  if (problems.length) throw new Error(`diagram "${name}" is not valid diagram-studio/1 data: ${problems[0]}`);
  return data;
}

export function listDiagrams(dir = DIAGRAM_DIR) {
  return DEMO_DIAGRAMS.map((id) => {
    const kind = MAP_DIAGRAMS.includes(id) ? 'map' : 'feature';
    try {
      const d = loadDiagramByName(id, dir);
      return { id, title: d.title, lede: d.lede || '', kind, available: true };
    } catch (error) {
      return { id, title: id, lede: '', kind, available: false, error: error.message };
    }
  });
}
