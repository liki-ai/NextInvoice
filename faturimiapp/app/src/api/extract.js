function joinUrl(base, path) {
  const trimmedBase = (base || '').replace(/\/+$/, '');
  return `${trimmedBase}${path}`;
}

export async function extractInvoiceInfo(apiBaseUrl, { text, file } = {}) {
  let response;
  if (file?.uri) {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name || 'photo.jpg',
      type: file.mimeType || 'image/jpeg',
    });
    if (text) form.append('text', text);
    response = await fetch(joinUrl(apiBaseUrl, '/api/extract-client'), {
      method: 'POST',
      body: form,
    });
  } else {
    response = await fetch(joinUrl(apiBaseUrl, '/api/extract-client'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || '' }),
    });
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && data.error) || `Request failed with status ${response.status}`);
  }
  return data;
}

export async function extractClientInfo(apiBaseUrl, text) {
  return extractInvoiceInfo(apiBaseUrl, { text });
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
