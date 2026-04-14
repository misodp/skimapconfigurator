import { initDesktopUI } from './desktop/init-desktop-ui.js';
import { initMobileUI } from './mobile/init-mobile-ui.js';
import { initSharedUI } from './shared/init-shared-ui.js';

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
  const shared = initSharedUI(ctx) || {};
  const mergedCtx = { ...ctx, ...shared };
  if (isMobileLikeUi()) {
    initMobileUI(mergedCtx);
    return 'mobile';
  }
  initDesktopUI(mergedCtx);
  return 'desktop';
}

