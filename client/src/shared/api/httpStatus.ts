const BASE_URL = '/api/web-search';

class HttpStatusService {
  async checkBulk(urls) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${BASE_URL}/bulk-http`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ urls }),
    });

    if (!response.ok) {
      let message = 'Unable to complete the HTTP check.';
      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch {
        // ignore JSON parse failure
      }
      throw new Error(message);
    }

    return response.json();
  }
}

const httpStatusService = new HttpStatusService();

export default httpStatusService;
