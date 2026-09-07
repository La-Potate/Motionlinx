import authenticatedFetch from './httpClient';

const listPages = async () => {
  const response = await authenticatedFetch('/api/page-commenter/pages', { method: 'GET' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load pages.');
  }
  return data;
};

const createPage = async ({ url, title }) => {
  const response = await authenticatedFetch('/api/page-commenter/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to capture page.');
  }
  return data;
};

const getPage = async (id) => {
  const response = await authenticatedFetch(`/api/page-commenter/pages/${id}`, { method: 'GET' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load page.');
  }
  return data;
};

const saveComments = async (id, comments) => {
  const response = await authenticatedFetch(`/api/page-commenter/pages/${id}/comments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to save comments.');
  }
  return data;
};

const deletePage = async (id) => {
  const response = await authenticatedFetch(`/api/page-commenter/pages/${id}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to delete page.');
  }
  return data;
};

/**
 * Download the capture with its comments baked into the HTML.
 *
 * The endpoint returns a self-contained annotated page, so it goes through
 * fetch + blob rather than a plain link: the request needs the auth header,
 * which an <a href> cannot carry.
 */
const downloadPage = async (id, filename) => {
  const response = await authenticatedFetch(`/api/page-commenter/pages/${id}/download`, {
    method: 'GET',
  });
  if (!response.ok) {
    let message = 'Failed to download page.';
    try {
      message = (await response.json())?.error || message;
    } catch {
      // response was not JSON; keep the default
    }
    throw new Error(message);
  }
  // The authenticatedFetch shim exposes text()/json() but not blob(); the
  // payload is HTML, so text is the right read anyway.
  const html = await response.text();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `page-${id}.html`;
  a.click();
  URL.revokeObjectURL(url);
};

const pageCommenterService = {
  listPages,
  createPage,
  getPage,
  saveComments,
  deletePage,
  downloadPage,
};

export default pageCommenterService;
