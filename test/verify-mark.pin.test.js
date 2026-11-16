// The vendored shared/verify-mark files (VerifyMark.jsx, VerifyMark.css) match their pin files, and the pins are the canonical hashes.
// They come from curtismu7/AI-DEMO-Standalone shared/verify-mark: change them there, re-pin, re-vendor; never edit them here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components');
const CANONICAL = {
  'VerifyMark.jsx': '81c2532041c5a65aaf762e55c56e889df09dfde5811fc5cc788897ca8712c130',
  'VerifyMark.css': '4774585cd47c3affc739d3d99fa6843d62f607d8d3e69b4438de756ac3d49dc5',
};

test('vendored verify-mark matches VerifyMark.sha256, VerifyMark.css.sha256 and the canonical hashes', () => {
  for (const [file, pinFile] of [['VerifyMark.jsx', 'VerifyMark.sha256'], ['VerifyMark.css', 'VerifyMark.css.sha256']]) {
    const [hash, name] = fs.readFileSync(path.join(DIR, pinFile), 'utf8').trim().split(/\s+/);
    assert.equal(name, file, pinFile);
    const actual = createHash('sha256').update(fs.readFileSync(path.join(DIR, file))).digest('hex');
    assert.equal(actual, hash, `${file} differs from ${pinFile}`);
    assert.equal(hash, CANONICAL[file], `${pinFile} is not the canonical hash`);
  }
});
