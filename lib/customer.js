// customer.config (rule 12): branding and vocabulary, read once at startup. Safe defaults when the file is absent.
// Never put a real customer name in the example file or in the defaults.
// vocabulary keys are story cast roles: a value replaces that role's default name in every story and the talk track.
import fs from 'node:fs';

export const DEFAULT_CUSTOMER = {
  branding: {
    productName: 'Privilege Map LAB',
    tagline: 'The PingOne Privilege Federated Identity model, drawn as diagrams you can walk through.',
    footer: ''
  },
  vocabulary: {}
};

const MAX_LEN = 120;
const MAX_VOCAB = 24;
const ROLE_RE = /^[a-z][a-z0-9_]{0,23}$/;

function text(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, MAX_LEN);
  return trimmed || fallback;
}

// Only known keys are read; anything else in the file is ignored.
export function normalizeCustomer(raw) {
  const b = raw?.branding && typeof raw.branding === 'object' ? raw.branding : {};
  const v = raw?.vocabulary && typeof raw.vocabulary === 'object' && !Array.isArray(raw.vocabulary) ? raw.vocabulary : {};
  const d = DEFAULT_CUSTOMER;
  const vocabulary = {};
  for (const [role, name] of Object.entries(v).slice(0, MAX_VOCAB)) {
    const clean = text(name, '');
    if (ROLE_RE.test(role) && clean) vocabulary[role] = clean;
  }
  return {
    branding: {
      productName: text(b.productName, d.branding.productName),
      tagline: text(b.tagline, d.branding.tagline),
      footer: text(b.footer, d.branding.footer)
    },
    vocabulary
  };
}

export function loadCustomerConfig(file) {
  if (!file || !fs.existsSync(file)) return normalizeCustomer({});
  try {
    return normalizeCustomer(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    throw new Error(`customer config ${file} is not valid JSON: ${error.message}`);
  }
}
