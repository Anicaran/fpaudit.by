import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen active">
          <div className="card" style={{ margin: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Ошибка интерфейса</h2>
            <p className="muted small">{this.state.error.message || 'Неизвестная ошибка'}</p>
            <button
              type="button"
              className="btn primary block"
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
