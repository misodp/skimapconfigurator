import { fromNormalized, getLiftLengthM } from '../../geometry.js';

/**
 * Mobile canvas input adapter.
 * Maps touch/pointer interactions to existing canvas handlers.
 */
export function attachMobileCanvasInput(ctx) {
  const {
    DOM,
    state,
    onCanvasClick,
    onCanvasDblClick,
    onCanvasMouseMove,
    onCanvasMouseDown,
    onCanvasMouseUp,
    cancelLift,
    cancelSlope,
    hideLiftHoverPopup,
    hideGroomerHoverPopup,
    hideSlopeHoverPopup,
  } = ctx || {};
  if (!DOM?.canvas) return;

  const allowPointer = (e) => {
    // Chrome device emulator may still report mouse pointerType.
    if (e.pointerType !== 'mouse') return true;
    return typeof document !== 'undefined' && document.body?.classList.contains('ui-mobile');
  };

  let pointerDown = false;
  let moved = false;
  let liftDragSession = false;
  let placedBottomThisGesture = false;
  let pendingLiftReleasePoint = null;
  let pendingSlopeReleasePoint = null;
  let pendingBuildKind = null;
  let pendingSlopeMode = null;
  let slopePenGestureArmed = false;
  let slopeDownClientPoint = null;
  const activePointers = new Map();
  let pinchActive = false;
  let pinchStartDistance = 0;
  let pinchStartMidX = 0;
  let pinchStartMidY = 0;
  let pinchStartScale = 1;
  let pinchStartTranslateX = 0;
  let pinchStartTranslateY = 0;
  let viewScale = 1;
  let viewTranslateX = 0;
  let viewTranslateY = 0;
  const LABEL_VERTICAL_GAP = 6;
  const SLOPE_SNAP_DIST_SQ = 28 * 28;
  const SLOPE_START_ASSIST_SNAP_DIST_SQ = 48 * 48;
  const SLOPE_DRAG_START_SQ = 12 * 12;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;

  function getCanvasWrapper() {
    return DOM?.canvas?.closest?.('.canvas-wrapper') || null;
  }

  function clampViewTransform() {
    const wrapper = getCanvasWrapper();
    if (!wrapper) return;
    const w = wrapper.clientWidth || 0;
    const h = wrapper.clientHeight || 0;
    const maxX = Math.max(0, ((viewScale - 1) * w) / 2);
    const maxY = Math.max(0, ((viewScale - 1) * h) / 2);
    viewTranslateX = Math.max(-maxX, Math.min(maxX, viewTranslateX));
    viewTranslateY = Math.max(-maxY, Math.min(maxY, viewTranslateY));
  }

  function applyViewTransform() {
    const wrapper = getCanvasWrapper();
    if (!wrapper) return;
    clampViewTransform();
    if (Math.abs(viewScale - 1) < 0.001 && Math.abs(viewTranslateX) < 0.5 && Math.abs(viewTranslateY) < 0.5) {
      wrapper.style.transform = 'none';
      return;
    }
    wrapper.style.transformOrigin = 'center center';
    wrapper.style.transform = `translate(${viewTranslateX}px, ${viewTranslateY}px) scale(${viewScale})`;
  }

  function getPinchPair() {
    const vals = [...activePointers.values()];
    if (vals.length < 2) return null;
    return [vals[0], vals[1]];
  }

  function getDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function beginPinch() {
    const pair = getPinchPair();
    if (!pair) return;
    const [a, b] = pair;
    pinchStartDistance = Math.max(1, getDistance(a, b));
    pinchStartMidX = (a.x + b.x) / 2;
    pinchStartMidY = (a.y + b.y) / 2;
    pinchStartScale = viewScale;
    pinchStartTranslateX = viewTranslateX;
    pinchStartTranslateY = viewTranslateY;
    pinchActive = true;
    pointerDown = false;
    moved = false;
    liftDragSession = false;
    slopePenGestureArmed = false;
    slopeDownClientPoint = null;
    hideLiftConfirm();
  }

  function getOrCreateLiftConfirm() {
    let el = document.getElementById('mobileLiftConfirm');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'mobileLiftConfirm';
    el.className = 'mobile-lift-confirm hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<button type="button" class="mobile-lift-confirm-btn mobile-lift-confirm-build">Build</button>' +
      '<button type="button" class="mobile-lift-confirm-btn mobile-lift-confirm-cancel">Cancel</button>';
    document.body.appendChild(el);
    return el;
  }

  function hideLiftConfirm() {
    const el = document.getElementById('mobileLiftConfirm');
    if (!el) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && el.contains(active)) {
      try {
        active.blur();
      } catch {
        /* ignore */
      }
    }
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    pendingLiftReleasePoint = null;
    pendingSlopeReleasePoint = null;
  }

  function hideBuildConfirmUi() {
    hideLiftConfirm();
    const cancelLiftBtn = document.getElementById('cancelLiftBtn');
    if (cancelLiftBtn) cancelLiftBtn.classList.add('hidden');
    const cancelSlopeBtn = document.getElementById('cancelSlopeBtn');
    if (cancelSlopeBtn) cancelSlopeBtn.classList.add('hidden');
    const cancelBuildBtn = document.getElementById('cancelBuildBtn');
    if (cancelBuildBtn) cancelBuildBtn.classList.add('hidden');
    pendingBuildKind = null;
    pendingSlopeMode = null;
  }

  function placeLiftConfirmNear(x, y, preferBelow = false) {
    const el = getOrCreateLiftConfirm();
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const panelW = 134;
    const panelH = 38;
    const left = Math.max(8, Math.min(vw - panelW - 8, Math.round(x)));
    let top = Math.round(y);
    if (preferBelow) {
      const below = y;
      const above = y - panelH - 6;
      top = (below + panelH + 8 <= vh) ? below : above;
    }
    top = Math.max(8, Math.min(vh - panelH - 8, top));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function getLiftCandidateFromEvent(e) {
    if (!DOM?.canvas || !state?.imageWidth || !state?.imageHeight) return null;
    const rect = DOM.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      x: x * (state.imageWidth / rect.width),
      y: y * (state.imageHeight / rect.height),
    };
  }

  function isLiftBuildValid(topPt) {
    if (!state?.liftBottom || !topPt) return false;
    if (state.buildBlocked) return false;
    if (topPt.y >= state.liftBottom.y) return false;
    const typeId = state.liftType || (state.liftTypes[0] && state.liftTypes[0].id);
    const liftDef = state.liftTypes.find((l) => l.id === typeId);
    if (!liftDef) return false;
    const lengthM = getLiftLengthM(state.liftBottom, topPt);
    const maxLength = (liftDef && liftDef.max_length != null) ? Number(liftDef.max_length) : Infinity;
    if (lengthM > maxLength) return false;
    const baseCost = (liftDef && liftDef.base_cost != null) ? Number(liftDef.base_cost) : 0;
    const costPerMeter = (liftDef && liftDef.cost_per_meter != null) ? Number(liftDef.cost_per_meter) : 0;
    const totalCost = Math.round(baseCost + lengthM * costPerMeter);
    return (state.budget || 0) >= totalCost;
  }

  function placeLiftConfirmByTopGhost(clientX, clientY) {
    // Align with the dollar label text origin used by lift preview rendering.
    const rect = DOM.canvas?.getBoundingClientRect();
    const width = rect?.width || 0;
    const height = rect?.height || 0;
    const labelLeftX = clientX + (0.005 * width);
    const lineHeight = 14;
    const labelTextHeight = 12;
    const labelTopY = clientY + (0.005 * height);
    const panelTopY = labelTopY + lineHeight + labelTextHeight + LABEL_VERTICAL_GAP;
    // Prefer just below the dollar amount; if offscreen, fallback above.
    placeLiftConfirmNear(labelLeftX, panelTopY, true);
  }

  function placeSlopeConfirmByLabel(clientX, clientY) {
    const rect = DOM.canvas?.getBoundingClientRect();
    const width = rect?.width || 0;
    const height = rect?.height || 0;
    const labelLeftX = clientX + (0.005 * width);
    const lineHeight = 14;
    const labelTextHeight = 12;
    const labelTopY = clientY + (0.005 * height);
    const panelTopY = labelTopY + lineHeight + labelTextHeight + LABEL_VERTICAL_GAP;
    placeLiftConfirmNear(labelLeftX, panelTopY, true);
  }

  function makeSyntheticPointerEvent(pt) {
    return {
      preventDefault() {},
      clientX: pt.clientX,
      clientY: pt.clientY,
    };
  }

  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq <= 1e-9) return { x: ax, y: ay };
    const apx = px - ax;
    const apy = py - ay;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    return { x: ax + abx * t, y: ay + aby * t };
  }

  function getPointModeSlopeStartSnap(pt) {
    if (!pt) return null;
    let best = null;
    let bestDistSq = SLOPE_START_ASSIST_SNAP_DIST_SQ;

    for (const lift of state?.lifts || []) {
      const bottom = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
      const top = fromNormalized(lift.topStation.x, lift.topStation.y);
      for (const station of [bottom, top]) {
        const dx = pt.x - station.x;
        const dy = pt.y - station.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          best = { x: station.x, y: station.y };
        }
      }
    }

    for (const slope of state?.slopes || []) {
      const points = Array.isArray(slope.points) ? slope.points.map((p) => fromNormalized(p.x, p.y)) : [];
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        const q = closestPointOnSegment(pt.x, pt.y, a.x, a.y, b.x, b.y);
        const dx = pt.x - q.x;
        const dy = pt.y - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          best = { x: q.x, y: q.y };
        }
      }
    }

    return best;
  }

  function isSlopeEndpointSnappable(pt) {
    if (!pt) return false;
    // Snap to lift stations.
    for (const lift of state?.lifts || []) {
      const bottom = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
      const top = fromNormalized(lift.topStation.x, lift.topStation.y);
      for (const station of [bottom, top]) {
        const dx = pt.x - station.x;
        const dy = pt.y - station.y;
        if ((dx * dx + dy * dy) <= SLOPE_SNAP_DIST_SQ) return true;
      }
    }
    // Snap to existing slopes (segment approximation).
    for (const slope of state?.slopes || []) {
      const points = Array.isArray(slope.points) ? slope.points.map((p) => fromNormalized(p.x, p.y)) : [];
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        const q = closestPointOnSegment(pt.x, pt.y, a.x, a.y, b.x, b.y);
        const dx = pt.x - q.x;
        const dy = pt.y - q.y;
        if ((dx * dx + dy * dy) <= SLOPE_SNAP_DIST_SQ) return true;
      }
    }
    return false;
  }

  function isSlopePenReadyForConfirm() {
    const points = state?.slopePoints || [];
    if (points.length < 2) return false;
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return false;
    // Match points-mode requirement: both endpoints must be snap-near.
    return isSlopeEndpointSnappable(first) && isSlopeEndpointSnappable(last);
  }

  const confirmEl = getOrCreateLiftConfirm();
  const buildBtn = confirmEl.querySelector('.mobile-lift-confirm-build');
  const cancelBtn = confirmEl.querySelector('.mobile-lift-confirm-cancel');
  if (buildBtn) {
    buildBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (pendingBuildKind === 'lift' && pendingLiftReleasePoint && typeof onCanvasClick === 'function') {
        onCanvasClick(makeSyntheticPointerEvent(pendingLiftReleasePoint));
      } else if (pendingBuildKind === 'slope') {
        if (pendingSlopeMode === 'pen' && typeof onCanvasMouseUp === 'function') {
          onCanvasMouseUp();
        } else if (pendingSlopeMode === 'points' && pendingSlopeReleasePoint && typeof onCanvasDblClick === 'function') {
          onCanvasDblClick(makeSyntheticPointerEvent(pendingSlopeReleasePoint));
        }
      }
      hideLiftConfirm();
      pendingBuildKind = null;
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (pendingBuildKind === 'slope') {
        const rightSlopeCancelBtn = document.getElementById('cancelSlopeBtn');
        if (rightSlopeCancelBtn) rightSlopeCancelBtn.click();
        else if (typeof cancelSlope === 'function') cancelSlope();
      } else {
        const rightLiftCancelBtn = document.getElementById('cancelLiftBtn');
        if (rightLiftCancelBtn) rightLiftCancelBtn.click();
        else if (typeof cancelLift === 'function') cancelLift();
      }
      hideBuildConfirmUi();
    });
  }

  const rightMenuCancelBtn = document.getElementById('cancelLiftBtn');
  if (rightMenuCancelBtn) {
    // Keep both cancel actions synchronized.
    rightMenuCancelBtn.addEventListener('click', () => {
      hideBuildConfirmUi();
    });
  }
  const rightSlopeCancelBtn = document.getElementById('cancelSlopeBtn');
  if (rightSlopeCancelBtn) {
    rightSlopeCancelBtn.addEventListener('click', () => {
      hideBuildConfirmUi();
    });
  }
  const cancelBuildBtn = document.getElementById('cancelBuildBtn');
  if (cancelBuildBtn) {
    cancelBuildBtn.addEventListener('click', () => {
      hideBuildConfirmUi();
    });
  }

  DOM.canvas.style.touchAction = 'none';

  const forwardMove = (e) => {
    if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
  };

  DOM.canvas.addEventListener('pointerdown', (e) => {
    if (!allowPointer(e)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      beginPinch();
      DOM.canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    pointerDown = true;
    moved = false;
    placedBottomThisGesture = false;
    liftDragSession = false;
    slopePenGestureArmed = false;
    slopeDownClientPoint = null;
    DOM.canvas.setPointerCapture?.(e.pointerId);

    const isLiftBuild = state?.mode === 'lift' && state?.buildArmed === true;
    const isSlopeBuild = state?.mode === 'slope' && state?.buildArmed === true;
    if (isLiftBuild) hideLiftConfirm();
    if (isLiftBuild) {
      if (!state?.liftBottom && typeof onCanvasClick === 'function') {
        // First touch in lift mode places bottom station.
        onCanvasClick(e);
        placedBottomThisGesture = true;
      }
      liftDragSession = !!state?.liftBottom;
      if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
    } else if (isSlopeBuild) {
      // Defer slope mode choice until gesture intent is clear:
      // tap => points mode, drag => pen mode.
      slopePenGestureArmed = true;
      slopeDownClientPoint = { clientX: e.clientX, clientY: e.clientY };
      if (state) state.slopeDrawMode = 'points';
      if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
    } else {
      if (typeof onCanvasMouseDown === 'function') onCanvasMouseDown(e);
      if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
    }
    e.preventDefault();
  });

  DOM.canvas.addEventListener('pointermove', (e) => {
    if (!allowPointer(e)) return;
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchActive) {
      const pair = getPinchPair();
      if (pair) {
        const [a, b] = pair;
        const dist = Math.max(1, getDistance(a, b));
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const zoomFactor = dist / pinchStartDistance;
        viewScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartScale * zoomFactor));
        viewTranslateX = pinchStartTranslateX + (midX - pinchStartMidX);
        viewTranslateY = pinchStartTranslateY + (midY - pinchStartMidY);
        applyViewTransform();
      }
      e.preventDefault();
      return;
    }
    if (!pointerDown) return;
    if (state?.mode === 'slope' && state?.buildArmed === true && slopePenGestureArmed && slopeDownClientPoint) {
      const dx = e.clientX - slopeDownClientPoint.clientX;
      const dy = e.clientY - slopeDownClientPoint.clientY;
      if ((dx * dx + dy * dy) >= SLOPE_DRAG_START_SQ) {
        slopePenGestureArmed = false;
        if (state) state.slopeDrawMode = 'pen';
        if (typeof onCanvasMouseDown === 'function') {
          onCanvasMouseDown(makeSyntheticPointerEvent(slopeDownClientPoint));
        }
      }
    }
    moved = true;
    forwardMove(e);
    e.preventDefault();
  });

  DOM.canvas.addEventListener('pointerup', (e) => {
    if (!allowPointer(e)) return;
    activePointers.delete(e.pointerId);
    if (pinchActive) {
      if (activePointers.size < 2) pinchActive = false;
      e.preventDefault();
      return;
    }
    if (!pointerDown) return;
    pointerDown = false;
    forwardMove(e);

    const isLiftBuild = state?.mode === 'lift' && state?.buildArmed === true;
    const isSlopeBuild = state?.mode === 'slope' && state?.buildArmed === true;
    const isGroomerBuild = state?.mode === 'groomer' && state?.buildArmed === true;
    const isOperateInteraction = state?.buildArmed !== true;
    if (isLiftBuild && liftDragSession && state?.liftBottom && typeof onCanvasClick === 'function') {
      // Release shows confirmation near top station.
      pendingLiftReleasePoint = { clientX: e.clientX, clientY: e.clientY };
      pendingBuildKind = 'lift';
      const topCandidate = getLiftCandidateFromEvent(e);
      const canBuild = isLiftBuildValid(topCandidate);
      if (buildBtn) buildBtn.classList.toggle('hidden', !canBuild);
      // Anchor controls near ghost top station.
      placeLiftConfirmByTopGhost(e.clientX, e.clientY);
    } else if (isSlopeBuild && state?.penDrawing && state?.slopePoints?.length >= 2) {
      if (isSlopePenReadyForConfirm()) {
        // Keep pen path pending, show confirmation like lift flow.
        pendingBuildKind = 'slope';
        pendingSlopeMode = 'pen';
        pendingSlopeReleasePoint = { clientX: e.clientX, clientY: e.clientY };
        if (buildBtn) buildBtn.classList.remove('hidden');
        placeSlopeConfirmByLabel(e.clientX, e.clientY);
      } else if (typeof onCanvasMouseUp === 'function') {
        // Not buildable: run the normal finalize path to show standard slope error feedback.
        onCanvasMouseUp(e);
        hideLiftConfirm();
      }
    } else if (isSlopeBuild && !moved && typeof onCanvasClick === 'function') {
      // Tap-to-add slope points (desktop-like points mode on mobile).
      if (state) state.slopeDrawMode = 'points';
      const hasNoSlopePoints = !state?.slopePoints || state.slopePoints.length === 0;
      if (hasNoSlopePoints) {
        const candidate = getLiftCandidateFromEvent(e);
        const snap = getPointModeSlopeStartSnap(candidate);
        if (snap && DOM?.canvas && state?.imageWidth && state?.imageHeight) {
          const rect = DOM.canvas.getBoundingClientRect();
          const snapClientX = rect.left + ((snap.x / state.imageWidth) * rect.width);
          const snapClientY = rect.top + ((snap.y / state.imageHeight) * rect.height);
          onCanvasClick(makeSyntheticPointerEvent({ clientX: snapClientX, clientY: snapClientY }));
        } else {
          onCanvasClick(e);
        }
      } else {
        onCanvasClick(e);
      }
      const points = state?.slopePoints || [];
      const lastPoint = points.length ? points[points.length - 1] : null;
      const canFinalize = points.length >= 2 && isSlopeEndpointSnappable(lastPoint);
      if (canFinalize) {
        pendingBuildKind = 'slope';
        pendingSlopeMode = 'points';
        pendingSlopeReleasePoint = { clientX: e.clientX, clientY: e.clientY };
        if (buildBtn) buildBtn.classList.remove('hidden');
        placeSlopeConfirmByLabel(e.clientX, e.clientY);
      } else {
        hideLiftConfirm();
      }
    } else if (isGroomerBuild && typeof onCanvasClick === 'function') {
      // On mobile, groomer placement should happen on touch release location.
      onCanvasClick(e);
      hideLiftConfirm();
    } else if (isOperateInteraction && typeof onCanvasClick === 'function') {
      // In mobile operate interactions, always forward release as a click so popups pin
      // reliably even when touch introduces small movement.
      onCanvasClick(e);
    } else if (!moved && typeof onCanvasClick === 'function') {
      onCanvasClick(e);
      hideLiftConfirm();
    }

    liftDragSession = false;
    placedBottomThisGesture = false;
    slopePenGestureArmed = false;
    slopeDownClientPoint = null;
    const shouldSkipMouseUpForSlopeConfirm =
      isSlopeBuild &&
      pendingBuildKind === 'slope' &&
      state?.penDrawing === true &&
      state?.slopePoints?.length >= 2;
    if (!shouldSkipMouseUpForSlopeConfirm && typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
    e.preventDefault();
  });

  DOM.canvas.addEventListener('pointercancel', (e) => {
    if (!allowPointer(e)) return;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchActive = false;
    pointerDown = false;
    liftDragSession = false;
    placedBottomThisGesture = false;
    hideLiftConfirm();
    if (typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
  });

  DOM.canvas.addEventListener('pointerleave', () => {
    // On mobile, pointerleave is noisy; avoid auto-hiding popups so action buttons remain tappable.
  });
}
