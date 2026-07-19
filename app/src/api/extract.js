function joinUrl(base, path) {
  const trimmedBase = (base || '').replace(/\/+$/, '');
  if (!trimmedBase) {
    throw new Error('API base URL is empty. Set it in Profile.');
  }
  return `${trimmedBase}${path}`;
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function networkError(err) {
  if (err && err.name === 'TypeError') {
    return new Error(
      'Could not reach the AI server. Check your internet connection and the API Base URL in Profile.'
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function extractClientInfo(apiBaseUrl, text) {
  try {
    const response = await fetch(joinUrl(apiBaseUrl, '/api/extract-client'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return await parseJsonResponse(response);
  } catch (err) {
    throw networkError(err);
  }
}

export async function extractCompanyInfo(apiBaseUrl, file) {
  try {
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
    return await parseJsonResponse(response);
  } catch (err) {
    throw networkError(err);
  }
}
