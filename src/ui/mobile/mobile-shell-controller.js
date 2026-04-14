function clickIfExists(el) {
  if (el && typeof el.click === 'function') el.click();
}

export function initMobileShellController(ctx) {
  const { DOM, state, setMode, syncSimulationSpeedButtons, applySimulationSpeed, onCanvasDblClick } = ctx || {};
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
      // Keep operate context active on mobile map so status/popup interactions remain available.
      showTab('statistics');
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
  const rightSoundBtn = document.getElementById('mobileRightSoundBtn');
  const desktopSoundBtn = document.getElementById('soundToggleBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => clickIfExists(DOM?.saveBtn));
  if (loadBtn) loadBtn.addEventListener('click', () => clickIfExists(DOM?.loadBtn));
  if (soundBtn) soundBtn.addEventListener('click', () => clickIfExists(document.getElementById('soundToggleBtn')));
  if (rightSoundBtn) rightSoundBtn.addEventListener('click', () => clickIfExists(document.getElementById('soundToggleBtn')));
  const syncRightSoundButton = () => {
    if (!rightSoundBtn || !desktopSoundBtn) return;
    rightSoundBtn.classList.toggle('is-muted', desktopSoundBtn.classList.contains('is-muted'));
    rightSoundBtn.setAttribute('aria-pressed', desktopSoundBtn.getAttribute('aria-pressed') || 'true');
    rightSoundBtn.setAttribute('title', desktopSoundBtn.getAttribute('title') || 'Toggle sound');
    rightSoundBtn.setAttribute('aria-label', desktopSoundBtn.getAttribute('aria-label') || 'Toggle sound');
  };

  const mobileOperatePanel = document.getElementById('mobileOperateCompact');
  const mobileResortToggleBtn = document.getElementById('mobileResortToggleBtn');
  const mobileTicketMinusBtn = document.getElementById('mobileTicketMinusBtn');
  const mobileTicketPlusBtn = document.getElementById('mobileTicketPlusBtn');
  const mobileTicketValue = document.getElementById('mobileTicketPriceValue');
  const mobileOperateDate = document.getElementById('mobileOperateDate');
  const mobileOperateWeatherIcon = document.getElementById('mobileOperateWeatherIcon');
  const mobileOperateWeather = document.getElementById('mobileOperateWeather');
  const mobileOperateBudget = document.getElementById('mobileOperateBudget');
  const mobileOperateDailyProfit = document.getElementById('mobileOperateDailyProfit');
  const currentDateDisplay = document.getElementById('currentDateDisplay');
  const weatherDisplay = document.getElementById('weatherDisplay');
  const budgetAmount = document.getElementById('budgetAmount');
  const headerDailyProfit = document.getElementById('headerDailyProfit');
  const resortOpenBtn = document.getElementById('resortOpenBtn');
  const resortClosedBtn = document.getElementById('resortClosedBtn');
  const ticketSlider = document.getElementById('ticketPriceSlider');
  const ticketValue = document.getElementById('ticketPriceValue');
  const snowDepthDisplay = document.getElementById('snowDepthDisplay');
  const visitorsDisplay = document.getElementById('visitorsDisplay');
  const snowInfoFill = document.getElementById('snowInfoFill');
  const snowTrendSymbol = document.querySelector('.snow-depth-label .snow-change');
  const liftExperienceDisplay = document.getElementById('liftExperienceDisplay');
  const slopeExperienceDisplay = document.getElementById('slopeExperienceDisplay');
  const slopeQualityDisplay = document.getElementById('slopeQualityDisplay');
  const satisfactionDisplay = document.getElementById('satisfactionDisplay');
  const reputationDescription = document.getElementById('reputationDescription');
  const mobileSnowDepthValue = document.getElementById('mobileSnowDepthValue');
  const mobileVisitorsValue = document.getElementById('mobileVisitorsValue');
  const mobileSnowTrend = document.getElementById('mobileSnowTrend');
  const mobileSnowFill = document.getElementById('mobileSnowFill');
  const mobileLiftWaitValue = document.getElementById('mobileLiftWaitValue');
  const mobileSlopeCrowdsValue = document.getElementById('mobileSlopeCrowdsValue');
  const mobileSlopeQualityValue = document.getElementById('mobileSlopeQualityValue');
  const mobileLiftWaitTrend = document.getElementById('mobileLiftWaitTrend');
  const mobileSlopeCrowdsTrend = document.getElementById('mobileSlopeCrowdsTrend');
  const mobileSlopeQualityTrend = document.getElementById('mobileSlopeQualityTrend');
  const mobileReputationValue = document.getElementById('mobileReputationValue');
  const mobileLiftWaitFill = document.getElementById('mobileLiftWaitFill');
  const mobileSlopeCrowdsFill = document.getElementById('mobileSlopeCrowdsFill');
  const mobileSlopeQualityFill = document.getElementById('mobileSlopeQualityFill');
  const mobileReputationFill = document.getElementById('mobileReputationFill');
  if (mobileOperatePanel) {
    mobileOperatePanel.hidden = false;
    mobileOperatePanel.setAttribute('aria-hidden', 'false');
  }
  if (mobileResortToggleBtn) {
    mobileResortToggleBtn.addEventListener('click', () => {
      const openActive = !!resortOpenBtn?.classList.contains('active');
      if (openActive) clickIfExists(resortClosedBtn);
      else clickIfExists(resortOpenBtn);
    });
  }
  if (ticketSlider) {
    const stepTicket = (delta) => {
      const min = Number(ticketSlider.min || '0');
      const max = Number(ticketSlider.max || '0');
      const current = Number(ticketSlider.value || min);
      const next = Math.max(min, Math.min(max, current + delta));
      if (next === current) return;
      ticketSlider.value = String(next);
      ticketSlider.dispatchEvent(new Event('input', { bubbles: true }));
      ticketSlider.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (mobileTicketMinusBtn) mobileTicketMinusBtn.addEventListener('click', () => stepTicket(-1));
    if (mobileTicketPlusBtn) mobileTicketPlusBtn.addEventListener('click', () => stepTicket(1));
  }

  const mobileSpeedButtons = document.querySelectorAll('.mobile-speed-btn, .mobile-right-speed-btn');
  const syncMobileSpeedButtons = () => {
    const speed = String(Number.isFinite(state.simulationSpeed) ? state.simulationSpeed : 1);
    mobileSpeedButtons.forEach((b) => b.classList.toggle('active', String(b.getAttribute('data-speed') || '') === speed));
  };
  mobileSpeedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.getAttribute('data-speed') || '1');
      state.simulationSpeed = Math.max(0, Math.min(6, speed));
      if (typeof applySimulationSpeed === 'function') applySimulationSpeed();
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
      showTab('statistics');
    };
    mobileBuildBtn.addEventListener('click', openBuildMenu);
    mobileBuildBtn.addEventListener('pointerup', openBuildMenu);
    mobileBuildBtn.addEventListener('touchend', openBuildMenu, { passive: false });
  }

  document.querySelectorAll('.invest-compact-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setBuildMenuOpen(true);
      showTab('statistics');
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

  const syncOperateCompact = () => {
    const applyTrendClass = (el, sourceEl) => {
      if (!el) return;
      el.classList.remove('change-up', 'change-down', 'change-stable');
      if (sourceEl?.classList.contains('change-up')) { el.classList.add('change-up'); return; }
      if (sourceEl?.classList.contains('change-down')) { el.classList.add('change-down'); return; }
      if (sourceEl?.classList.contains('change-stable')) { el.classList.add('change-stable'); return; }
      const txt = (el.textContent || '').trim();
      if (txt.includes('↑') || txt.includes('+')) el.classList.add('change-up');
      else if (txt.includes('↓') || txt.includes('-')) el.classList.add('change-down');
      else el.classList.add('change-stable');
    };
    const openActive = !!resortOpenBtn?.classList.contains('active');
    if (mobileResortToggleBtn) {
      mobileResortToggleBtn.classList.toggle('active', openActive);
      mobileResortToggleBtn.classList.toggle('mobile-operate-open', openActive);
      mobileResortToggleBtn.classList.toggle('mobile-operate-closed', !openActive);
      mobileResortToggleBtn.textContent = openActive ? 'Open' : 'Closed';
      mobileResortToggleBtn.setAttribute('aria-pressed', openActive ? 'true' : 'false');
    }
    if (currentDateDisplay && mobileOperateDate) {
      mobileOperateDate.textContent = currentDateDisplay.textContent || mobileOperateDate.textContent;
    }
    if (weatherDisplay && mobileOperateWeather) {
      const weatherLabel = weatherDisplay.querySelector('.header-weather-label')?.textContent?.trim() || weatherDisplay.textContent || '';
      mobileOperateWeather.textContent = weatherLabel || mobileOperateWeather.textContent;
      if (mobileOperateWeatherIcon) {
        const weatherSvg = weatherDisplay.querySelector('.header-weather-icon svg');
        mobileOperateWeatherIcon.innerHTML = weatherSvg ? weatherSvg.outerHTML : '';
      }
    }
    if (budgetAmount && mobileOperateBudget) {
      mobileOperateBudget.textContent = budgetAmount.textContent || mobileOperateBudget.textContent;
    }
    if (headerDailyProfit && mobileOperateDailyProfit) {
      mobileOperateDailyProfit.textContent = headerDailyProfit.textContent || mobileOperateDailyProfit.textContent;
      mobileOperateDailyProfit.classList.remove('profit', 'loss');
      if (headerDailyProfit.classList.contains('profit')) mobileOperateDailyProfit.classList.add('profit');
      if (headerDailyProfit.classList.contains('loss')) mobileOperateDailyProfit.classList.add('loss');
    }
    if (ticketValue && mobileTicketValue) {
      mobileTicketValue.textContent = ticketValue.textContent || mobileTicketValue.textContent;
    }
    if (visitorsDisplay && mobileVisitorsValue) {
      mobileVisitorsValue.textContent = visitorsDisplay.textContent || mobileVisitorsValue.textContent;
    }
    if (snowDepthDisplay && mobileSnowDepthValue) {
      mobileSnowDepthValue.textContent = snowDepthDisplay.textContent || mobileSnowDepthValue.textContent;
    }
    if (snowTrendSymbol && mobileSnowTrend) {
      mobileSnowTrend.textContent = snowTrendSymbol.textContent || mobileSnowTrend.textContent;
      applyTrendClass(mobileSnowTrend, snowTrendSymbol);
    }
    if (snowInfoFill && mobileSnowFill) {
      mobileSnowFill.style.width = snowInfoFill.style.width || mobileSnowFill.style.width;
      mobileSnowFill.classList.remove('snow-info-fill-low', 'snow-info-fill-mid', 'snow-info-fill-high');
      if (snowInfoFill.classList.contains('snow-info-fill-high')) mobileSnowFill.classList.add('snow-info-fill-high');
      else if (snowInfoFill.classList.contains('snow-info-fill-mid')) mobileSnowFill.classList.add('snow-info-fill-mid');
      else mobileSnowFill.classList.add('snow-info-fill-low');
    }
    if (mobileLiftWaitValue) {
      mobileLiftWaitValue.textContent = '';
    }
    if (mobileSlopeCrowdsValue) {
      mobileSlopeCrowdsValue.textContent = '';
    }
    if (mobileSlopeQualityValue) {
      mobileSlopeQualityValue.textContent = '';
    }
    const syncMetricFill = (sourceMetricEl, targetFillEl) => {
      if (!sourceMetricEl || !targetFillEl) return;
      const sourceFill = sourceMetricEl.querySelector('.experience-fill');
      if (!sourceFill) return;
      targetFillEl.style.width = sourceFill.style.width || targetFillEl.style.width;
      targetFillEl.classList.remove('experience-fill-low', 'experience-fill-mid', 'experience-fill-high');
      if (sourceFill.classList.contains('experience-fill-low')) targetFillEl.classList.add('experience-fill-low');
      else if (sourceFill.classList.contains('experience-fill-high')) targetFillEl.classList.add('experience-fill-high');
      else targetFillEl.classList.add('experience-fill-mid');
    };
    syncMetricFill(liftExperienceDisplay, mobileLiftWaitFill);
    syncMetricFill(slopeExperienceDisplay, mobileSlopeCrowdsFill);
    syncMetricFill(slopeQualityDisplay, mobileSlopeQualityFill);
    const syncTrend = (sourceMetricEl, targetEl) => {
      if (!sourceMetricEl || !targetEl) return;
      const changeEl = sourceMetricEl.closest('.experience-metric')?.querySelector('.experience-change');
      if (changeEl?.textContent) targetEl.textContent = changeEl.textContent;
      applyTrendClass(targetEl, changeEl);
    };
    syncTrend(liftExperienceDisplay, mobileLiftWaitTrend);
    syncTrend(slopeExperienceDisplay, mobileSlopeCrowdsTrend);
    syncTrend(slopeQualityDisplay, mobileSlopeQualityTrend);
    if (mobileReputationValue && satisfactionDisplay) {
      const repValue = satisfactionDisplay.querySelector('.satisfaction-value')?.textContent?.trim() || '';
      if (repValue) mobileReputationValue.textContent = repValue;
      const sourceRepFill = satisfactionDisplay.querySelector('.satisfaction-fill');
      if (mobileReputationFill && sourceRepFill) {
        mobileReputationFill.style.width = sourceRepFill.style.width || mobileReputationFill.style.width;
        mobileReputationFill.classList.remove('satisfaction-fill-low', 'satisfaction-fill-mid', 'satisfaction-fill-high');
        if (sourceRepFill.classList.contains('satisfaction-fill-high')) mobileReputationFill.classList.add('satisfaction-fill-high');
        else if (sourceRepFill.classList.contains('satisfaction-fill-mid')) mobileReputationFill.classList.add('satisfaction-fill-mid');
        else mobileReputationFill.classList.add('satisfaction-fill-low');
      }
    }
  };

  syncMobileSpeedButtons();
  syncModeButtons();
  syncOperateCompact();
  syncRightSoundButton();
  setSheetExpanded(false);
  showTab('statistics');
  setBuildMenuOpen(true);

  window.setInterval(() => {
    syncMobileSpeedButtons();
    syncModeButtons();
    syncOperateCompact();
    syncRightSoundButton();
  }, 250);
}
