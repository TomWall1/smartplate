// Store brand colours — kept as hardcoded hex (not CSS vars) since they're
// the supermarkets' own brand colours. Previously duplicated in StorePage.jsx
// and PriceAlerts.jsx.

export const STORE_COLORS = {
  // Primary hexes are the retailers' brand colours (keep as-is).
  // Light tints are warm, bone-mixed versions of each brand colour so they
  // sit comfortably on the Direction-01 palette (the old mint/pink/baby-blue
  // pastels clashed with the warm background).
  woolworths: { bg: '#007833', light: '#E3E7D6', text: '#ffffff' },
  coles:      { bg: '#e31837', light: '#F2DFD6', text: '#ffffff' },
  iga:        { bg: '#003da5', light: '#DFE1E6', text: '#ffffff' },
};

// Google's favicon service instead of hotlinking each retailer's favicon —
// IGA serves a 0-byte favicon and Coles blocks cross-site requests from
// browsers, so direct hotlinks rendered as missing images.
const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

export const STORE_LOGOS = {
  woolworths: favicon('woolworths.com.au'),
  coles:      favicon('coles.com.au'),
  iga:        favicon('iga.com.au'),
};
