// Publisher attribution metadata — shared by RecipeCard and RecipeDetail.
// Logos come from Google's favicon service: direct favicon hotlinks are
// unreliable (some sites serve empty icons or block cross-site requests).

const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

export const SOURCE_META = {
  jamieoliver:   { label: 'Jamie Oliver',        logo: favicon('jamieoliver.com') },
  recipetineats: { label: 'RecipeTin Eats',      logo: favicon('recipetineats.com') },
  donnahay:      { label: 'Donna Hay',           logo: favicon('donnahay.com.au') },
  womensweekly:  { label: "Women's Weekly Food", logo: favicon('womensweeklyfood.com.au') },
  juliegoodwin:  { label: 'Julie Goodwin',       logo: favicon('juliegoodwin.com.au') },
};
