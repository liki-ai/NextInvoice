function joinUrl(base, path) {
  const trimmedBase = (base || '').replace(/\/+$/, '');
  return `${trimmedBase}${path}`;
}

export async function apiRequest(apiBaseUrl, token, path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!form) headers['Content-Type'] = 'application/json';
  const response = await fetch(joinUrl(apiBaseUrl, path), {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error((data && data.error) || `Request failed (${response.status})`);
    err.code = data?.code;
    err.remaining = data?.remaining;
    throw err;
  }
  return data;
}
