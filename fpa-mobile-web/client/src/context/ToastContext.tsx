import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = '' | 'ok' | 'err';

interface ToastState {
  msg: string;
  kind: ToastKind;
  visible: boolean;
}

interface ToastContextValue {
  toast: (msg: string, kind?: ToastKind) => void;
  state: ToastState;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({ msg: '', kind: '', visible: false });
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback((msg: string, kind: ToastKind = '') => {
    clearTimeout(timer.current);
    setState({ msg, kind, visible: true });
    timer.current = setTimeout(() => {
      setState((s) => ({ ...s, visible: false }));
    }, 2800);
  }, []);

  const value = useMemo(() => ({ toast, state }), [toast, state]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
