import authenticatedFetch from './httpClient';

const localResearchService = {
  async fetchKeywordIdeas(payload) {
    const response = await authenticatedFetch('/api/local/keyword-ideas', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = data?.details ? `: ${data.details}` : '';
      throw new Error((data?.error || 'Failed to fetch keyword ideas') + detail);
    }
    return data;
  },

  async searchLocations(query, type = '', loadAll = false, signal) {
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    if (type) {
      params.set('type', type);
    }
    if (loadAll) {
      params.set('all', 'true');
    }
    const qs = params.toString();
    const url = qs ? `/api/local/locations?${qs}` : '/api/local/locations';
    const response = await authenticatedFetch(url, {
      method: 'GET',
      signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = data?.details ? `: ${data.details}` : '';
      throw new Error((data?.error || 'Failed to search locations') + detail);
    }
    return data;
  },
};

export default localResearchService;
