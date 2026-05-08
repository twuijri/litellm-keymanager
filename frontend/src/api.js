const TOKEN_KEY = "lkm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const token = getToken();
  const opts = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
  if (body !== undefined) {
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "Unauthorized");
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const detail = (data && (data.detail || data.error || data.message)) || res.statusText;
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function login(username, password) {
  const form = new FormData();
  form.append("username", username);
  form.append("password", password);
  const data = await request("/auth/login", { method: "POST", body: form });
  setToken(data.access_token);
  return data;
}

export const api = {
  me: () => request("/auth/me"),
  listKeys: () => request(`/api/keys`),
  getKey: (key) => request(`/api/keys/${encodeURIComponent(key)}`),
  updateKey: (payload) => request("/api/keys/update", { method: "POST", body: payload }),
  generateKey: (payload) => request("/api/keys/generate", { method: "POST", body: payload }),
  regenerateKey: (key, newAlias) =>
    request("/api/keys/regenerate", { method: "POST", body: { key, new_alias: newAlias } }),
  cloneKey: (key, newAlias) =>
    request("/api/keys/clone", { method: "POST", body: { key, new_alias: newAlias } }),
  deleteKey: (key) => request("/api/keys/delete", { method: "POST", body: { keys: [key] } }),
  models: () => request("/api/models"),
  getSettings: () => request("/api/settings"),
  saveSettings: (payload) => request("/api/settings", { method: "POST", body: payload }),
  testDatabase: () => request("/api/settings/test-database", { method: "POST" }),
};
