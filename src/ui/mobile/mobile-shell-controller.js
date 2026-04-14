function clickIfExists(el) {
  if (el && typeof el.click === 'function') el.click();
}

export function initMobileShellController(ctx) {
  const { DOM, state, setMode, syncSimulationSpeedButtons, onCanvasDblClick } = ctx || {};
  if (typeof document === 'undefined') return;

  const shell = document.getElementById('mobileShell');
  if (!shell) return;
  shell.hidden = false;
  shell.setAttribute('aria-hidden', 'false');
  const setBuildMenuOpen = (open) => {
    const buildBtn = document.getElementById('mobileBuildMenuBtn');
    const fabMenu = document.querySelector('.invest-compact-sidebar');
    document.body.classList.toggle('mobile-build-open', !!open);
    if (buildBtn) buildBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (fabMenu) {
      fabMenu.hidden = !open;
      fabMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
      fabMenu.style.display = open ? 'block' : 'none';
      fabMenu.style.opacity = open ? '1' : '0';
      fabMenu.style.pointerEvents = open ? 'auto' : 'none';
      fabMenu.style.transform = open ? 'translateX(0) scale(1)' : 'translateX(10px) scale(0.92)';
    }
  };
  const closeBuildPopupIfOpen = () => {
    const overlay = document.getElementById('investInventoryOverlay');
    const popup = document.getElementById('investInventoryPopup');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
    }
    if (popup) {
      popup.hidden = true;
      popup.setAttribute('aria-hidden', 'true');
      popup.style.display = 'none';
    }
  };

  const setSheetExpanded = (expanded) => {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('mobileSheetToggleBtn');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-sheet-expanded', expanded);
    sidebar.classList.toggle('mobile-sheet-collapsed', !expanded);
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  const applySidebarTab = (tabName) => {
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const investPanel = document.getElementById('investPanel');
    const statisticsPanel = document.getElementById('statisticsPanel');
    sidebarTabs.forEach((t) => {
      const active = t.getAttribute('data-tab') === tabName;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (investPanel) investPanel.classList.toggle('active', tabName === 'invest');
    if (statisticsPanel) statisticsPanel.classList.toggle('active', tabName === 'statistics');
  };

  const showTab = (tab) => {
    const investBtn = document.getElementById('mobileInvestTabBtn');
    const operateBtn = document.getElementById('mobileOperateTabBtn');
    const investTab = document.getElementById('investTab');
    const statsTab = document.getElementById('statisticsTab');

    if (tab === 'invest') {
      applySidebarTab('invest');
      clickIfExists(investTab);
      if (investBtn) investBtn.classList.add('active');
      if (operateBtn) operateBtn.classList.remove('active');
      if (operateBtn) operateBtn.setAttribute('aria-selected', 'false');
      if (investBtn) investBtn.setAttribute('aria-selected', 'true');
    } else {
      applySidebarTab('statistics');
      clickIfExists(statsTab);
      if (operateBtn) operateBtn.classList.add('active');
      if (investBtn) investBtn.classList.remove('active');
      if (investBtn) investBtn.setAttribute('aria-selected', 'false');
      if (operateBtn) operateBtn.setAttribute('aria-selected', 'true');
    }
  };

  const wireModeButton = (mode, fallbackTab) => {
    const btn = document.querySelector(`[data-mobile-mode="${mode}"]`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (mode === 'operate') {
        showTab('statistics');
        setSheetExpanded(true);
        return;
      }
      setMode(mode);
      showTab(fallbackTab);
      setSheetExpanded(true);
      state.buildArmed = true;
      const cancelBuildBtn = document.getElementById('cancelBuildBtn');
      if (cancelBuildBtn) cancelBuildBtn.classList.remove('hidden');
    });
  };

  wireModeButton('lift', 'invest');
  wireModeButton('slope', 'invest');
  wireModeButton('groomer', 'invest');
  wireModeButton('operate', 'statistics');

  const saveBtn = document.getElementById('mobileSaveBtn');
  const loadBtn = document.getElementById('mobileLoadBtn');
  const soundBtn = document.getElementById('mobileSoundBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => clickIfExists(DOM?.saveBtn));
  if (loadBtn) loadBtn.addEventListener('click', () => clickIfExists(DOM?.loadBtn));
  if (soundBtn) soundBtn.addEventListener('click', () => clickIfExists(document.getElementById('soundToggleBtn')));

  const mobileSpeedButtons = document.querySelectorAll('.mobile-speed-btn');
  const syncMobileSpeedButtons = () => {
    const speed = String(Number.isFinite(state.simulationSpeed) ? state.simulationSpeed : 1);
    mobileSpeedButtons.forEach((b) => b.classList.toggle('active', String(b.getAttribute('data-speed') || '') === speed));
  };
  mobileSpeedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.getAttribute('data-speed') || '1');
      const desktopBtn = document.querySelector(`.sim-speed-btn[data-speed="${speed}"]`);
      clickIfExists(desktopBtn);
      if (typeof syncSimulationSpeedButtons === 'function') syncSimulationSpeedButtons();
      syncMobileSpeedButtons();
    });
  });

  const finishSlopeBtn = document.getElementById('mobileFinishSlopeBtn');
  if (finishSlopeBtn) {
    finishSlopeBtn.addEventListener('click', () => {
      if (state.mode !== 'slope') return;
      if (!DOM?.canvas || typeof onCanvasDblClick !== 'function') return;
      const rect = DOM.canvas.getBoundingClientRect();
      const fake = {
        preventDefault() {},
        clientX: rect.left + rect.width * 0.5,
        clientY: rect.top + rect.height * 0.5,
      };
      onCanvasDblClick(fake);
    });
  }

  const cancelBtn = document.getElementById('mobileCancelBuildBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => clickIfExists(document.getElementById('cancelBuildBtn')));
  }

  const toggleBtn = document.getElementById('mobileSheetToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      const expanded = !!(sidebar && sidebar.classList.contains('mobile-sheet-expanded'));
      setSheetExpanded(!expanded);
    });
  }

  const investTabBtn = document.getElementById('mobileInvestTabBtn');
  const operateTabBtn = document.getElementById('mobileOperateTabBtn');
  if (investTabBtn) investTabBtn.addEventListener('click', () => { showTab('invest'); setSheetExpanded(true); });
  if (operateTabBtn) operateTabBtn.addEventListener('click', () => { showTab('statistics'); setSheetExpanded(true); });

  const mobileBuildBtn = document.getElementById('mobileBuildMenuBtn');
  if (mobileBuildBtn) {
    const openBuildMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setBuildMenuOpen(true);
      showTab('invest');
    };
    mobileBuildBtn.addEventListener('click', openBuildMenu);
    mobileBuildBtn.addEventListener('pointerup', openBuildMenu);
    mobileBuildBtn.addEventListener('touchend', openBuildMenu, { passive: false });
  }

  document.querySelectorAll('.invest-compact-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setBuildMenuOpen(true);
      showTab('invest');
      setSheetExpanded(true);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBuildPopupIfOpen();
  });

  const syncModeButtons = () => {
    const mode = state.mode;
    document.querySelectorAll('.mobile-rail-btn[data-mobile-mode]').forEach((b) => {
      const bMode = b.getAttribute('data-mobile-mode');
      b.classList.toggle('active', bMode === mode || (bMode === 'operate' && mode === 'none'));
    });
    if (finishSlopeBtn) finishSlopeBtn.classList.toggle('hidden', !(mode === 'slope'));
    if (cancelBtn) cancelBtn.classList.toggle('hidden', !(state.buildArmed));
  };

  syncMobileSpeedButtons();
  syncModeButtons();
  setSheetExpanded(false);
  showTab('statistics');
  setBuildMenuOpen(true);

  window.setInterval(() => {
    syncMobileSpeedButtons();
    syncModeButtons();
  }, 250);
}
