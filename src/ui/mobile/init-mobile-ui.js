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
}

