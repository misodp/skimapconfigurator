/**
 * Shared UI bootstrap for bindings used by both desktop and mobile.
 * Returns helpers needed by platform-specific modules.
 */
export function initSharedUI(ctx) {
  const {
    DOM,
    state,
    onImageSelected,
    exportConfig,
    onConfigImported,
    setMode,
    TICKET_STEPS,
    updateTicketPriceDisplay,
    applySimulationSpeed,
    setMountainMode,
    updateMountainImage,
    renderLiftTypeDropdown,
    renderGroomerTypeDropdown,
    renderSlopeTypeButtons,
    updateDateDisplay,
    updateWeatherDisplay,
  } = ctx;

  if (DOM?.imageInput) DOM.imageInput.addEventListener('change', onImageSelected);
  if (DOM?.saveBtn) DOM.saveBtn.addEventListener('click', exportConfig);
  if (DOM?.loadBtn && DOM?.importInput) DOM.loadBtn.addEventListener('click', () => DOM.importInput.click());
  if (DOM?.importInput) DOM.importInput.addEventListener('change', onConfigImported);

  function syncSimulationSpeedButtons() {
    if (!DOM?.simSpeedButtons) return;
    const target = String(Number.isFinite(state.simulationSpeed) ? state.simulationSpeed : 1);
    DOM.simSpeedButtons.forEach((b) => b.classList.toggle('active', String(b.dataset.speed ?? '') === target));
  }

  window.onGameStateRestored = () => {
    state.customMountainUrl = null;
    state.displayedMountainThreshold = null;
    state.mountainPendingThreshold = null;
    state.mountainDaysAtPending = 0;
    setMountainMode(false);
    updateMountainImage();
    const openBtn = document.getElementById('resortOpenBtn');
    const closedBtn = document.getElementById('resortClosedBtn');
    const open = state.resortOpen === true;
    if (openBtn) { openBtn.classList.toggle('active', open); openBtn.setAttribute('aria-pressed', String(open)); }
    if (closedBtn) { closedBtn.classList.toggle('active', !open); closedBtn.setAttribute('aria-pressed', String(!open)); }
    setMode(state.mode);
    renderLiftTypeDropdown({ skipPanelBlank: true });
    renderGroomerTypeDropdown({ skipPanelBlank: true });
    renderSlopeTypeButtons({ skipPanelBlank: true });
    updateDateDisplay();
    updateWeatherDisplay();
    syncSimulationSpeedButtons();
    applySimulationSpeed();
  };

  if (DOM?.modeBtns) {
    DOM.modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
  }

  const resortOpenBtn = document.getElementById('resortOpenBtn');
  const resortClosedBtn = document.getElementById('resortClosedBtn');
  function updateResortButtons() {
    const open = state.resortOpen === true;
    if (resortOpenBtn) {
      resortOpenBtn.classList.toggle('active', open);
      resortOpenBtn.setAttribute('aria-pressed', String(open));
    }
    if (resortClosedBtn) {
      resortClosedBtn.classList.toggle('active', !open);
      resortClosedBtn.setAttribute('aria-pressed', String(!open));
    }
  }
  if (resortOpenBtn) resortOpenBtn.addEventListener('click', () => { state.resortOpen = true; updateResortButtons(); });
  if (resortClosedBtn) resortClosedBtn.addEventListener('click', () => { state.resortOpen = false; updateResortButtons(); });
  updateResortButtons();

  const ticketSlider = /** @type {HTMLInputElement | null} */ (document.getElementById('ticketPriceSlider'));
  if (ticketSlider) {
    ticketSlider.addEventListener('input', () => {
      const idx = Math.max(0, Math.min(TICKET_STEPS.length - 1, Number(ticketSlider.value) || 0));
      state.ticketPrice = TICKET_STEPS[idx];
      updateTicketPriceDisplay();
    });
  }

  syncSimulationSpeedButtons();
  return { syncSimulationSpeedButtons };
}

