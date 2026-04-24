import { initDesktopUI } from './desktop/init-desktop-ui.js';
import { initMobileUI } from './mobile/init-mobile-ui.js';
import { initSharedUI } from './shared/init-shared-ui.js';

function isMobileLikeUi() {
  if (typeof window === 'undefined') return false;
  const w = Math.max(0, Number(window.innerWidth) || 0);
  const h = Math.max(0, Number(window.innerHeight) || 0);
  if (!w || !h) return false;
  const shortSide = Math.min(w, h);
  const isLandscape = w >= h;
  return isLandscape && shortSide <= 600;
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

