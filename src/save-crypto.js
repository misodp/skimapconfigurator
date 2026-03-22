/**
 * Summit '.s67' format: magic prefix + base64(iv12 || ciphertext+authTag).
 * AES-256-GCM via Web Crypto (same layout as scripts/encrypt-s67.mjs).
 */

import { SAVE_CRYPTO_KEY_SEED } from './save-crypto-key.js';

export const SAVE_FILE_MAGIC = 'S67v1';

const encoder = new TextEncoder();

/** @param {Uint8Array} u8 */
function uint8ToBase64(u8) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** @param {string} b64 */
function base64ToUint8(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

let _keyPromise = null;

function getCryptoKey() {
  if (!_keyPromise) {
    _keyPromise = (async () => {
      const material = await crypto.subtle.digest('SHA-256', encoder.encode(SAVE_CRYPTO_KEY_SEED));
      return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    })();
  }
  return _keyPromise;
}

/**
 * @param {string} jsonOrPlainText
 * @returns {Promise<string>} full .s67 file contents (ASCII)
 */
export async function encryptSaveFileUtf8(jsonOrPlainText) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encoder.encode(jsonOrPlainText));
  const ctU8 = new Uint8Array(ct);
  const combined = new Uint8Array(iv.length + ctU8.length);
  combined.set(iv);
  combined.set(ctU8, iv.length);
  return SAVE_FILE_MAGIC + uint8ToBase64(combined);
}

/**
 * Decrypt payload after magic stripped (base64 of iv||ct+tag).
 * @param {string} b64Payload
 * @returns {Promise<string>}
 */
async function decryptPayloadB64(b64Payload) {
  const key = await getCryptoKey();
  const raw = base64ToUint8(b64Payload.replace(/\s/g, ''));
  if (raw.length < 12 + 16) throw new Error('Truncated .s67 payload');
  const iv = raw.slice(0, 12);
  const ciphertext = raw.slice(12);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext);
  return new TextDecoder().decode(buf);
}

/**
 * Full file: magic + base64(iv||ciphertext).
 * @param {string} fileText
 * @returns {Promise<string>} UTF-8 plaintext (JSON string)
 */
export async function decryptSaveFileToUtf8(fileText) {
  const t = fileText.trim();
  if (!t.startsWith(SAVE_FILE_MAGIC)) {
    throw new Error('Not a Summit ’67 save (.s67) file');
  }
  return decryptPayloadB64(t.slice(SAVE_FILE_MAGIC.length));
}

/**
 * Encrypted .s67 or legacy plain JSON (for imports).
 * @param {string} fileText
 * @returns {Promise<Record<string, unknown>>}
 */
export async function parseSaveOrLegacyJson(fileText) {
  const t = fileText.trim();
  if (t.startsWith(SAVE_FILE_MAGIC)) {
    const dec = await decryptPayloadB64(t.slice(SAVE_FILE_MAGIC.length));
    return JSON.parse(dec);
  }
  return JSON.parse(t);
}

/**
 * Load encrypted tutorial / asset from URL (e.g. Vite ?url import).
 * @param {string | URL} url
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadEncryptedJsonFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
  const text = await res.text();
  const json = await decryptSaveFileToUtf8(text);
  return JSON.parse(json);
}
