import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedHash = '091A1E1FF7BDD44C41B50AA08B21F0222F3956FCC311BB077B1E70EBFFD606EB';

test('vehicle.js canonique reste strictement intact', () => {
  const source = readFileSync(resolve(root, 'vehicle.js'));
  const hash = createHash('sha256').update(source).digest('hex').toUpperCase();
  assert.equal(hash, expectedHash);
});
