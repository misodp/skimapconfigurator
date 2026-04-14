import { initDesktopUI } from './desktop/init-desktop-ui.js';
import { initMobileUI } from './mobile/init-mobile-ui.js';

function isMobileLikeUi() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  return coarse || narrow;
}

/**
 * Select and initialize platform-specific UI hooks.
 * Commit 1: scaffolding only (desktop/mobile logic still lives in init.js).
 */
export function initPlatformUI(ctx) {
  if (isMobileLikeUi()) {
    initMobileUI(ctx);
    return 'mobile';
  }
  initDesktopUI(ctx);
  return 'desktop';
}

