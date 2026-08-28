'use strict';

// Citation publisher directories checked by the Citation Audit tool.
//
// Each entry is `{ id, name, url, category }`:
//   - `id`       stable slug persisted in `citation_audit_results.source_id`.
//                NEVER rename an existing id — historical audit rows join on it.
//   - `name`     display label (also stored on the result row).
//   - `url`      publisher homepage. `integrations/serper.js` derives the
//                `site:` search operator from this URL's hostname, so it must
//                be a fully-qualified URL on the domain that actually hosts
//                the business listings.
//   - `category` grouping hint for the UI; not used by the audit runner.

const CITATION_SOURCES_USA = [
  // --- Core platforms (highest impact on local ranking) ---
  { id: 'google-business-profile', name: 'Google Business Profile', url: 'https://www.google.com/maps', category: 'core' },
  { id: 'bing-places', name: 'Bing Places', url: 'https://www.bing.com/maps', category: 'core' },
  { id: 'apple-business-connect', name: 'Apple Business Connect', url: 'https://maps.apple.com', category: 'core' },
  { id: 'facebook', name: 'Facebook', url: 'https://www.facebook.com', category: 'core' },
  { id: 'yelp', name: 'Yelp', url: 'https://www.yelp.com', category: 'core' },
  { id: 'better-business-bureau', name: 'Better Business Bureau', url: 'https://www.bbb.org', category: 'core' },
  { id: 'yellowpages', name: 'Yellow Pages', url: 'https://www.yellowpages.com', category: 'core' },
  { id: 'foursquare', name: 'Foursquare', url: 'https://foursquare.com', category: 'core' },
  { id: 'mapquest', name: 'MapQuest', url: 'https://www.mapquest.com', category: 'core' },
  { id: 'nextdoor', name: 'Nextdoor', url: 'https://nextdoor.com', category: 'core' },

  // --- General business directories ---
  { id: 'superpages', name: 'Superpages', url: 'https://www.superpages.com', category: 'directory' },
  { id: 'citysearch', name: 'Citysearch', url: 'https://www.citysearch.com', category: 'directory' },
  { id: 'dexknows', name: 'DexKnows', url: 'https://www.dexknows.com', category: 'directory' },
  { id: 'yellowbook', name: 'Yellowbook', url: 'https://www.yellowbook.com', category: 'directory' },
  { id: 'local-com', name: 'Local.com', url: 'https://www.local.com', category: 'directory' },
  { id: 'merchantcircle', name: 'MerchantCircle', url: 'https://www.merchantcircle.com', category: 'directory' },
  { id: 'manta', name: 'Manta', url: 'https://www.manta.com', category: 'directory' },
  { id: 'hotfrog-us', name: 'Hotfrog', url: 'https://www.hotfrog.com', category: 'directory' },
  { id: 'brownbook', name: 'Brownbook', url: 'https://www.brownbook.net', category: 'directory' },
  { id: 'cylex-us', name: 'Cylex USA', url: 'https://www.cylex.us.com', category: 'directory' },
  { id: 'citysquares', name: 'CitySquares', url: 'https://citysquares.com', category: 'directory' },
  { id: 'chamberofcommerce', name: 'ChamberofCommerce.com', url: 'https://www.chamberofcommerce.com', category: 'directory' },
  { id: 'ezlocal', name: 'EZlocal', url: 'https://ezlocal.com', category: 'directory' },
  { id: 'showmelocal', name: 'ShowMeLocal', url: 'https://www.showmelocal.com', category: 'directory' },
  { id: 'n49', name: 'n49', url: 'https://www.n49.com', category: 'directory' },
  { id: 'insiderpages', name: 'Insider Pages', url: 'https://www.insiderpages.com', category: 'directory' },
  { id: 'judysbook', name: "Judy's Book", url: 'https://www.judysbook.com', category: 'directory' },
  { id: 'americantowns', name: 'AmericanTowns', url: 'https://www.americantowns.com', category: 'directory' },
  { id: 'elocal', name: 'eLocal', url: 'https://www.elocal.com', category: 'directory' },
  { id: 'tupalo', name: 'Tupalo', url: 'https://tupalo.com', category: 'directory' },
  { id: 'opendi-us', name: 'Opendi USA', url: 'https://www.opendi.us', category: 'directory' },
  { id: 'storeboard', name: 'Storeboard', url: 'https://www.storeboard.com', category: 'directory' },
  { id: 'callupcontact', name: 'CallUpContact', url: 'https://www.callupcontact.com', category: 'directory' },
  { id: 'fyple-us', name: 'Fyple USA', url: 'https://www.fyple.com', category: 'directory' },
  { id: 'iglobal', name: 'iGlobal', url: 'https://www.iglobal.co', category: 'directory' },
  { id: '2findlocal', name: '2FindLocal', url: 'https://www.2findlocal.com', category: 'directory' },
  { id: 'yellowbot', name: 'YellowBot', url: 'https://www.yellowbot.com', category: 'directory' },
  { id: 'ibegin', name: 'iBegin', url: 'https://www.ibegin.com', category: 'directory' },

  // --- Business data / professional networks ---
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com', category: 'professional' },
  { id: 'crunchbase', name: 'Crunchbase', url: 'https://www.crunchbase.com', category: 'professional' },
  { id: 'bizapedia', name: 'Bizapedia', url: 'https://www.bizapedia.com', category: 'professional' },
  { id: 'dun-and-bradstreet', name: 'Dun & Bradstreet', url: 'https://www.dnb.com', category: 'professional' },
  { id: 'alignable', name: 'Alignable', url: 'https://www.alignable.com', category: 'professional' },
  { id: 'glassdoor', name: 'Glassdoor', url: 'https://www.glassdoor.com', category: 'professional' },

  // --- Review platforms ---
  { id: 'trustpilot', name: 'Trustpilot', url: 'https://www.trustpilot.com', category: 'reviews' },
  { id: 'sitejabber', name: 'Sitejabber', url: 'https://www.sitejabber.com', category: 'reviews' },
  { id: 'tripadvisor-us', name: 'Tripadvisor', url: 'https://www.tripadvisor.com', category: 'reviews' },

  // --- Home services / trade marketplaces ---
  { id: 'angi', name: 'Angi', url: 'https://www.angi.com', category: 'trade' },
  { id: 'homeadvisor', name: 'HomeAdvisor', url: 'https://www.homeadvisor.com', category: 'trade' },
  { id: 'thumbtack', name: 'Thumbtack', url: 'https://www.thumbtack.com', category: 'trade' },
  { id: 'houzz', name: 'Houzz', url: 'https://www.houzz.com', category: 'trade' },
  { id: 'porch', name: 'Porch', url: 'https://porch.com', category: 'trade' },
];

const CITATION_SOURCES_UK = [
  // --- Core platforms ---
  { id: 'google-business-profile', name: 'Google Business Profile', url: 'https://www.google.com/maps', category: 'core' },
  { id: 'bing-places', name: 'Bing Places', url: 'https://www.bing.com/maps', category: 'core' },
  { id: 'apple-business-connect', name: 'Apple Business Connect', url: 'https://maps.apple.com', category: 'core' },
  { id: 'facebook', name: 'Facebook', url: 'https://www.facebook.com', category: 'core' },
  { id: 'yelp-uk', name: 'Yelp UK', url: 'https://www.yelp.co.uk', category: 'core' },
  { id: 'yell', name: 'Yell.com', url: 'https://www.yell.com', category: 'core' },
  { id: 'foursquare', name: 'Foursquare', url: 'https://foursquare.com', category: 'core' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com', category: 'core' },

  // --- UK general directories ---
  { id: 'thomson-local', name: 'Thomson Local', url: 'https://www.thomsonlocal.com', category: 'directory' },
  { id: '192-com', name: '192.com', url: 'https://www.192.com', category: 'directory' },
  { id: 'scoot', name: 'Scoot', url: 'https://www.scoot.co.uk', category: 'directory' },
  { id: 'central-index', name: 'Central Index', url: 'https://www.centralindex.com', category: 'directory' },
  { id: 'freeindex', name: 'FreeIndex', url: 'https://www.freeindex.co.uk', category: 'directory' },
  { id: 'thebestof', name: 'theBestOf', url: 'https://www.thebestof.co.uk', category: 'directory' },
  { id: 'cylex-uk', name: 'Cylex UK', url: 'https://www.cylex-uk.co.uk', category: 'directory' },
  { id: 'hotfrog-uk', name: 'Hotfrog UK', url: 'https://www.hotfrog.co.uk', category: 'directory' },
  { id: 'brownbook', name: 'Brownbook', url: 'https://www.brownbook.net', category: 'directory' },
  { id: 'opendi-uk', name: 'Opendi UK', url: 'https://www.opendi.co.uk', category: 'directory' },
  { id: 'misterwhat-uk', name: 'MisterWhat UK', url: 'https://www.misterwhat.co.uk', category: 'directory' },
  { id: 'fyple-uk', name: 'Fyple UK', url: 'https://www.fyple.co.uk', category: 'directory' },
  { id: 'yalwa-uk', name: 'Yalwa UK', url: 'https://www.yalwa.co.uk', category: 'directory' },
  { id: 'bizify', name: 'Bizify', url: 'https://www.bizify.co.uk', category: 'directory' },
  { id: 'approved-business', name: 'Approved Business', url: 'https://www.approvedbusiness.co.uk', category: 'directory' },
  { id: 'uk-small-business-directory', name: 'UK Small Business Directory', url: 'https://www.uksmallbusinessdirectory.co.uk', category: 'directory' },
  { id: 'tupalo', name: 'Tupalo', url: 'https://tupalo.com', category: 'directory' },

  // --- B2B / trade registers ---
  { id: 'applegate', name: 'Applegate', url: 'https://www.applegate.co.uk', category: 'professional' },
  { id: 'businessmagnet', name: 'Business Magnet', url: 'https://www.businessmagnet.co.uk', category: 'professional' },
  { id: 'kompass-uk', name: 'Kompass UK', url: 'https://uk.kompass.com', category: 'professional' },
  { id: 'europages-uk', name: 'Europages UK', url: 'https://www.europages.co.uk', category: 'professional' },
  { id: 'companies-house', name: 'Companies House', url: 'https://find-and-update.company-information.service.gov.uk', category: 'professional' },

  // --- Review platforms ---
  { id: 'trustpilot', name: 'Trustpilot', url: 'https://www.trustpilot.com', category: 'reviews' },
  { id: 'tripadvisor-uk', name: 'Tripadvisor UK', url: 'https://www.tripadvisor.co.uk', category: 'reviews' },

  // --- Trade marketplaces ---
  { id: 'checkatrade', name: 'Checkatrade', url: 'https://www.checkatrade.com', category: 'trade' },
  { id: 'mybuilder', name: 'MyBuilder', url: 'https://www.mybuilder.com', category: 'trade' },
  { id: 'rated-people', name: 'Rated People', url: 'https://www.ratedpeople.com', category: 'trade' },
  { id: 'trustatrader', name: 'TrustATrader', url: 'https://www.trustatrader.com', category: 'trade' },
  { id: 'which-trusted-traders', name: 'Which? Trusted Traders', url: 'https://trustedtraders.which.co.uk', category: 'trade' },
  { id: 'bark-uk', name: 'Bark', url: 'https://www.bark.com', category: 'trade' },
];

// Country codes that should resolve to the UK publisher set. Everything else
// falls back to the USA set so an unknown/blank country still produces a
// runnable audit rather than an empty one.
const UK_COUNTRY_CODES = new Set(['UK', 'GB', 'GBR', 'UNITED KINGDOM', 'GREAT BRITAIN']);

/**
 * Resolve the publisher list for a country code.
 *
 * @param {string} country ISO-ish country code ('US', 'USA', 'UK', 'GB', …).
 *   Case-insensitive; unknown values fall back to the USA list.
 * @returns {Array<{id: string, name: string, url: string, category: string}>}
 */
function getSourcesForCountry(country) {
  const code = String(country || '').trim().toUpperCase();
  return UK_COUNTRY_CODES.has(code) ? CITATION_SOURCES_UK : CITATION_SOURCES_USA;
}

module.exports = {
  CITATION_SOURCES_USA,
  CITATION_SOURCES_UK,
  UK_COUNTRY_CODES,
  getSourcesForCountry,
};
