// ============================================================
// YOUXIS IOT — Error Boundary
// Capture une erreur de rendu React ET les erreurs asynchrones
// (WebSocket, fetch, timers) pour les afficher à l'écran au
// lieu d'un écran blanc muet.
// ============================================================
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('💥 Erreur React capturée :', error, info);
  }

  // Capture les erreurs asynchrones (hors cycle de rendu React)
  componentDidMount() {
    this._onError = (e) => this.setState({ error: e.error || new Error(String(e.message)) });
    this._onReject = (e) => this.setState({ error: e.reason || new Error('Promesse rejetée') });
    window.addEventListener('error', this._onError);
    window.addEventListener('unhandledrejection', this._onReject);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this._onError);
    window.removeEventListener('unhandledrejection', this._onReject);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div className="mx-auto max-w-3xl p-8">
          <h2 className="mb-3 text-xl font-bold text-red-400">💥 Une erreur est survenue</h2>
          <p className="mb-4 text-sm text-slate-300">
            Copie le texte ci-dessous et envoie-le pour diagnostic :
          </p>
          <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-red-300">
            {String(err && err.message ? err.message : err)}
            {'\n\n'}
            {err && err.stack ? err.stack : ''}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
