const axios = require('axios');

class ColesService {
  constructor() {
    this.baseURL = 'https://coles-product-price-api.p.rapidapi.com';
    this.apiKey = process.env.COLES_API_KEY;
    this.headers = {
      'X-RapidAPI-Key': this.apiKey,
      'X-RapidAPI-Host': 'coles-product-price-api.p.rapidapi.com'
    };
  }

  async fetchDeals() {
    try {
      console.log('=== COLES API DEBUG START ===');
      console.log('API Key configured:', !!this.apiKey);
      console.log('API Key prefix:', this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'Not set');
      console.log('Base URL:', this.baseURL);
      
      if (!this.apiKey) {
        console.log('No Coles API key found, using mock data');
        return this.getMockDeals();
      }

      // Test with a single search term first
      console.log('Testing single API call to Coles...');
      
      try {
        const testResponse = await axios.get(`${this.baseURL}/search`, {
          headers: this.headers,
          params: {
            query: 'chicken',
            page: 1,
            pageSize: 3
          },
          timeout: 15000
        });
        
        console.log('API Response Status:', testResponse.status);
        console.log('API Response Headers:', JSON.stringify(testResponse.headers, null, 2));
        console.log('API Response Data Keys:', Object.keys(testResponse.data || {}));
        console.log('API Response Data:', JSON.stringify(testResponse.data, null, 2));
        
        if (testResponse.data && testResponse.data.products && testResponse.data.products.length > 0) {
          console.log('SUCCESS: Got real data from Coles API');
          console.log('Sample product:', JSON.stringify(testResponse.data.products[0], null, 2));
          
          // Process the real data
          const realDeals = this.processRealApiData(testResponse.data.products);
          console.log('Processed deals:', realDeals.length);
          console.log('=== COLES API DEBUG END (SUCCESS) ===');
          return realDeals;
        } else {
          console.log('API returned data but no products found');
          console.log('Full response:', JSON.stringify(testResponse.data, null, 2));
        }
        
      } catch (apiError) {
        console.error('=== COLES API ERROR ===');
        console.error('Error message:', apiError.message);
        console.error('Error code:', apiError.code);
        if (apiError.response) {
          console.error('Response status:', apiError.response.status);
          console.error('Response headers:', JSON.stringify(apiError.response.headers, null, 2));
          console.error('Response data:', JSON.stringify(apiError.response.data, null, 2));
        }
        console.error('Request config:', JSON.stringify({
          url: apiError.config?.url,
          method: apiError.config?.method,
          headers: apiError.config?.headers,
          params: apiError.config?.params
        }, null, 2));
        console.error('=== END COLES API ERROR ===');
      }
      
      console.log('API call failed, falling back to mock data');
      console.log('=== COLES API DEBUG END (FALLBACK) ===');
      return this.getMockDeals();
      
    } catch (error) {
      console.error('Outer error in fetchDeals:', error.message);
      return this.getMockDeals();
    }
  }

  processRealApiData(products) {
    return products.map(product => ({
      name: product.name || product.displayName || 'Unknown Product',
      category: this.categorizeProduct(product.name || product.displayName || ''),
      price: this.parsePrice(product.price || product.currentPrice || 0),
      originalPrice: this.parsePrice(product.originalPrice || product.wasPrice || product.price || 0) * 1.3, // Estimate original
      store: "coles",
      description: product.description || product.name || '',
      unit: product.packageSize || product.unit || "per item",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      productUrl: product.url || product.link || this.generateColesSearchUrl(product.name || 'product'),
      brand: product.brand || product.manufacturer || '',
      apiSource: 'real-coles-api'
    }));
  }

  parsePrice(priceString) {
    if (typeof priceString === 'number') return priceString;
    if (typeof priceString === 'string') {
      const cleaned = priceString.replace(/[^0-9.]/g, '');
      return parseFloat(cleaned) || 0;
    }
    return 0;
  }

  async searchProducts(query, page = 1, pageSize = 10) {
    try {
      if (!this.apiKey) {
        throw new Error('Coles API key not configured');
      }

      console.log(`Searching Coles API: ${query}`);
      const response = await axios.get(`${this.baseURL}/search`, {
        headers: this.headers,
        params: {
          query,
          page,
          pageSize
        },
        timeout: 15000
      });

      console.log('Search response:', response.status, response.data?.products?.length || 0, 'products');
      return response.data;
    } catch (error) {
      console.error('Error searching Coles products:', error.message);
      throw error;
    }
  }

  generateColesSearchUrl(productName) {
    const searchQuery = encodeURIComponent(productName);
    return `https://www.coles.com.au/search?q=${searchQuery}`;
  }

  getMockDeals() {
    console.log('Returning Coles mock data');
    return [
      {
        name: "Baby Spinach",
        category: "Vegetables",
        price: 2.50,
        originalPrice: 3.99,
        store: "coles",
        description: "Fresh Baby Spinach 100g",
        unit: "per pack",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=baby%20spinach",
        discountPercentage: 37,
        apiSource: 'mock-data'
      },
      {
        name: "Greek Style Yogurt",
        category: "Dairy",
        price: 4.50,
        originalPrice: 6.99,
        store: "coles",
        description: "Chobani Greek Style Yogurt 500g",
        unit: "per tub",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=chobani%20greek%20yogurt",
        discountPercentage: 36,
        apiSource: 'mock-data'
      },
      {
        name: "Beef Mince",
        category: "Meat",
        price: 7.99,
        originalPrice: 11.99,
        store: "coles",
        description: "Premium Beef Mince 500g",
        unit: "per pack",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=beef%20mince",
        discountPercentage: 33,
        apiSource: 'mock-data'
      },
      {
        name: "Mixed Berries",
        category: "Fruit",
        price: 3.99,
        originalPrice: 5.99,
        store: "coles",
        description: "Frozen Mixed Berries 300g",
        unit: "per pack",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=frozen%20mixed%20berries",
        discountPercentage: 33,
        apiSource: 'mock-data'
      },
      {
        name: "Pasta",
        category: "Pantry",
        price: 1.50,
        originalPrice: 2.50,
        store: "coles",
        description: "San Remo Durum Wheat Pasta 500g",
        unit: "per pack",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=san%20remo%20pasta",
        discountPercentage: 40,
        apiSource: 'mock-data'
      },
      {
        name: "Lean Chicken Thighs",
        category: "Meat",
        price: 6.99,
        originalPrice: 9.99,
        store: "coles",
        description: "Free Range Chicken Thighs 1kg",
        unit: "per kg",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=free%20range%20chicken%20thighs",
        discountPercentage: 30,
        apiSource: 'mock-data'
      },
      {
        name: "Carrots",
        category: "Vegetables",
        price: 1.50,
        originalPrice: 2.90,
        store: "coles",
        description: "Fresh Carrots 1kg",
        unit: "per kg",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=fresh%20carrots",
        discountPercentage: 48,
        apiSource: 'mock-data'
      },
      {
        name: "Bananas",
        category: "Fruit",
        price: 2.90,
        originalPrice: 4.90,
        store: "coles",
        description: "Fresh Bananas",
        unit: "per kg",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: "https://www.coles.com.au/search?q=bananas",
        discountPercentage: 41,
        apiSource: 'mock-data'
      }
    ];
  }

  categorizeProduct(productName) {
    const name = productName.toLowerCase();
    
    if (name.includes('chicken') || name.includes('beef') || name.includes('lamb') || name.includes('pork') || name.includes('mince')) {
      return 'Meat';
    }
    if (name.includes('salmon') || name.includes('fish') || name.includes('prawns') || name.includes('seafood')) {
      return 'Seafood';
    }
    if (name.includes('milk') || name.includes('yogurt') || name.includes('cheese') || name.includes('butter')) {
      return 'Dairy';
    }
    if (name.includes('spinach') || name.includes('lettuce') || name.includes('carrot') || name.includes('potato') || name.includes('onion')) {
      return 'Vegetables';
    }
    if (name.includes('apple') || name.includes('banana') || name.includes('berries') || name.includes('orange') || name.includes('avocado')) {
      return 'Fruit';
    }
    if (name.includes('rice') || name.includes('pasta') || name.includes('bread') || name.includes('oil') || name.includes('flour')) {
      return 'Pantry';
    }
    
    return 'Other';
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ColesService();