/**
 * Build assets/data/tutorial.s67 from assets/data/tutorial.json.
 * Uses the same AES-256-GCM layout as src/save-crypto.js (seed: src/save-crypto-key.js).
 */
import { createHash, createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAVE_CRYPTO_KEY_SEED } from '../src/save-crypto-key.js';

const SAVE_FILE_MAGIC = 'S67v1';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tutorialJsonPath = join(root, 'assets/data/tutorial.json');
const tutorialOutPath = join(root, 'assets/data/tutorial.s67');

function encryptUtf8ToS67(plain) {
  const key = createHash('sha256').update(SAVE_CRYPTO_KEY_SEED).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, enc, tag]);
  return SAVE_FILE_MAGIC + combined.toString('base64');
}

const plain = readFileSync(tutorialJsonPath, 'utf8');
writeFileSync(tutorialOutPath, encryptUtf8ToS67(plain), 'utf8');
console.log('Wrote', tutorialOutPath);
