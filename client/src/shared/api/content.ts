import authenticatedFetch from './httpClient';

// Press Release methods
const generatePressRelease = async (payload) => {
  const response = await authenticatedFetch('/api/content/press-release', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to generate press release.');
  }
  return data;
};

const listPressReleases = async (search = '') => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const url = `/api/content/press-release/history${params.toString() ? `?${params}` : ''}`;
  const response = await authenticatedFetch(url, {
    method: 'GET',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load press releases.');
  }
  return data;
};

const getPressRelease = async (id) => {
  const response = await authenticatedFetch(`/api/content/press-release/${id}`, {
    method: 'GET',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load press release.');
  }
  return data;
};

const updatePressRelease = async (id, payload) => {
  const response = await authenticatedFetch(`/api/content/press-release/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to update press release.');
  }
  return data;
};

const deletePressRelease = async (id) => {
  const response = await authenticatedFetch(`/api/content/press-release/${id}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to delete press release.');
  }
  return data;
};

// Blog Post methods
const generateBlogPost = async (payload) => {
  const response = await authenticatedFetch('/api/content/blog-post', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to generate blog post.');
  }
  return data;
};

const listBlogPosts = async (search = '') => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const url = `/api/content/blog-post/history${params.toString() ? `?${params}` : ''}`;
  const response = await authenticatedFetch(url, {
    method: 'GET',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load blog posts.');
  }
  return data;
};

const getBlogPost = async (id) => {
  const response = await authenticatedFetch(`/api/content/blog-post/${id}`, {
    method: 'GET',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to load blog post.');
  }
  return data;
};

const updateBlogPost = async (id, payload) => {
  const response = await authenticatedFetch(`/api/content/blog-post/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to update blog post.');
  }
  return data;
};

const deleteBlogPost = async (id) => {
  const response = await authenticatedFetch(`/api/content/blog-post/${id}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Failed to delete blog post.');
  }
  return data;
};

const contentService = {
  // Press Release
  generatePressRelease,
  listPressReleases,
  getPressRelease,
  updatePressRelease,
  deletePressRelease,
  // Blog Post
  generateBlogPost,
  listBlogPosts,
  getBlogPost,
  updateBlogPost,
  deleteBlogPost,
};

export default contentService;
