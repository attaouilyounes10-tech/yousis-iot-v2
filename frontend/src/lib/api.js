// ============================================================
// YOUXIS IOT — Client API (fetch vers /api)
// Envoie le JWT en-tête Authorization: Bearer <token>.
// ============================================================
let token = null;

// Callback appelé en cas de 401 (compte disparu / token invalide) :
// permet au contexte d'auth de déconnecter proprement l'utilisateur.
let onUnauthorized = null;
export function setOnUnauthorized(cb) {
  onUnauthorized = cb;
}

export function setToken(t) {
  token = t;
}

async function req(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Les réponses 204 n'ont pas de corps
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  // 401 : compte introuvable (base réinitialisée) ou token invalide.
  // On déconnecte pour forcer une reconnexion propre.
  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized();
    const detail = data && data.message ? ` — ${data.message}` : '';
    throw new Error((data && data.error ? data.error : 'Authentification requise') + detail);
  }

  if (!res.ok) {
    const detail = data && data.message ? ` — ${data.message}` : '';
    throw new Error((data && data.error ? data.error : `Erreur HTTP ${res.status}`) + detail);
  }
  return data;
}

export const api = {
  // Auth
  register: (body) => req('POST', '/auth/register', body),
  login: (body) => req('POST', '/auth/login', body),

  // Devices
  getDevices: () => req('GET', '/devices'),
  getDevice: (id) => req('GET', `/devices/${id}`),
  createDevice: (body) => req('POST', '/devices', body),
  updateDevice: (id, body) => req('PATCH', `/devices/${id}`, body),
  deleteDevice: (id) => req('DELETE', `/devices/${id}`),
  addDatastream: (deviceId, body) => req('POST', `/devices/${deviceId}/datastreams`, body),
  sendCommand: (deviceId, body) => req('POST', `/devices/${deviceId}/commands`, body),

  // Datastreams
  setThresholds: (dsId, body) => req('PATCH', `/datastreams/${dsId}/thresholds`, body),
  getHistory: (dsId, limit = 100) => req('GET', `/datastreams/${dsId}/history?limit=${limit}`),
  // Cycles du feu (persistant) — vue « Cycles »
  getCycles: (deviceId, limit = 500) => req('GET', `/devices/${deviceId}/cycles?limit=${limit}`),
  clearCycles: (deviceId) => req('DELETE', `/devices/${deviceId}/cycles`),
  // Dernier état vu par le device (token) — renvoie aussi la dernière commande reçue
  getLatest: (token) => req('GET', `/devices/${token}/latest`),

  // Widgets
  getWidgets: () => req('GET', '/widgets'),
  createWidget: (body) => req('POST', '/widgets', body),
  updateWidget: (id, body) => req('PATCH', `/widgets/${id}`, body),
  deleteWidget: (id) => req('DELETE', `/widgets/${id}`),
};