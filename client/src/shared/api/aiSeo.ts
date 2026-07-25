import { authenticatedFetch } from './httpClient';

const BASE_URL = '/api/ai-seo';

type CallOptions = { signal?: AbortSignal; maxUrls?: number; loadAll?: boolean };

class AiSeoService {
  async checkCrawlerAccess(target: string) {
    const response = await authenticatedFetch(`${BASE_URL}/crawler-access-check`, {
      method: 'POST',
      body: { target },
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      // ignore JSON parse failures
    }

    if (!response.ok) {
      const message = payload?.error || 'Unable to check robots.txt right now.';
      throw new Error(message);
    }

    return payload;
  }

  async validateLlms(target: string, options: CallOptions = {}) {
    const response = await authenticatedFetch(`${BASE_URL}/llms/validate`, {
      method: 'POST',
      body: { target },
      signal: options.signal,
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      // ignore JSON parse failures
    }

    if (!response.ok) {
      const message = payload?.error || 'Unable to fetch llms.txt.';
      throw new Error(message);
    }

    return payload;
  }

  async generateLlms(target: string, options: CallOptions = {}) {
    const response = await authenticatedFetch(`${BASE_URL}/llms/generate`, {
      method: 'POST',
      body: { target, maxUrls: options.maxUrls },
      signal: options.signal,
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      // ignore JSON parse failures
    }

    if (!response.ok) {
      const message = payload?.error || 'Unable to generate llms.txt preview.';
      throw new Error(message);
    }

    return payload;
  }

  async answerAi(payload: any, options: CallOptions = {}) {
    const response = await authenticatedFetch(`${BASE_URL}/answer-ai`, {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // ignore
    }
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to run Answer the AI audit.');
    }
    return data;
  }

  async fetchKeywordData(payload: any, options: CallOptions = {}) {
    const response = await authenticatedFetch(`${BASE_URL}/keyword-data`, {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // ignore
    }

    if (!response.ok) {
      throw new Error(data?.error || 'Unable to fetch AI keyword data.');
    }

    return data;
  }

  async runAiOptimization(payload: any, options: CallOptions = {}) {
    const response = await authenticatedFetch(`${BASE_URL}/ai-optimization`, {
      method: 'POST',
      body: payload,
      signal: options.signal,
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      // ignore
    }

    if (!response.ok) {
      throw new Error(data?.error || 'Unable to fetch AI optimization insights.');
    }

    return data;
  }

  async searchCountries(query: string = '', options: CallOptions = {}) {
    const params = new URLSearchParams();
    if (query) {
      params.set('q', query);
    }
    params.set('type', 'country');
    if (options.loadAll) {
      params.set('all', 'true');
    }
    const qs = params.toString();
    const url = qs ? `/api/local/locations?${qs}` : '/api/local/locations?type=country';
    const response = await authenticatedFetch(url, {
      method: 'GET',
      signal: options.signal,
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to load countries.');
    }

    return data;
  }
}

const aiSeoService = new AiSeoService();

export default aiSeoService;
