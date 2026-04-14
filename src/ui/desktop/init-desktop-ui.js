/**
 * Desktop-specific UI bootstrap.
 * Commit 2: move desktop-only bindings out of init.js.
 */
export function initDesktopUI(ctx) {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add('ui-desktop');
    document.body.classList.remove('ui-mobile');
  }

  const {
    DOM,
    state,
    syncSimulationSpeedButtons,
    applySimulationSpeed,
    onCanvasClick,
    onCanvasDblClick,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    hideLiftHoverPopup,
    hideGroomerHoverPopup,
    hideSlopeHoverPopup,
    handleLiftPopupClick,
    handleGroomerPopupClick,
    handleSlopePopupClick,
  } = ctx || {};

  if (DOM?.simSpeedButtons) {
    DOM.simSpeedButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const speed = Number(btn.dataset.speed ?? '1') || 0;
        state.simulationSpeed = Math.max(0, Math.min(6, speed));
        syncSimulationSpeedButtons();
        applySimulationSpeed();
      });
    });
  }

  const sidebarTabs = document.querySelectorAll('.sidebar-tab');
  const investPanel = document.getElementById('investPanel');
  const statisticsPanel = document.getElementById('statisticsPanel');
  sidebarTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      sidebarTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      if (investPanel) {
        investPanel.classList.toggle('active', tabName === 'invest');
      }
      if (statisticsPanel) {
        statisticsPanel.classList.toggle('active', tabName === 'statistics');
      }
      if (tabName === 'invest') {
        hideLiftHoverPopup();
      }
      if (tabName === 'statistics') {
        if (typeof window.liftDetailSetBlank === 'function') window.liftDetailSetBlank();
        if (typeof window.groomerDetailSetBlank === 'function') window.groomerDetailSetBlank();
        if (typeof window.slopeDetailSetBlank === 'function') window.slopeDetailSetBlank();
        const fp = document.getElementById('liftDetailFloating');
        if (fp) {
          fp.hidden = true;
          fp.setAttribute('aria-hidden', 'true');
        }
      }
    });
  });

  document.addEventListener('click', handleLiftPopupClick);
  document.addEventListener('click', handleGroomerPopupClick);
  document.addEventListener('click', handleSlopePopupClick);

  if (DOM?.canvas) {
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
}

