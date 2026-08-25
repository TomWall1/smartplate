/**
 * Display-layer cleanup for text and image URLs that arrive from the
 * catalogue feeds.
 *
 * Catalogue names come through HTML-encoded — about a quarter of them
 * ("Arnott&rsquo;s Shapes", "M&amp;Ms", "Chicken Fillets &ndash; From the
 * Deli"). The durable fix is in the backend normaliser, but decoding here
 * means existing cached deals read correctly without waiting for a refresh.
 */

// The entities that actually appear in the feeds, plus the numeric forms.
const NAMED: Record<string, string> = {
  amp: '&',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  reg: '®',
  trade: '™',
  deg: '°',
  frac12: '½',
  lt: '<',
  gt: '>',
};

export function decodeEntities(input?: string | null): string {
  if (!input) return '';
  return (
    input
      // Numeric: &#8217; and &#x2019;
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      // Named — run last so a decoded &amp; cannot re-trigger a match.
      .replace(/&([a-z][a-z0-9]*);/gi, (whole, name) => NAMED[name.toLowerCase()] ?? whole)
      .trim()
  );
}

/**
 * Pick a usable product photo, repairing Coles URLs on the way.
 *
 * Coles' API returns image paths without their storage container, so the
 * backend stores `https://productimages.coles.com.au/3/3989952.jpg`. Azure
 * rejects that with OutOfRangeInput (a one-character container name), which is
 * why Coles photos were blank while Woolworths' were fine. The path needs its
 * `/productimages` segment. Fixed at source in colesEnrich.js too, but every
 * already-cached deal still carries the broken form until the weekly refresh.
 */
export function dealImageUrl(deal: any): string | undefined {
  const raw: string | undefined = deal?.imageUrl ?? deal?.productImage ?? deal?.image ?? undefined;
  if (!raw) return undefined;
  return raw.replace(
    /^(https:\/\/productimages\.coles\.com\.au)\/(?!productimages\/)/,
    '$1/productimages/',
  );
}

/** "Valid until 26 Aug" — short, no year, matches how a catalogue reads. */
export function formatShortDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
