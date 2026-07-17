import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'code_128',
  'code_39',
  'upc_a',
  'upc_e',
  'qr_code',
] as const;

export function canUseLiveCamera(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function liveCameraBlockedReason(): string | null {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) {
    return 'Сайт открыт по HTTP — живая камера в браузере недоступна. Запустите start-https.bat и откройте https://… на телефоне.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Камера недоступна в этом браузере.';
  }
  return null;
}

function buildReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.QR_CODE,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 80,
    delayBetweenScanSuccess: 250,
  });
}

async function decodeWithNativeDetector(source: ImageBitmapSource): Promise<string | null> {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    const detector = new BarcodeDetector({ formats: [...NATIVE_FORMATS] });
    const codes = await detector.detect(source);
    const text = codes[0]?.rawValue?.trim();
    return text || null;
  } catch {
    return null;
  }
}

async function decodeBlobWithZxing(blob: Blob): Promise<string | null> {
  const reader = buildReader();
  const url = URL.createObjectURL(blob);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return result.getText()?.trim() || null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
    reader.reset();
  }
}

/** Центр-кроп и увеличение — помогает снять мелкий штрих-код с ценника. */
async function buildEnhancedBlobs(file: File): Promise<Blob[]> {
  const bitmap = await createImageBitmap(file);
  const blobs: Blob[] = [file];
  try {
    const variants: Array<{ sx: number; sy: number; sw: number; sh: number; scale: number }> = [
      { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height, scale: 2 },
      {
        sx: Math.floor(bitmap.width * 0.12),
        sy: Math.floor(bitmap.height * 0.22),
        sw: Math.floor(bitmap.width * 0.76),
        sh: Math.floor(bitmap.height * 0.56),
        scale: 2.5,
      },
    ];
    for (const v of variants) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(v.sw * v.scale));
      canvas.height = Math.max(1, Math.floor(v.sh * v.scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, v.sx, v.sy, v.sw, v.sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95),
      );
      if (blob) blobs.push(blob);
    }
  } finally {
    bitmap.close();
  }
  return blobs;
}

export async function decodeBarcodeFromImageFile(file: File): Promise<string> {
  const native = await decodeWithNativeDetector(file);
  if (native) return native;

  const blobs = await buildEnhancedBlobs(file);
  for (const blob of blobs) {
    const bitmap = await createImageBitmap(blob);
    try {
      const fromNative = await decodeWithNativeDetector(bitmap);
      if (fromNative) return fromNative;
    } finally {
      bitmap.close();
    }
    const fromZxing = await decodeBlobWithZxing(blob);
    if (fromZxing) return fromZxing;
  }

  throw new Error('Не удалось распознать штрих-код на фото. Снимите ближе и при хорошем освещении.');
}

export { buildReader };
