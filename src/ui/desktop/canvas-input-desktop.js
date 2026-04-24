import { fromNormalized, getLiftLengthM, getSlopeCost, getSlopePathLengthM } from '../../geometry.js';

/**
 * Desktop canvas input adapter (mouse-first behavior, plus touch support).
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
    cancelLift,
    cancelSlope,
    hideLiftHoverPopup,
    hideGroomerHoverPopup,
    hideSlopeHoverPopup,
  } = ctx || {};

  if (!DOM?.canvas) return;
  DOM.canvas.style.touchAction = 'none';
  const TOUCH_MOUSE_SUPPRESS_MS = 550;
  let lastTouchInteractionAt = 0;

  function markTouchInteraction() {
    lastTouchInteractionAt = Date.now();
  }

  function isLikelyCompatMouseEvent() {
    return (Date.now() - lastTouchInteractionAt) < TOUCH_MOUSE_SUPPRESS_MS;
  }

  let mouseDown = false;
  let mouseSlopePenGestureArmed = false;
  let mouseSlopeDownPoint = null;
  const leftMouseButtonMask = 1;

  const forwardMouseDown = (e) => {
    if (isLikelyCompatMouseEvent()) return;
    if (pendingBuildKind && pendingBuildPoint) return;
    mouseDown = true;
    if (state?.buildArmed === true && state?.mode === 'slope') {
      mouseSlopePenGestureArmed = true;
      mouseSlopeDownPoint = { clientX: e.clientX, clientY: e.clientY };
      state.slopeDrawMode = 'points';
      if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
      return;
    }
    if (typeof onCanvasMouseDown === 'function') onCanvasMouseDown(e);
  };
  const forwardMouseMove = (e) => {
    if (isLikelyCompatMouseEvent()) return;
    if (pendingBuildKind && pendingBuildPoint) return;
    if (mouseDown && (e.buttons & leftMouseButtonMask) !== leftMouseButtonMask) {
      // Some browsers miss mouseup when leaving/re-entering canvas; recover gracefully.
      forwardMouseUp(e);
      return;
    }
    if (mouseDown && state?.buildArmed === true && state?.mode === 'slope' && mouseSlopePenGestureArmed && mouseSlopeDownPoint) {
      const dx = e.clientX - mouseSlopeDownPoint.clientX;
      const dy = e.clientY - mouseSlopeDownPoint.clientY;
      if ((dx * dx + dy * dy) >= 12 * 12) {
        mouseSlopePenGestureArmed = false;
        state.slopeDrawMode = 'pen';
        if (typeof onCanvasMouseDown === 'function') {
          onCanvasMouseDown(makeSyntheticPointerEvent(mouseSlopeDownPoint));
        }
      }
    }
    if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
  };
  const forwardMouseUp = (e) => {
    if (isLikelyCompatMouseEvent()) return;
    if (!mouseDown && !(state?.buildArmed === true && state?.mode === 'slope' && state?.penDrawing === true)) return;
    mouseDown = false;
    mouseSlopePenGestureArmed = false;
    mouseSlopeDownPoint = null;
    const isPenSlopeRelease =
      state?.buildArmed === true &&
      state?.mode === 'slope' &&
      state?.penDrawing === true &&
      (state?.slopePoints?.length || 0) >= 2;
    if (isPenSlopeRelease) {
      // Freeze the drawn pen path while confirmation is open.
      state.penDrawing = false;
      pendingBuildKind = 'slope';
      pendingBuildPoint = { clientX: e.clientX, clientY: e.clientY };
      pendingSlopeMode = 'pen';
      if (buildBtn) buildBtn.classList.toggle('hidden', !canBuildPendingSlope());
      showDesktopBuildConfirm(e.clientX, e.clientY);
      return;
    }
    if (pendingBuildKind && pendingBuildPoint) return;
    if (typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
  };
  DOM.canvas.addEventListener('mousedown', forwardMouseDown);
  DOM.canvas.addEventListener('mousemove', forwardMouseMove);
  DOM.canvas.addEventListener('mouseup', forwardMouseUp);
  window.addEventListener('mouseup', forwardMouseUp);

  let pendingBuildKind = null;
  let pendingBuildPoint = null;
  let pendingSlopeMode = null;
  const SLOPE_SNAP_DIST_SQ = 28 * 28;
  const SLOPE_UPHILL_TOLERANCE_PX = 15;

  function makeSyntheticPointerEvent(pt) {
    return {
      preventDefault() {},
      stopPropagation() {},
      clientX: pt.clientX,
      clientY: pt.clientY,
    };
  }

  function getOrCreateDesktopBuildConfirm() {
    let el = document.getElementById('desktopBuildConfirm');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'desktopBuildConfirm';
    el.className = 'desktop-build-confirm hidden';
    el.setAttribute('aria-hidden', 'true');
    el.style.touchAction = 'manipulation';
    el.innerHTML =
      '<button type="button" class="desktop-build-confirm-btn desktop-build-confirm-build">Build</button>' +
      '<button type="button" class="desktop-build-confirm-btn desktop-build-confirm-cancel">Cancel</button>';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('pointerup', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(el);
    return el;
  }

  function hideDesktopBuildConfirm() {
    const el = document.getElementById('desktopBuildConfirm');
    if (!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    pendingBuildKind = null;
    pendingBuildPoint = null;
    pendingSlopeMode = null;
  }

  function syncPinnedMouseImageFromPendingPoint() {
    if (!(pendingBuildKind === 'lift' && pendingBuildPoint)) return;
    const rect = DOM.canvas?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height || !state?.imageWidth || !state?.imageHeight) return;
    const x = pendingBuildPoint.clientX - rect.left;
    const y = pendingBuildPoint.clientY - rect.top;
    state.mouseImage = {
      x: x * (state.imageWidth / rect.width),
      y: y * (state.imageHeight / rect.height),
    };
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

  function showDesktopBuildConfirm(clientX, clientY) {
    const el = getOrCreateDesktopBuildConfirm();
    const panelW = 134;
    const panelH = 38;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    const left = Math.max(8, Math.min(vw - panelW - 8, Math.round(clientX + 10)));
    const top = Math.max(8, Math.min(vh - panelH - 8, Math.round(clientY + 14)));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    syncPinnedMouseImageFromPendingPoint();
  }

  const confirmEl = getOrCreateDesktopBuildConfirm();
  const buildBtn = confirmEl.querySelector('.desktop-build-confirm-build');
  const cancelBtn = confirmEl.querySelector('.desktop-build-confirm-cancel');
  if (buildBtn) {
    buildBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!pendingBuildKind || !pendingBuildPoint) return;
      if (pendingBuildKind === 'lift' && typeof onCanvasClick === 'function') {
        onCanvasClick(makeSyntheticPointerEvent(pendingBuildPoint));
      } else if (pendingBuildKind === 'slope' && pendingSlopeMode === 'pen' && typeof onCanvasMouseUp === 'function') {
        // Pen confirm path freezes drawing on release; re-arm just for finalize.
        state.penDrawing = true;
        onCanvasMouseUp();
      } else if (pendingBuildKind === 'slope' && typeof onCanvasDblClick === 'function') {
        onCanvasDblClick(makeSyntheticPointerEvent(pendingBuildPoint));
      }
      hideDesktopBuildConfirm();
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pendingBuildKind === 'lift') {
        const rightLiftCancelBtn = document.getElementById('cancelLiftBtn');
        const rightBuildCancelBtn = document.getElementById('cancelBuildBtn');
        if (rightLiftCancelBtn && typeof rightLiftCancelBtn.click === 'function') rightLiftCancelBtn.click();
        else if (rightBuildCancelBtn && typeof rightBuildCancelBtn.click === 'function') rightBuildCancelBtn.click();
        else if (typeof cancelLift === 'function') cancelLift();
      }
      if (pendingBuildKind === 'slope') {
        const rightSlopeCancelBtn = document.getElementById('cancelSlopeBtn');
        const rightBuildCancelBtn = document.getElementById('cancelBuildBtn');
        if (rightSlopeCancelBtn && typeof rightSlopeCancelBtn.click === 'function') rightSlopeCancelBtn.click();
        else if (rightBuildCancelBtn && typeof rightBuildCancelBtn.click === 'function') rightBuildCancelBtn.click();
        else if (typeof cancelSlope === 'function') cancelSlope();
      }
      hideDesktopBuildConfirm();
    });
  }

  const cancelLiftBtn = document.getElementById('cancelLiftBtn');
  if (cancelLiftBtn) cancelLiftBtn.addEventListener('click', hideDesktopBuildConfirm);
  const cancelSlopeBtn = document.getElementById('cancelSlopeBtn');
  if (cancelSlopeBtn) cancelSlopeBtn.addEventListener('click', hideDesktopBuildConfirm);
  const cancelBuildBtn = document.getElementById('cancelBuildBtn');
  if (cancelBuildBtn) cancelBuildBtn.addEventListener('click', hideDesktopBuildConfirm);

  function isLiftConfirmActive() {
    return pendingBuildKind === 'lift' && !!pendingBuildPoint;
  }

  function isAnyConfirmActive() {
    return !!(pendingBuildKind && pendingBuildPoint);
  }

  function pinLiftGhostAtPendingPoint() {
    if (!isLiftConfirmActive()) return;
    syncPinnedMouseImageFromPendingPoint();
    if (typeof onCanvasMouseMove === 'function') {
      onCanvasMouseMove(makeSyntheticPointerEvent(pendingBuildPoint));
    }
  }

  function openLiftConfirmAtPoint(clientX, clientY) {
    pendingBuildKind = 'lift';
    pendingBuildPoint = { clientX, clientY };
    pendingSlopeMode = null;
    const topCandidate = getLiftCandidateFromEvent(pendingBuildPoint);
    const canBuild = isLiftBuildValid(topCandidate);
    if (buildBtn) buildBtn.classList.toggle('hidden', !canBuild);
    pinLiftGhostAtPendingPoint();
    showDesktopBuildConfirm(clientX, clientY);
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

  function isSlopeEndpointSnappable(pt) {
    if (!pt) return false;
    for (const lift of state?.lifts || []) {
      const bottom = fromNormalized(lift.bottomStation.x, lift.bottomStation.y);
      const top = fromNormalized(lift.topStation.x, lift.topStation.y);
      for (const station of [bottom, top]) {
        const dx = pt.x - station.x;
        const dy = pt.y - station.y;
        if ((dx * dx + dy * dy) <= SLOPE_SNAP_DIST_SQ) return true;
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
        if ((dx * dx + dy * dy) <= SLOPE_SNAP_DIST_SQ) return true;
      }
    }
    return false;
  }

  function isSlopeNonUphill(points) {
    if (!Array.isArray(points) || points.length < 2) return false;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      if (!prev || !cur) return false;
      if (cur.y < prev.y - SLOPE_UPHILL_TOLERANCE_PX) return false;
    }
    return true;
  }

  function canBuildPendingSlope() {
    const points = state?.slopePoints || [];
    if (points.length < 2) return false;
    const lastPoint = points[points.length - 1];
    if (!isSlopeEndpointSnappable(lastPoint)) return false;
    if (!isSlopeNonUphill(points)) return false;
    const lengthM = getSlopePathLengthM(points);
    const totalCost = getSlopeCost(lengthM);
    return (state?.budget || 0) >= totalCost;
  }

  function handlePlacementTap(e) {
    const isLiftBuild = state?.buildArmed === true && state?.mode === 'lift';
    const isSlopePointsBuild = state?.buildArmed === true && state?.mode === 'slope' && state?.slopeDrawMode === 'points';
    if (isLiftBuild && state?.liftBottom) {
      openLiftConfirmAtPoint(e.clientX, e.clientY);
      return;
    }
    if (typeof onCanvasClick === 'function') onCanvasClick(e);
    if (isSlopePointsBuild && (state?.slopePoints?.length || 0) >= 2) {
      const points = state?.slopePoints || [];
      const lastPoint = points.length ? points[points.length - 1] : null;
      if (!isSlopeEndpointSnappable(lastPoint)) {
        hideDesktopBuildConfirm();
        return;
      }
      pendingBuildKind = 'slope';
      pendingBuildPoint = { clientX: e.clientX, clientY: e.clientY };
      pendingSlopeMode = 'points';
      if (buildBtn) buildBtn.classList.toggle('hidden', !canBuildPendingSlope());
      showDesktopBuildConfirm(e.clientX, e.clientY);
    } else {
      hideDesktopBuildConfirm();
    }
  }

  if (typeof onCanvasClick === 'function') {
    DOM.canvas.addEventListener('click', (e) => {
      if (isLikelyCompatMouseEvent()) return;
      if (isAnyConfirmActive()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      handlePlacementTap(e);
    });
  }

  DOM.canvas.addEventListener('mouseleave', (e) => {
    mouseDown = false;
    mouseSlopePenGestureArmed = false;
    mouseSlopeDownPoint = null;
    const liftConfirmActive = pendingBuildKind === 'lift' && !!pendingBuildPoint;
    if (state.mode === 'lift' && !liftConfirmActive) state.mouseImage = null;
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
    if (!liftConfirmActive && typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
  });

  // Keep desktop mouse semantics intact; add touch-only pointer mapping in parallel.
  let touchActive = false;
  let touchDownX = 0;
  let touchDownY = 0;
  let touchMoved = false;
  let touchLiftDragSession = false;
  let touchSlopePenGestureArmed = false;
  let touchSlopeDownPoint = null;
  const touchTapSlopSq = 14 * 14;
  DOM.canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    markTouchInteraction();
    touchActive = true;
    touchDownX = e.clientX;
    touchDownY = e.clientY;
    touchMoved = false;
    touchLiftDragSession = false;
    touchSlopePenGestureArmed = false;
    touchSlopeDownPoint = null;
    DOM.canvas.setPointerCapture?.(e.pointerId);
    const isLiftBuild = state?.buildArmed === true && state?.mode === 'lift';
    const isSlopeBuild = state?.buildArmed === true && state?.mode === 'slope';
    if (isLiftBuild && !state?.liftBottom && typeof onCanvasClick === 'function') {
      // Match mobile behavior: first touch immediately places lift bottom so drag shows ghost line.
      onCanvasClick(e);
      touchLiftDragSession = !!state?.liftBottom;
      if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
      e.preventDefault();
      return;
    }
    if (isSlopeBuild) {
      touchSlopePenGestureArmed = true;
      touchSlopeDownPoint = { clientX: e.clientX, clientY: e.clientY };
      state.slopeDrawMode = 'points';
      if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
      e.preventDefault();
      return;
    }
    if (typeof onCanvasMouseDown === 'function') onCanvasMouseDown(e);
    if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
    e.preventDefault();
  });
  DOM.canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !touchActive) return;
    markTouchInteraction();
    if (isAnyConfirmActive()) {
      e.preventDefault();
      return;
    }
    const dx = e.clientX - touchDownX;
    const dy = e.clientY - touchDownY;
    if ((dx * dx + dy * dy) > touchTapSlopSq) touchMoved = true;
    if (state?.buildArmed === true && state?.mode === 'slope' && touchSlopePenGestureArmed && touchSlopeDownPoint) {
      const sdx = e.clientX - touchSlopeDownPoint.clientX;
      const sdy = e.clientY - touchSlopeDownPoint.clientY;
      if ((sdx * sdx + sdy * sdy) >= 12 * 12) {
        touchSlopePenGestureArmed = false;
        state.slopeDrawMode = 'pen';
        if (typeof onCanvasMouseDown === 'function') {
          onCanvasMouseDown(makeSyntheticPointerEvent(touchSlopeDownPoint));
        }
      }
    }
    if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
    e.preventDefault();
  });
  DOM.canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !touchActive) return;
    markTouchInteraction();
    if (isAnyConfirmActive()) {
      touchActive = false;
      touchLiftDragSession = false;
      touchSlopePenGestureArmed = false;
      touchSlopeDownPoint = null;
      e.preventDefault();
      return;
    }
    const isLiftBuild = state?.buildArmed === true && state?.mode === 'lift';
    if (isLiftBuild && touchMoved && (touchLiftDragSession || state?.liftBottom)) {
      openLiftConfirmAtPoint(e.clientX, e.clientY);
      if (typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
      touchActive = false;
      touchLiftDragSession = false;
      touchSlopePenGestureArmed = false;
      touchSlopeDownPoint = null;
      e.preventDefault();
      return;
    }
    const isPenSlopeRelease =
      state?.buildArmed === true &&
      state?.mode === 'slope' &&
      state?.penDrawing === true &&
      (state?.slopePoints?.length || 0) >= 2;
    if (isPenSlopeRelease) {
      state.penDrawing = false;
      pendingBuildKind = 'slope';
      pendingBuildPoint = { clientX: e.clientX, clientY: e.clientY };
      pendingSlopeMode = 'pen';
      if (buildBtn) buildBtn.classList.toggle('hidden', !canBuildPendingSlope());
      showDesktopBuildConfirm(e.clientX, e.clientY);
      touchActive = false;
      touchLiftDragSession = false;
      touchSlopePenGestureArmed = false;
      touchSlopeDownPoint = null;
      e.preventDefault();
      return;
    }
    if (typeof onCanvasMouseMove === 'function') onCanvasMouseMove(e);
    if (!touchMoved) handlePlacementTap(e);
    if (typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
    touchActive = false;
    touchLiftDragSession = false;
    touchSlopePenGestureArmed = false;
    touchSlopeDownPoint = null;
    e.preventDefault();
  });
  DOM.canvas.addEventListener('pointercancel', (e) => {
    if (e.pointerType !== 'touch') return;
    markTouchInteraction();
    touchActive = false;
    touchLiftDragSession = false;
    touchSlopePenGestureArmed = false;
    touchSlopeDownPoint = null;
    if (typeof onCanvasMouseUp === 'function') onCanvasMouseUp(e);
  });
}
