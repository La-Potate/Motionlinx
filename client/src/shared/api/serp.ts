import authenticatedFetch from './httpClient';

// SERP API Service for Google Maps data
class SerpService {
  baseUrl: string;
  apiKeys: { dataForSeo: string; googlePlaces: string };
  _loaded: boolean;

  constructor() {
    this.baseUrl = '/api/serp';
    this.apiKeys = {
      dataForSeo: '',
      googlePlaces: ''
    };
    this._loaded = false;
  }

  resetCache() {
    this.apiKeys = { dataForSeo: '', googlePlaces: '' };
    this._loaded = false;
  }

  async loadApiKeys(force: boolean = false) {
    if (this._loaded && !force) {
      return this.apiKeys;
    }
    try {
      const response = await authenticatedFetch('/api/settings/api-keys', {
        method: 'GET',
      });
      
      if (response.ok) {
        const payload = await response.json();
        const googleKeyRaw =
          (typeof payload?.googlePlaces === 'string' && payload.googlePlaces.trim()) ?
            payload.googlePlaces :
            (typeof payload?.googleApiKey === 'string' ? payload.googleApiKey : '');
        this.apiKeys = {
          dataForSeo: typeof payload?.dataForSeo === 'string' ? payload.dataForSeo : '',
          googlePlaces: googleKeyRaw || ''
        };
      } else {
        this.apiKeys = { dataForSeo: '', googlePlaces: '' };
      }
    } catch (error) {
      console.error('Error loading API keys:', error);
      this.apiKeys = { dataForSeo: '', googlePlaces: '' };
    } finally {
      this._loaded = true;
    }
    return this.apiKeys;
  }

  // Expose Google Places key for UI helpers
  getGooglePlacesKey() {
    return this.apiKeys.googlePlaces || '';
  }

  buildPhotoUrl(reference: string, options: any = {}) {
    const key = this.getGooglePlacesKey();
    if (!reference || !key) return null;
    const maxwidth = options.maxWidth || options.maxwidth || 900;
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxwidth}&photoreference=${encodeURIComponent(reference)}&key=${key}`;
  }

  async serperSearch(options: any = {}) {
    const response = await authenticatedFetch(`${this.baseUrl}/serper-search`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }

  async serperReviews(options: any = {}) {
    const response = await authenticatedFetch(`${this.baseUrl}/serper-reviews`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }

  async getBusinessHistory() {
    const response = await authenticatedFetch(`${this.baseUrl}/business-details/history`, {
      method: 'GET',
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }

  async getBusinessHistoryItem(id: string) {
    const response = await authenticatedFetch(`${this.baseUrl}/business-details/history/${id}`, {
      method: 'GET',
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }

  // Get business details from Google Maps
  async getBusinessDetails(placeId: string, options: any = {}) {
    await this.loadApiKeys();
    const payload = {
      placeId,
      mapUrl: options.mapUrl,
      cid: options.cid,
      forceRefresh: Boolean(options.forceRefresh),
    };

    const response = await authenticatedFetch(`${this.baseUrl}/business-details`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data: any = await response.json();
    if (!response.ok || data.success === false) {
      const message = data.error || `Business details API error: ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  // Build GMB heatmap grid via server
  async getHeatmapGrid({ placeId, keyword, center, gridSize = 7, stepMeters = 500, radiusMeters = 3000 }: any) {
    const response = await fetch(`${this.baseUrl}/heatmap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ placeId, keyword, center, gridSize, stepMeters, radiusMeters })
    });
    if (!response.ok) {
      throw new Error(`Heatmap API error: ${response.status}`);
    }
    return await response.json();
  }

}

const serpService = new SerpService();

export default serpService;
