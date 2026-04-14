/**
 * Desktop-specific UI bootstrap.
 * Commit 1 scaffold only: no behavior moved yet.
 */
export function initDesktopUI(ctx) {
  void ctx;
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('ui-desktop');
    document.body.classList.remove('ui-mobile');
  }
}

