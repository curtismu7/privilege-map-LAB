// Builds a diagram-studio/1 diagram for one Privilege feature, straight from its own entry in src/data/features.json:
// the feature in the middle, one box and one arrow per component it lists, and one walkthrough step per component.
// The step text is the sentence of "how it works" that best matches the component, so nothing here is a new claim.
// scripts/gen-feature-diagrams.mjs writes the result to diagrams/<feature id>.json; the server only loads those files
// by name (lib/diagrams.js), and test/feature-diagrams.test.js fails if a file drifts from this builder.

// A feature's diagram is named by its feature id (diagrams/<feature id>.json). Diagram Studio caps a diagram id at 48 characters.
export const featureDiagramName = (featureId) => featureId;

const GROUPS = {
  feature: { label: 'The feature', color: 'red' },
  console: { label: 'Console', color: 'blue' },
  gateway: { label: 'Gateway and runtime', color: 'amber' },
  policy: { label: 'Policy and guardrails', color: 'green' },
  other: { label: 'Identity, data and logs', color: 'grey' }
};

const KEYWORDS = [
  ['other', /\b(log|logs|audit|event|events|siem|feed|index)\b/i],
  ['policy', /(policy|policies|cedar|guard|grant|rule|detector|approval|allowlist|limit|cap\b|caps\b|claim|protection)/i],
  ['console', /(console|registry|wizard|page|hub|screen|tab\b|editor|form|view|queue)/i],
  ['gateway', /(gateway|route|proxy|door|endpoint|sensor|desktop|workstation|enclave|backend|server|sidecar)/i]
];

export function groupOf(text) {
  for (const [group, re] of KEYWORDS) if (re.test(text)) return group;
  return 'other';
}

const shorten = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function wrap(text, width, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && `${line} ${w}`.length > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = shorten(`${lines[maxLines - 1]} …`, width);
  }
  return lines;
}

// Splits "Name (detail)" or "Name: detail" into a short label and up to three lines of detail.
export function splitComponent(text) {
  const paren = text.match(/^(.*?)\s*\((.*)\)\s*$/);
  const colon = !paren && text.includes(': ') ? [text.slice(0, text.indexOf(': ')), text.slice(text.indexOf(': ') + 2)] : null;
  const [label, rest] = paren ? [paren[1], paren[2]] : colon || [text, ''];
  return { label: shorten(label, 46), sub: rest ? wrap(rest, 34, 3) : [] };
}

const STOP = new Set(['that', 'with', 'this', 'from', 'their', 'which', 'where', 'there', 'when', 'then', 'into', 'than', 'have', 'also', 'each', 'does', 'only', 'such', 'used', 'uses', 'using', 'what', 'will', 'were', 'been', 'both', 'more', 'most']);
const tokens = (s) => new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9-]{3,}/g) || []).filter((t) => !STOP.has(t)));
const sentences = (s) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

function bestSentence(howSentences, component) {
  const want = tokens(component);
  let best = null;
  let bestScore = 0;
  for (const s of howSentences) {
    const have = tokens(s);
    let score = 0;
    for (const t of want) if (have.has(t)) score += 1;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

export const isDeckSourced = (feature) => feature.sources.some((s) => /Ping deck/i.test(s));

export const FALLBACK_SUFFIX = 'is one of the components this feature uses.';

// Boxes sit in three columns: left components, the feature, right components. Components alternate right, left, right ...
const COL_LEFT = 0;
const COL_MID = 330;
const COL_RIGHT = 660;
const ROW = 150;

export function buildFeatureDiagram(feature, pageTitle = '') {
  const comps = feature.components;
  const rows = Math.ceil(comps.length / 2);
  const mid = ((rows - 1) * ROW) / 2;
  const nodes = [
    { id: 'feature', group: 'feature', label: shorten(feature.name, 46), sub: [pageTitle ? `Privilege Map · ${pageTitle}` : 'Privilege Map'], x: COL_MID, y: mid },
    ...comps.map((c, i) => {
      const { label, sub } = splitComponent(c);
      return { id: `c${i}`, group: groupOf(c), label, sub, x: i % 2 === 0 ? COL_RIGHT : COL_LEFT, y: Math.floor(i / 2) * ROW };
    })
  ];
  const edges = comps.map((c, i) => ({ source: 'feature', target: `c${i}`, label: `uses ${shorten(splitComponent(c).label, 32)}` }));
  const how = sentences(feature.how);
  const whyFirst = sentences(feature.why)[0] || feature.why;
  const steps = comps.map((c, i) => {
    const { label } = splitComponent(c);
    return { title: label, what: bestSentence(how, c) || `${label} ${FALLBACK_SUFFIX}`, why: whyFirst, edges: [i] };
  });
  const used = [...new Set(nodes.slice(1).map((n) => n.group))];
  const groups = Object.fromEntries(['feature', ...Object.keys(GROUPS).filter((g) => g !== 'feature' && used.includes(g))].map((g) => [g, GROUPS[g]]));
  const note = isDeckSourced(feature) ? ' Internal and confidential: this text comes from an internal Ping deck and has not been tested on our tenant.' : '';
  return {
    schema: 'diagram-studio/1',
    id: featureDiagramName(feature.id),
    title: `${feature.name}: what it uses`,
    lede: `One arrow for each component this feature lists. The steps reuse the feature's own "how it works" text; nothing here is a new claim.${note}`,
    groups,
    nodes,
    edges,
    steps
  };
}
