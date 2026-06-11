// Store brand colours — kept as hardcoded hex (not CSS vars) since they're
// the supermarkets' own brand colours. Previously duplicated in StorePage.jsx
// and PriceAlerts.jsx.

export const STORE_COLORS = {
  woolworths: { bg: '#007833', light: '#e8f5e9', text: '#ffffff' },
  coles:      { bg: '#e31837', light: '#ffeaed', text: '#ffffff' },
  iga:        { bg: '#003da5', light: '#e8eeff', text: '#ffffff' },
};

export const STORE_LOGOS = {
  woolworths: 'https://www.woolworths.com.au/favicon.ico',
  coles:      'https://www.coles.com.au/favicon.ico',
  iga:        'https://www.iga.com.au/favicon.ico',
};
