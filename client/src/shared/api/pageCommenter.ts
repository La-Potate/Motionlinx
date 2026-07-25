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

const pageCommenterService = {
  listPages,
  createPage,
  getPage,
  saveComments,
  deletePage,
};

export default pageCommenterService;
