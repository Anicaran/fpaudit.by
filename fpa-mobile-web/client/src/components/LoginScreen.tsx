import { FormEvent, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';

export function LoginScreen() {
  const { login, savedUsername } = useSession();
  const { toast } = useToast();
  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      toast('Вход выполнен', 'ok');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="screen active screen-login">
      <header className="hero">
        <h1>FP Audit</h1>
        <p>Задачи · цены · печать ценников</p>
      </header>
      <form className="card" onSubmit={handleSubmit}>
        <label>
          Логин
          <input
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="pass-row">
          <span>Пароль</span>
          <div className="pass-wrap">
            <input
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn icon"
              aria-label="Показать пароль"
              onClick={() => setShowPass((v) => !v)}
            >
              👁
            </button>
          </div>
        </label>
        <p className="hint-login muted">
          Магазин определится автоматически после входа (как в приложении).
        </p>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn primary block" disabled={loading}>
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </section>
  );
}
