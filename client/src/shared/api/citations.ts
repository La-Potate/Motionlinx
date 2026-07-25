// Citations API service. Routes are served by the main API at /api/citations
// (the standalone citations microservice was reabsorbed in Phase 5-early).
// Uses the shared axios client so it picks up auth + token refresh transparently.
import { apiClient } from './client';

class CitationService {
  async getEntities() {
    const { data } = await apiClient.get('/citations/entities');
    return data;
  }

  async getEntity(entityId) {
    const { data } = await apiClient.get(`/citations/entities/${entityId}`);
    return data;
  }

  async saveEntity(entityData) {
    const { data } = await apiClient.post('/citations/entities', entityData);
    return data;
  }

  async getListings(entityId) {
    const { data } = await apiClient.get(`/citations/listings/${entityId}`);
    return data.listings || [];
  }

  async getProfileHealth(entityId) {
    const { data } = await apiClient.get(`/citations/profile-health/${entityId}`);
    return data[entityId] || { completed: 0, missingFields: {} };
  }

  async syncListings(entityId) {
    const { data } = await apiClient.post(`/citations/listings/${entityId}/sync`);
    return data;
  }

  formatPublisherName(publisherId) {
    const nameMap = {
      '8COUPONS': '8coupons',
      AMERICANEXPRESS: 'American Express',
      BETTERBUSINESSBUREAU: 'Better Business Bureau',
      BROWNBOOKNET: 'Brownbook',
      CENTRALINDEXUS: 'CentralIndex',
      CHAMBEROFCOMMERCECOM: 'Chamber of Commerce',
      CITYSEARCH: 'Citysearch',
      CITYSQUARES: 'CitySquares',
      DUNANDBRADSTREET: 'Dun & Bradstreet',
      GOOGLEMYBUSINESS: 'Google Business Profile',
      INSIDERPAGESV2: 'Insider Pages',
      MYLOCALSERVICES: 'My Local Services',
      MERCHANTCIRCLE: 'Merchant Circle',
      YELLOWPAGESGOESGREEN: 'Yellow Pages',
      YPCOM: 'Yellow Pages',
    };
    if (nameMap[publisherId]) return nameMap[publisherId];
    return publisherId
      .split(/(?=[A-Z])/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  getPublisherIcon(publisherId) {
    return publisherId.charAt(0).toUpperCase();
  }
}

const citationService = new CitationService();
export default citationService;
