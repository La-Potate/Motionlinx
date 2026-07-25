const BASE_URL = '/api/web-search';

class IndexCheckerService {
  async checkBulk(urls, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${BASE_URL}/bulk-index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ urls, ...options })
    });

    if (!response.ok) {
      let message = 'Unable to complete the index check.';
      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch {
        // ignore json parse failure
      }
      throw new Error(message);
    }

    return response.json();
  }
}

const indexCheckerService = new IndexCheckerService();

export default indexCheckerService;
