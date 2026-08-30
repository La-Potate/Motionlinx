import type { Accent } from '@/app/nav-config';

/**
 * Static class maps for the four section colours.
 *
 * These MUST be complete literal strings — Tailwind scans source text, so a
 * composed name like `bg-${accent}/30` is never emitted into the stylesheet.
 * Every token here (mint / sky / lavender / butter and their -ink pairs) is
 * redefined for dark mode in globals.css, so these work in both themes
 * without a second map.
 */

/** Tinted panel: soft background + matching border. */
const SURFACE: Record<Accent, string> = {
  mint: 'border-mint bg-mint/25',
  sky: 'border-sky bg-sky/25',
  lavender: 'border-lavender bg-lavender/25',
  butter: 'border-butter bg-butter/30',
};

/** Readable ink on that tint — also used for small icons and eyebrows. */
const TEXT: Record<Accent, string> = {
  mint: 'text-mint-ink',
  sky: 'text-sky-ink',
  lavender: 'text-lavender-ink',
  butter: 'text-butter-ink',
};

/** Solid icon tile — stronger fill than SURFACE, for card and header marks. */
const TILE: Record<Accent, string> = {
  mint: 'bg-mint text-mint-ink',
  sky: 'bg-sky text-sky-ink',
  lavender: 'bg-lavender text-lavender-ink',
  butter: 'bg-butter text-butter-ink',
};

/** Hover state for a tool row's icon tile — neutral until pointed at. */
const TILE_HOVER: Record<Accent, string> = {
  mint: 'group-hover:bg-mint group-hover:text-mint-ink',
  sky: 'group-hover:bg-sky group-hover:text-sky-ink',
  lavender: 'group-hover:bg-lavender group-hover:text-lavender-ink',
  butter: 'group-hover:bg-butter group-hover:text-butter-ink',
};

/** Left edge marker used to band a card to its section. */
const EDGE: Record<Accent, string> = {
  mint: 'bg-mint-ink',
  sky: 'bg-sky-ink',
  lavender: 'bg-lavender-ink',
  butter: 'bg-butter-ink',
};

/** Border that appears on hover, tinted to the section. */
const BORDER_HOVER: Record<Accent, string> = {
  mint: 'hover:border-mint-ink/40',
  sky: 'hover:border-sky-ink/40',
  lavender: 'hover:border-lavender-ink/40',
  butter: 'hover:border-butter-ink/40',
};

export const accentSurface = (a: Accent) => SURFACE[a];
export const accentText = (a: Accent) => TEXT[a];
export const accentTile = (a: Accent) => TILE[a];
export const accentTileHover = (a: Accent) => TILE_HOVER[a];
export const accentEdge = (a: Accent) => EDGE[a];
export const accentBorderHover = (a: Accent) => BORDER_HOVER[a];
