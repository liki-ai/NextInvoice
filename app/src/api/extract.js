function joinUrl(base, path) {
  const trimmedBase = (base || '').replace(/\/+$/, '');
  return `${trimmedBase}${path}`;
}

export async function extractClientInfo(apiBaseUrl, text) {
  const response = await fetch(joinUrl(apiBaseUrl, '/api/extract-client'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && data.error) || `Request failed with status ${response.status}`);
  }
  return data;
}

export async function extractCompanyInfo(apiBaseUrl, file) {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name || 'invoice',
    type: file.mimeType || 'application/octet-stream',
  });

  // Do not set Content-Type manually - fetch/RN needs to add its own multipart boundary.
  const response = await fetch(joinUrl(apiBaseUrl, '/api/extract-company'), {
    method: 'POST',
    body: form,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && data.error) || `Request failed with status ${response.status}`);
  }
  return data;
}
