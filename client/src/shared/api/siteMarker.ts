import authenticatedFetch from './httpClient';

const listPages = async () => {
  const response = await authenticatedFetch('/api/site-marker/pages', { method: 'GET' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load pages.');
  }
  return data;
};

const createPage = async ({ url, title }) => {
  const response = await authenticatedFetch('/api/site-marker/pages', {
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
  const response = await authenticatedFetch(`/api/site-marker/pages/${id}`, { method: 'GET' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load page.');
  }
  return data;
};

const saveMarkers = async (id, markers) => {
  const response = await authenticatedFetch(`/api/site-marker/pages/${id}/markers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markers }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to save markers.');
  }
  return data;
};

const deletePage = async (id) => {
  const response = await authenticatedFetch(`/api/site-marker/pages/${id}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to delete page.');
  }
  return data;
};

const generateShareLink = async (id) => {
  const response = await authenticatedFetch(`/api/site-marker/pages/${id}/share`, {
    method: 'POST',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to generate share link.');
  }
  return data;
};

const revokeShareLink = async (id) => {
  const response = await authenticatedFetch(`/api/site-marker/pages/${id}/share`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to revoke share link.');
  }
  return data;
};

// Public endpoint - no auth required
const getSharedPage = async (shareToken) => {
  const response = await fetch(`/api/site-marker/shared/${shareToken}`, { method: 'GET' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load shared page.');
  }
  return data;
};

const siteMarkerService = {
  listPages,
  createPage,
  getPage,
  saveMarkers,
  deletePage,
  generateShareLink,
  revokeShareLink,
  getSharedPage,
};

export default siteMarkerService;
