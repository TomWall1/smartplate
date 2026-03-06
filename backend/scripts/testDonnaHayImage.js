const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://www.donnahay.com.au/recipes/dinner/agadashi-tofu-dumplings', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
  timeout: 15000,
}).then(({ data, request }) => {
  const $ = cheerio.load(data);
  console.log('Final URL:', request.res.responseUrl || 'unknown');
  console.log('base tag href:', $('base').attr('href') || '(none)');
  console.log('og:image content:', $('meta[property="og:image"]').attr('content'));
  $('meta').each((i, el) => {
    const prop = ($(el).attr('property') || $(el).attr('name') || '');
    if (prop.toLowerCase().includes('image')) {
      console.log(`  ${prop}: ${$(el).attr('content')}`);
    }
  });
}).catch(err => console.error(err.message));
