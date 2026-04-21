import { attachMobileCanvasInput } from './canvas-input-mobile.js';
import { initMobileShellController } from './mobile-shell-controller.js';

/**
 * Operate tooltips use position:fixed with left/top from viewport client coordinates.
 * Pinch-zoom applies transform on .canvas-wrapper; descendants with fixed positioning
 * are anchored to that transformed ancestor, not the viewport, so coordinates mismatch
 * when zoomed. Body has no pinch transform, so fixed + clientX/Y stay aligned.
 */
function reparentOperatePopupsToBody() {
  if (typeof document === 'undefined') return;
  const body = document.body;
  if (!body) return;
  for (const id of ['liftHoverPopup', 'groomerHoverPopup', 'slopeHoverPopup']) {
    const el = document.getElementById(id);
    if (el && el.parentElement !== body) body.appendChild(el);
  }
}

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
  reparentOperatePopupsToBody();
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

