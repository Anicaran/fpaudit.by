import { useToast } from '../context/ToastContext';

export function Toast() {
  const { state } = useToast();
  if (!state.visible) return null;
  const cls = 'toast' + (state.kind ? ` ${state.kind}` : '');
  return <div className={cls}>{state.msg}</div>;
}
