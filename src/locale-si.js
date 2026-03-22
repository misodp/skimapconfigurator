/**
 * Hidden Slovenian locale: toggled from splash with Ctrl+Q (session only).
 * When active, tech tree + news use .si.json data files and ski/badge art from animals/ subfolders.
 */

export const SI_SESSION_KEY = 'summit67_locale_si';

export function isSlovenianLocaleActive() {
  try {
    return typeof window !== 'undefined' && window.sessionStorage?.getItem(SI_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Toggle SI locale and reload so tech tree, news, and assets apply from boot. */
export function toggleSlovenianLocaleAndReload() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (window.sessionStorage.getItem(SI_SESSION_KEY) === '1') {
      window.sessionStorage.removeItem(SI_SESSION_KEY);
    } else {
      window.sessionStorage.setItem(SI_SESSION_KEY, '1');
    }
  } catch {
    /* private mode etc. */
  }
  window.location.reload();
}
