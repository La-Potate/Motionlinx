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

  // Search for businesses on Google Maps
  async searchGoogleMaps(query: string, location: any, options: any = {}) {
    try {
      // Ensure API keys are loaded
      await this.loadApiKeys();
      
      // Use provided API key or fallback to stored one
      const apiKey = options.apiKey || this.apiKeys.googlePlaces;
      
      const response = await authenticatedFetch(`${this.baseUrl}/google-maps`, {
        method: 'POST',
        body: JSON.stringify({ query, lat: options.lat, lng: options.lng, radius: options.radius, apiKeys: { ...this.apiKeys, googlePlaces: apiKey } })
      });

      if (!response.ok) {
        throw new Error(`SERP API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error searching Google Maps:', error);
      // Return mock data for demo purposes when API is not configured
      return this.getMockGoogleMapsData(query, location);
    }
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

  // Get keyword rankings for a business
  async getKeywordRankings(placeId: string, keywords: any[] = [], center?: any) {
    try {
      const response = await authenticatedFetch(`${this.baseUrl}/keyword-rankings`, {
        method: 'POST',
        body: JSON.stringify({ placeId, keywords, center })
      });

      if (!response.ok) {
        throw new Error(`Keyword rankings API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching keyword rankings:', error);
      return this.getMockKeywordRankings(placeId, keywords);
    }
  }

  // Get competitor analysis
  async getCompetitorAnalysis(businessId: any, location: any) {
    try {
      const response = await fetch(`${this.baseUrl}/competitors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          businessId,
          location
        })
      });

      if (!response.ok) {
        throw new Error(`Competitor analysis API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching competitor analysis:', error);
      return this.getMockCompetitorAnalysis(businessId, location);
    }
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

  // Mock data for demo purposes
  getMockGoogleMapsData(query: any, location: any) {
    return {
      success: true,
      data: {
        businesses: [
          {
            placeId: 'mock-place-1',
            name: query || 'Local Coffee Shop',
            address: '123 Main St, ' + (location || 'City, State 12345'),
            phone: '(555) 123-4567',
            email: 'info@localcoffeeshop.com',
            rating: 4.5,
            reviews: 127,
            category: 'Coffee Shop',
            photos: 45,
            website: 'https://localcoffeeshop.com',
            coordinates: {
              lat: 40.7128,
              lng: -74.0060
            },
            openingHours: {
              monday: '6:00 AM - 8:00 PM',
              tuesday: '6:00 AM - 8:00 PM',
              wednesday: '6:00 AM - 8:00 PM',
              thursday: '6:00 AM - 8:00 PM',
              friday: '6:00 AM - 9:00 PM',
              saturday: '7:00 AM - 9:00 PM',
              sunday: '7:00 AM - 7:00 PM'
            }
          }
        ],
        searchInfo: {
          query,
          location,
          totalResults: 1,
          searchTime: new Date().toISOString()
        }
      }
    };
  }

  getMockBusinessDetails(placeId: any) {
    return {
      success: true,
      data: {
        placeId,
        name: 'Local Coffee Shop',
        address: '123 Main St, City, State 12345',
        phone: '(555) 123-4567',
        email: 'info@localcoffeeshop.com',
        rating: 4.5,
        reviews: 127,
        category: 'Coffee Shop',
        photos: 45,
        website: 'https://localcoffeeshop.com',
        coordinates: {
          lat: 40.7128,
          lng: -74.0060
        },
        openingHours: {
          monday: '6:00 AM - 8:00 PM',
          tuesday: '6:00 AM - 8:00 PM',
          wednesday: '6:00 AM - 8:00 PM',
          thursday: '6:00 AM - 8:00 PM',
          friday: '6:00 AM - 9:00 PM',
          saturday: '7:00 AM - 9:00 PM',
          sunday: '7:00 AM - 7:00 PM'
        },
        posts: [
          {
            id: 1,
            content: 'New seasonal drinks are here! Try our pumpkin spice latte.',
            image: 'https://via.placeholder.com/400x300',
            date: '2023-10-20'
          },
          {
            id: 2,
            content: 'Happy Friday! Don\'t forget we\'re open until 9 PM today.',
            image: 'https://via.placeholder.com/400x300',
            date: '2023-10-19'
          }
        ]
      }
    };
  }

  getMockKeywordRankings(businessId: any, keywords: any[]) {
    const defaultKeywords = [
      'coffee shop near me',
      'best coffee downtown',
      'local coffee shop',
      'coffee delivery',
      'breakfast near me',
      'cozy coffee shop',
      'artisan coffee',
      'coffee beans',
      'latte art',
      'coffee roastery'
    ];

    const selectedKeywords = keywords.length > 0 ? keywords : defaultKeywords;

    return {
      success: true,
      data: {
        businessId,
        keywords: selectedKeywords.map((keyword: any, index: number) => ({
          keyword,
          position: Math.floor(Math.random() * 20) + 1,
          searchVolume: Math.floor(Math.random() * 15000) + 1000,
          difficulty: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
          trend: Math.random() > 0.5 ? 'up' : 'down',
          change: Math.floor(Math.random() * 10) - 5,
          lastUpdated: new Date().toISOString()
        })),
        lastUpdated: new Date().toISOString()
      }
    };
  }

  getMockCompetitorAnalysis(businessId: any, location: any) {
    return {
      success: true,
      data: {
        businessId,
        competitors: [
          {
            id: 'comp-1',
            name: 'Downtown Coffee Co.',
            address: '456 Oak St, ' + (location || 'City, State'),
            distance: '0.3 miles',
            rating: 4.2,
            reviews: 89,
            position: 1,
            backlinks: 156,
            keywords: ['coffee shop', 'downtown coffee', 'morning coffee']
          },
          {
            id: 'comp-2',
            name: 'Artisan Roasters',
            address: '789 Pine Ave, ' + (location || 'City, State'),
            distance: '0.7 miles',
            rating: 4.7,
            reviews: 203,
            position: 2,
            backlinks: 234,
            keywords: ['artisan coffee', 'coffee roastery', 'premium coffee']
          },
          {
            id: 'comp-3',
            name: 'Quick Brew',
            address: '321 Elm St, ' + (location || 'City, State'),
            distance: '1.2 miles',
            rating: 3.8,
            reviews: 67,
            position: 3,
            backlinks: 89,
            keywords: ['quick coffee', 'fast service', 'coffee to go']
          }
        ],
        analysis: {
          totalCompetitors: 3,
          averageRating: 4.23,
          averageReviews: 120,
          marketSaturation: 'Medium',
          opportunities: [
            'Focus on customer service to improve ratings',
            'Increase social media presence',
            'Optimize for local keywords'
          ]
        }
      }
    };
  }

  // Get backlink analysis
  async getBacklinkAnalysis(domain: string) {
    try {
      const response = await authenticatedFetch(`${this.baseUrl}/backlinks`, {
        method: 'POST',
        body: JSON.stringify({ domain })
      });

      if (!response.ok) {
        throw new Error(`Backlink analysis API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching backlink analysis:', error);
      return this.getMockBacklinkAnalysis(domain);
    }
  }

  getMockBacklinkAnalysis(domain: string) {
    return {
      success: true,
      data: {
        domain,
        totalBacklinks: 234,
        referringDomains: 89,
        domainAuthority: 45,
        spamScore: 2,
        backlinks: [
          {
            url: 'https://example.com/coffee-review',
            domain: 'example.com',
            title: 'Best Coffee Shops in the City',
            anchorText: 'Local Coffee Shop',
            type: 'Editorial',
            domainAuthority: 65,
            spamScore: 1,
            date: '2023-10-15'
          },
          {
            url: 'https://foodblog.com/local-businesses',
            domain: 'foodblog.com',
            title: 'Local Business Directory',
            anchorText: 'Coffee Shop Downtown',
            type: 'Directory',
            domainAuthority: 42,
            spamScore: 3,
            date: '2023-10-10'
          }
        ],
        lastUpdated: new Date().toISOString()
      }
    };
  }

  // Get organic traffic analysis
  async getOrganicTrafficAnalysis(domain: string) {
    try {
      const response = await authenticatedFetch(`${this.baseUrl}/organic-traffic`, {
        method: 'POST',
        body: JSON.stringify({ domain })
      });

      if (!response.ok) {
        throw new Error(`Organic traffic API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching organic traffic analysis:', error);
      return this.getMockOrganicTrafficAnalysis(domain);
    }
  }

  getMockOrganicTrafficAnalysis(domain: string) {
    return {
      success: true,
      data: {
        domain,
        monthlyVisits: 15420,
        growthRate: 12.5,
        topKeywords: [
          'coffee shop near me',
          'best coffee downtown',
          'local coffee shop',
          'coffee delivery',
          'breakfast near me'
        ],
        trafficSources: {
          organic: 65,
          direct: 20,
          social: 10,
          referral: 5
        },
        lastUpdated: new Date().toISOString()
      }
    };
  }
}

const serpService = new SerpService();

export default serpService;
