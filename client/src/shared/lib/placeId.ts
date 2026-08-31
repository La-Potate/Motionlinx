/**
 * Parse a Google place identifier out of whatever someone pastes.
 *
 * Google gives people several shapes for the same business — a full Maps URL,
 * a share link with `?place_id=`, a `?cid=` link, or the bare ChI… id — and
 * the heatmap API needs the id specifically. Doing this client-side means a
 * report can be set up with no Google API key; only generating the grid
 * needs one.
 *
 * Two near-identical copies of this already live in GbaAuditPage and
 * GbaComparePage. This is the shared version; those two are deliberately left
 * alone for now, since changing how they resolve a business would alter what
 * those tools look up.
 */

/** A Places id is `ChI` followed by a long url-safe string. */
export const PLACE_ID_REGEX = /^ChI[A-Za-z0-9_-]{20,}$/;

export type ParsedPlace = {
  /** Set only when a real place id was found. */
  placeId: string;
  /** Numeric customer id from a ?cid= link, when present. */
  cid: string;
  /** Whatever was left over — a URL or free text to search with. */
  raw: string;
};

export function parsePlaceInput(input = ''): ParsedPlace {
  const out: ParsedPlace = { placeId: '', cid: '', raw: '' };
  const trimmed = String(input).trim();
  if (!trimmed) return out;
  out.raw = trimmed;

  // A bare id is the simplest case and needs no URL parsing.
  if (PLACE_ID_REGEX.test(trimmed)) {
    out.placeId = trimmed;
    return out;
  }

  try {
    const url = new URL(trimmed);
    const candidate = url.searchParams.get('place_id') || '';
    if (PLACE_ID_REGEX.test(candidate)) out.placeId = candidate;
    // Maps writes the numeric id as either cid= or ludocid= depending on
    // which surface produced the link.
    const cid = url.toString().match(/(?:cid|ludocid)=(\d{5,})/i)?.[1];
    if (cid) out.cid = cid;
    return out;
  } catch {
    // Not a URL. Fall through — it may still carry a cid= fragment.
  }

  const cid = trimmed.match(/(?:cid|ludocid)=(\d{5,})/i)?.[1];
  if (cid) out.cid = cid;
  return out;
}

/**
 * Coordinates embedded in a Maps URL, e.g. `.../@37.4224,-122.0856,17z`.
 * Lets a pasted link fill the map position without a geocode round-trip.
 */
export function parseLatLngFromMapsUrl(input = ''): { lat: number; lng: number } | null {
  const m = String(input).match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
