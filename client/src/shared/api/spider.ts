import { authenticatedFetch } from './httpClient';

class SpiderService {
  async crawl(domain: string, options: any = {}) {
    const response = await authenticatedFetch('/api/web-search/spider-web', {
      method: 'POST',
      body: { domain, ...options },
    });
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      // ignore
    }
    if (!response.ok) {
      const message = payload?.error || 'Unable to crawl internal links right now.';
      throw new Error(message);
    }
    return payload;
  }
}

const spiderService = new SpiderService();

export default spiderService;
