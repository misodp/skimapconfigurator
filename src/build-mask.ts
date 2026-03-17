let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let maskData: ImageData | null = null;
let maskW = 0;
let maskH = 0;
let maskReady = false;

export async function initBuildMask(maskUrl: string): Promise<void> {
  const img = new Image();
  img.decoding = 'async';
  img.crossOrigin = 'anonymous';
  img.src = maskUrl;
  await img.decode();

  maskCanvas = document.createElement('canvas');
  maskCanvas.width = img.naturalWidth || img.width;
  maskCanvas.height = img.naturalHeight || img.height;
  maskW = maskCanvas.width;
  maskH = maskCanvas.height;

  maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskCtx) throw new Error('Failed to create build mask 2D context');

  maskCtx.clearRect(0, 0, maskW, maskH);
  maskCtx.drawImage(img, 0, 0, maskW, maskH);
  maskData = maskCtx.getImageData(0, 0, maskW, maskH);
  maskReady = true;
}

export function isBuildMaskReady(): boolean {
  return maskReady && !!maskData && maskW > 0 && maskH > 0;
}

/**
 * Returns true if the image pixel coordinate (x,y) is buildable.
 * Mask convention: white/opaque = buildable, black/transparent = blocked.
 */
export function isBuildableAtImagePoint(x: number, y: number): boolean {
  if (!isBuildMaskReady() || !maskData) return true; // fail-open to avoid bricking building
  const ix = Math.max(0, Math.min(maskW - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(maskH - 1, Math.round(y)));
  const idx = (iy * maskW + ix) * 4;
  const r = maskData.data[idx] ?? 0;
  const g = maskData.data[idx + 1] ?? 0;
  const b = maskData.data[idx + 2] ?? 0;
  const a = maskData.data[idx + 3] ?? 0;

  // Block only if the sampled pixel is absolute black (RGB = 0,0,0), ignoring alpha.
  // This makes mask authoring unambiguous: paint pure black for "no-build".
  if (r === 0 && g === 0 && b === 0) return false;
  return true;
}

