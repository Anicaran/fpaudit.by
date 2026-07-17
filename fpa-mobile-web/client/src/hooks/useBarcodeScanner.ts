import { useCallback, useRef } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { buildReader, canUseLiveCamera } from '../barcodeScan';

type FocusConstraint = MediaTrackConstraints & {
  focusMode?: ConstrainDOMString;
  advanced?: Array<MediaTrackConstraintSet & { focusMode?: string }>;
};

function safeStop(controls: IScannerControls | null, reader: ReturnType<typeof buildReader> | null) {
  try {
    controls?.stop();
  } catch {
    /* camera already released */
  }
  try {
    reader?.reset();
  } catch {
    /* reader already reset */
  }
}

async function applyContinuousFocus(controls: IScannerControls, video: HTMLVideoElement) {
  const focusConstraint: FocusConstraint = {
    focusMode: 'continuous',
    advanced: [{ focusMode: 'continuous' }],
  };

  try {
    await controls.streamVideoConstraintsApply?.(focusConstraint);
  } catch {
    /* ignore — not all browsers accept focusMode */
  }

  const stream = video.srcObject;
  if (!(stream instanceof MediaStream)) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  try {
    const caps = track.getCapabilities?.() as MediaTrackCapabilities & { focusMode?: string[] };
    if (caps?.focusMode?.includes('continuous')) {
      await track.applyConstraints(focusConstraint);
    } else {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as FocusConstraint);
    }
  } catch {
    /* device may not support continuous autofocus */
  }
}

export function useBarcodeScanner() {
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<ReturnType<typeof buildReader> | null>(null);
  const closedRef = useRef(false);

  const release = useCallback(() => {
    closedRef.current = true;
    safeStop(controlsRef.current, readerRef.current);
    controlsRef.current = null;
    readerRef.current = null;
  }, []);

  const stop = release;

  const setTorch = useCallback(async (on: boolean) => {
    const controls = controlsRef.current;
    if (!controls?.switchTorch) return false;
    try {
      await controls.switchTorch(on);
      return true;
    } catch {
      return false;
    }
  }, []);

  const canTorch = useCallback(() => !!controlsRef.current?.switchTorch, []);

  const start = useCallback(
    async (
      video: HTMLVideoElement,
      onDetected: (code: string) => void,
    ): Promise<() => void> => {
      if (!canUseLiveCamera()) {
        throw new Error('Живая камера недоступна без HTTPS');
      }

      release();
      closedRef.current = false;

      const reader = buildReader();
      readerRef.current = reader;

      const videoConstraints: FocusConstraint = {
        facingMode: { ideal: 'environment' },
        width: { min: 640, ideal: 1920 },
        height: { min: 480, ideal: 1080 },
        focusMode: { ideal: 'continuous' },
        advanced: [{ focusMode: 'continuous' }],
      };

      const onResult = (result: { getText(): string } | undefined, err: unknown) => {
        if (closedRef.current || err) return;
        const raw = result?.getText()?.trim();
        if (!raw) return;
        closedRef.current = true;
        window.setTimeout(() => {
          onDetected(raw);
        }, 0);
      };

      try {
        const controls = await reader.decodeFromConstraints(
          { video: videoConstraints, audio: false },
          video,
          onResult,
        );
        controlsRef.current = controls;
        await applyContinuousFocus(controls, video);
      } catch (ex) {
        // Fallback without advanced focus constraints (older WebViews)
        try {
          reader.reset();
          const fallbackReader = buildReader();
          readerRef.current = fallbackReader;
          const controls = await fallbackReader.decodeFromConstraints(
            {
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
              audio: false,
            },
            video,
            onResult,
          );
          controlsRef.current = controls;
          await applyContinuousFocus(controls, video);
        } catch (inner) {
          release();
          const err = inner instanceof Error ? inner : ex;
          if (err instanceof DOMException) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              throw new Error('Нет доступа к камере. Разрешите камеру в настройках браузера.');
            }
            if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
              throw new Error('Камера не найдена на этом устройстве.');
            }
          }
          throw err instanceof Error ? err : new Error(String(err));
        }
      }

      return release;
    },
    [release],
  );

  return { start, stop, setTorch, canTorch };
}
