import { attachMobileCanvasInput } from './canvas-input-mobile.js';
import { initMobileShellController } from './mobile-shell-controller.js';

/**
 * Mobile-specific UI bootstrap.
 * Commit 1 scaffold only: no behavior moved yet.
 */
export function initMobileUI(ctx) {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('ui-mobile');
    document.body.classList.remove('ui-desktop');
  }
  initMobileShellController(ctx);
  attachMobileCanvasInput(ctx);

  const {
    handleLiftPopupClick,
    handleGroomerPopupClick,
    handleSlopePopupClick,
  } = ctx || {};

  // Mobile needs the same delegated popup interactions as desktop.
  if (typeof handleLiftPopupClick === 'function') {
    document.addEventListener('click', handleLiftPopupClick);
  }
  if (typeof handleGroomerPopupClick === 'function') {
    document.addEventListener('click', handleGroomerPopupClick);
  }
  if (typeof handleSlopePopupClick === 'function') {
    document.addEventListener('click', handleSlopePopupClick);
  }
}

