import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { canUseLiveCamera, decodeBarcodeFromImageFile, liveCameraBlockedReason } from '../barcodeScan';
import { useToast } from '../context/ToastContext';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

type ScanMode = 'live' | 'photo';

function deferScanResult(code: string, onResult: (value: string) => void) {
  window.setTimeout(() => {
    onResult(code);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 50);
}

export function ScannerDialog({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const { start, stop, setTorch, canTorch } = useBarcodeScanner();
  const { toast } = useToast();
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef(onDetected);
  const finishingRef = useRef(false);
  const [mode, setMode] = useState<ScanMode>(() => (canUseLiveCamera() ? 'live' : 'photo'));
  const [decoding, setDecoding] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    onDetectedRef.current = onDetected;
  });

  const finishWithCode = (code: string) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    void setTorch(false);
    stop();
    onCloseRef.current();
    deferScanResult(code, (value) => {
      finishingRef.current = false;
      onDetectedRef.current(value);
    });
  };

  useEffect(() => {
    if (!open) {
      finishingRef.current = false;
      setTorchOn(false);
      setTorchAvailable(false);
      return;
    }
    setLiveError('');
    setDecoding(false);
    setMode(canUseLiveCamera() ? 'live' : 'photo');
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'live') return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const boot = () => {
      const video = videoRef.current;
      if (!video) {
        requestAnimationFrame(boot);
        return;
      }
      void start(video, (code) => {
        if (cancelled) return;
        finishWithCode(code);
      })
        .then((fn) => {
          if (cancelled) {
            fn();
            return;
          }
          cleanup = fn;
          setTorchAvailable(canTorch());
        })
        .catch((ex) => {
          const message = ex instanceof Error ? ex.message : String(ex);
          setLiveError(message);
          setMode('photo');
          toast(message, 'err');
        });
    };

    boot();

    return () => {
      cancelled = true;
      void setTorch(false);
      cleanup?.();
      stop();
    };
  }, [open, mode, start, stop, setTorch, canTorch, toast]);

  async function toggleTorch() {
    const next = !torchOn;
    const ok = await setTorch(next);
    if (ok) {
      setTorchOn(next);
    } else {
      toast('Фонарик недоступен на этой камере', 'err');
      setTorchAvailable(false);
    }
  }

  async function handleImageFile(file: File | undefined) {
    if (!file || finishingRef.current) return;
    setDecoding(true);
    try {
      const code = await decodeBarcodeFromImageFile(file);
      finishWithCode(code);
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : String(ex), 'err');
    } finally {
      setDecoding(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  }

  if (!open) return null;

  const blockedReason = liveCameraBlockedReason();

  return (
    <div
      className="scanner-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="scanner-sheet" role="dialog" aria-modal="true" aria-label="Сканер штрих-кода">
        <div className="scanner-sheet-header">
          <strong>Сканер штрих-кода</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        {blockedReason ? <p className="scanner-warn small">{blockedReason}</p> : null}
        {liveError && mode === 'photo' ? <p className="scanner-warn small">{liveError}</p> : null}

        {mode === 'live' ? (
          <>
            <div className="scanner-viewport">
              <video ref={videoRef} playsInline muted autoPlay />
              <div className="scanner-frame" aria-hidden />
            </div>
            <p className="scanner-hint muted small">
              Держите ценник на расстоянии 10–20 см — камера должна сфокусироваться сама
            </p>
            <div className="scanner-live-actions">
              {torchAvailable ? (
                <button type="button" className={'btn block' + (torchOn ? ' primary' : '')} onClick={() => void toggleTorch()}>
                  {torchOn ? 'Выключить фонарик' : 'Фонарик'}
                </button>
              ) : null}
              <button type="button" className="btn block" onClick={() => setMode('photo')}>
                Сканировать с фото
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="scanner-photo-panel">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => void handleImageFile(e.target.files?.[0])}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void handleImageFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn primary block"
                disabled={decoding}
                onClick={() => cameraInputRef.current?.click()}
              >
                {decoding ? 'Распознавание…' : 'Сфотографировать штрих-код'}
              </button>
              <button
                type="button"
                className="btn block"
                disabled={decoding}
                onClick={() => galleryInputRef.current?.click()}
              >
                Выбрать из галереи
              </button>
            </div>
            {canUseLiveCamera() ? (
              <button type="button" className="btn block" onClick={() => setMode('live')}>
                Живая камера
              </button>
            ) : null}
          </>
        )}

        <button type="button" className="btn block scanner-cancel" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
