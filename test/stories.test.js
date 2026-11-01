import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCast, loadStories, resolveText, tokensIn } from '../lib/stories.js';
import { parseTalkTrack } from '../lib/talk.js';
import { DEMO_DIAGRAMS } from '../lib/diagrams.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cast = loadCast(path.join(ROOT, 'content', 'cast.json'));
const storiesDir = path.join(ROOT, 'content', 'stories');
const stories = loadStories(storiesDir, cast);
const talkText = fs.readFileSync(path.join(ROOT, 'docs', 'talk-track.md'), 'utf8');

test('there are three stories, and each has a goal, obstacle, control, a known diagram and steps', () => {
  assert.equal(stories.length, 3);
  for (const s of stories) {
    assert.ok(s.id && s.title && s.goal && s.obstacle && s.control, s.id);
    assert.ok(DEMO_DIAGRAMS.includes(s.diagram), `${s.id} names diagram ${s.diagram}`);
    assert.ok(s.steps.length >= 1, s.id);
    s.steps.forEach((step, i) => assert.equal(step.n, i + 1, `${s.id} step numbers run 1..n`));
  }
});

test('every {{cast}} token in every story and in the talk track is a defined role, and none is left unresolved', () => {
  const raw = fs.readdirSync(storiesDir).map((f) => fs.readFileSync(path.join(storiesDir, f), 'utf8'));
  for (const text of [...raw, talkText]) {
    for (const token of tokensIn(text)) {
      assert.match(token, /^cast\.[a-z][a-z0-9_]*$/, `bad token {{${token}}}`);
      assert.ok(Object.hasOwn(cast, token.slice(5)), `undefined role in {{${token}}}`);
    }
  }
  for (const s of stories) assert.doesNotMatch(JSON.stringify(s), /\{\{|\}\}/, s.id);
});

test('an undefined cast token fails', () => {
  assert.throws(() => resolveText('hello {{cast.nobody}}', cast), /undefined token: \{\{cast\.nobody\}\}/);
  assert.throws(() => resolveText('hello {{agent}}', cast), /undefined token/);
});

test('a name that opens a sentence gets a capital letter, and one inside a sentence does not', () => {
  assert.equal(resolveText('{{cast.operator}} asks {{cast.agent}}. {{cast.key}} is used.', cast), 'The operator asks the AI agent. The agent access key is used.');
});

test('a cast role with an empty name is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-test-'));
  const file = path.join(dir, 'cast.json');
  fs.writeFileSync(file, JSON.stringify({ user: '' }));
  try {
    assert.throws(() => loadCast(file), /needs a name/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the talk track has the steps a presenter needs, each with a script', () => {
  const steps = parseTalkTrack(talkText);
  assert.ok(steps.length >= 8);
  assert.match(steps[0].title, /simulated/i);
  assert.ok(steps.every((s) => s.body.length > 20), 'every step has a script');
  assert.ok(steps.some((s) => /unverified/i.test(s.title)), 'one step covers what is unverified');
});

test('the talk track tells the presenter to open a feature diagram and to say what is internal', () => {
  const titles = parseTalkTrack(talkText).map((s) => s.title);
  assert.ok(titles.some((t) => /feature's diagram/i.test(t)), titles.join(' | '));
  assert.ok(titles.some((t) => /what is internal/i.test(t)), titles.join(' | '));
  assert.equal(titles.length, 10, 'talk track step count');
});
