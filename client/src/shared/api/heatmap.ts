const API = '/api/heatmap';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

export const heatmapService = {
  async listReports() {
    const r = await fetch(`${API}/reports`, { headers: authHeaders() });
    if (!r.ok) throw new Error('Failed to list reports');
    return await r.json();
  },
  async createReport(payload) {
    const r = await fetch(`${API}/reports`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('Failed to create report');
    return await r.json();
  },
  async generateReport(id) {
    const r = await fetch(`${API}/reports/${id}/generate`, { method: 'POST', headers: authHeaders() });
    if (!r.ok) throw new Error('Failed to generate snapshot');
    return await r.json();
  },
  async deleteReport(id) {
    const r = await fetch(`${API}/reports/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!r.ok) throw new Error('Failed to delete report');
    return await r.json();
  },
  async previewGrid(payload) {
    const r = await fetch('/api/serp/heatmap', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    if (!r.ok) {
      let errorText = 'Failed to fetch heatmap ranks';
      try {
        const errJson = await r.json();
        if (errJson?.error) errorText = errJson.error;
      } catch (_) {
        // ignore parse error
      }
      throw new Error(errorText);
    }
    return await r.json();
  },
  reportHtmlUrl(id) { return `${API}/reports/${id}/html`; }
};
