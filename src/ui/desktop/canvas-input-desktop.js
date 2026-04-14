/**
 * Desktop canvas input adapter (mouse/click based).
 * Keeps existing desktop behavior while isolating platform-specific wiring.
 */
export function attachDesktopCanvasInput(ctx) {
  const {
    DOM,
    state,
    onCanvasClick,
    onCanvasDblClick,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    hideLiftHoverPopup,
    hideGroomerHoverPopup,
    hideSlopeHoverPopup,
  } = ctx || {};

  if (!DOM?.canvas) return;

  if (typeof onCanvasClick === 'function') DOM.canvas.addEventListener('click', onCanvasClick);
  if (typeof onCanvasDblClick === 'function') DOM.canvas.addEventListener('dblclick', onCanvasDblClick);
  if (typeof onCanvasMouseDown === 'function') DOM.canvas.addEventListener('mousedown', onCanvasMouseDown);
  if (typeof onCanvasMouseMove === 'function') DOM.canvas.addEventListener('mousemove', onCanvasMouseMove);
  if (typeof onCanvasMouseUp === 'function') DOM.canvas.addEventListener('mouseup', onCanvasMouseUp);

  DOM.canvas.addEventListener('mouseleave', (e) => {
    if (state.mode === 'lift') state.mouseImage = null;
    state.buildBlocked = false;
    const hint = document.getElementById('buildMaskHint');
    if (hint) {
      hint.classList.add('hidden');
      hint.setAttribute('aria-hidden', 'true');
    }
    DOM.canvas.style.cursor = '';
    const popup = document.getElementById('liftHoverPopup');
    if (!popup || !popup.contains(e.relatedTarget)) hideLiftHoverPopup();
    const groomerPopup = document.getElementById('groomerHoverPopup');
    if (!groomerPopup || !groomerPopup.contains(e.relatedTarget)) hideGroomerHoverPopup();
    const slopePopup = document.getElementById('slopeHoverPopup');
    if (!slopePopup || !slopePopup.contains(e.relatedTarget)) hideSlopeHoverPopup();
    if (typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
  });
}
