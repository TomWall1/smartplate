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

      // Try different endpoint patterns
      const endpointsToTry = [
        '/products/search',
        '/product/search', 
        '/api/products/search',
        '/api/search',
        '/search-products',
        '/products',
        '/',
        '/api/products',
        '/coles/products/search'
      ];
      
      console.log('Testing multiple endpoint patterns...');
      
      for (const endpoint of endpointsToTry) {
        try {
          console.log(`\n--- Testing endpoint: ${endpoint} ---`);
          
          const testResponse = await axios.get(`${this.baseURL}${endpoint}`, {
            headers: this.headers,
            params: {
              query: 'chicken',
              q: 'chicken', // Alternative parameter name
              search: 'chicken', // Another alternative
              page: 1,
              pageSize: 3,
              limit: 3 // Alternative parameter name
            },
            timeout: 10000
          });
          
          console.log(`SUCCESS on ${endpoint}!`);
          console.log('Response Status:', testResponse.status);
          console.log('Response Data Keys:', Object.keys(testResponse.data || {}));
          console.log('Response Data Structure:', JSON.stringify(testResponse.data, null, 2));
          
          // Check if we got products in any format
          const data = testResponse.data;
          let products = null;
          
          if (data.products && Array.isArray(data.products)) {
            products = data.products;
          } else if (data.results && Array.isArray(data.results)) {
            products = data.results;
          } else if (data.items && Array.isArray(data.items)) {
            products = data.items;
          } else if (Array.isArray(data)) {
            products = data;
          } else if (data.data && Array.isArray(data.data)) {
            products = data.data;
          }
          
          if (products && products.length > 0) {
            console.log('SUCCESS: Found products!', products.length);
            console.log('Sample product:', JSON.stringify(products[0], null, 2));
            
            // Process the real data
            const realDeals = this.processRealApiData(products, endpoint);
            console.log('Processed deals:', realDeals.length);
            console.log('=== COLES API DEBUG END (SUCCESS) ===');
            return realDeals;
          } else {
            console.log('Endpoint responded but no products found');
          }
          
        } catch (endpointError) {
          console.log(`${endpoint} failed:`, endpointError.response?.status || endpointError.message);
          if (endpointError.response?.status === 404) {
            console.log('404 - Endpoint does not exist');
          } else if (endpointError.response?.status === 401) {
            console.log('401 - Authentication failed');
          } else if (endpointError.response?.status === 403) {
            console.log('403 - Forbidden - API key might not have access');
          } else {
            console.log('Other error:', endpointError.response?.data || endpointError.message);
          }
        }
      }
      
      console.log('All endpoints failed, falling back to mock data');
      console.log('=== COLES API DEBUG END (FALLBACK) ===');
      return this.getMockDeals();
      
    } catch (error) {
      console.error('Outer error in fetchDeals:', error.message);
      return this.getMockDeals();
    }
  }

  processRealApiData(products, successfulEndpoint) {
    console.log(`Processing real data from endpoint: ${successfulEndpoint}`);
    
    return products.map((product, index) => {
      console.log(`Processing product ${index}:`, JSON.stringify(product, null, 2));
      
      return {
        name: product.name || product.displayName || product.title || product.productName || `Product ${index + 1}`,
        category: this.categorizeProduct(product.name || product.displayName || product.title || ''),
        price: this.parsePrice(product.price || product.currentPrice || product.salePrice || product.cost || 0),
        originalPrice: this.parsePrice(product.originalPrice || product.wasPrice || product.regularPrice || product.listPrice || product.price || 0) * 1.3,
        store: "coles",
        description: product.description || product.name || product.title || '',
        unit: product.packageSize || product.unit || product.size || "per item",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        productUrl: product.url || product.link || product.productUrl || this.generateColesSearchUrl(product.name || 'product'),
        brand: product.brand || product.manufacturer || product.brandName || '',
        apiSource: 'real-coles-api',
        sourceEndpoint: successfulEndpoint
      };
    });
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
      // Use the first endpoint that works (we'll discover this from fetchDeals)
      const response = await axios.get(`${this.baseURL}/products/search`, {
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