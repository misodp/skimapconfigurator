import { attachUnifiedCanvasInput } from '../shared/canvas-input-unified.js';

/**
 * Legacy desktop adapter kept as thin wrapper during migration.
 */
export function attachDesktopCanvasInput(ctx) {
  attachUnifiedCanvasInput(ctx);
}
