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
      console.log('Fetching Coles deals from RapidAPI...');
      
      if (!this.apiKey) {
        console.log('No Coles API key found, using mock data');
        return this.getMockDeals();
      }

      // Search for products that are commonly on sale
      const searchTerms = [
        'chicken', 'beef', 'salmon', 'yogurt', 'spinach', 
        'avocado', 'rice', 'pasta', 'berries', 'milk'
      ];
      
      const allDeals = [];
      
      for (const term of searchTerms) {
        try {
          const response = await axios.get(`${this.baseURL}/search`, {
            headers: this.headers,
            params: {
              query: term,
              page: 1,
              pageSize: 5 // Limit to avoid hitting rate limits
            }
          });
          
          if (response.data && response.data.products) {
            const products = response.data.products.map(product => ({
              name: product.name,
              category: this.categorizeProduct(product.name),
              price: parseFloat(product.price) || 0,
              originalPrice: this.estimateOriginalPrice(parseFloat(product.price) || 0),
              store: "coles",
              description: product.description || product.name,
              unit: product.size || "per item",
              validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              productUrl: product.url || this.generateColesSearchUrl(product.name),
              brand: product.brand
            }));
            
            allDeals.push(...products);
          }
          
          // Rate limiting - wait between requests
          await this.delay(200);
        } catch (error) {
          console.error(`Error fetching ${term} from Coles:`, error.message);
        }
      }
      
      return allDeals.length > 0 ? allDeals : this.getMockDeals();
    } catch (error) {
      console.error('Error fetching Coles deals:', error);
      return this.getMockDeals();
    }
  }

  async searchProducts(query, page = 1, pageSize = 10) {
    try {
      if (!this.apiKey) {
        throw new Error('Coles API key not configured');
      }

      const response = await axios.get(`${this.baseURL}/search`, {
        headers: this.headers,
        params: {
          query,
          page,
          pageSize
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error searching Coles products:', error);
      throw error;
    }
  }

  generateColesSearchUrl(productName) {
    const searchQuery = encodeURIComponent(productName);
    return `https://www.coles.com.au/search?q=${searchQuery}`;
  }

  getMockDeals() {
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
        discountPercentage: 37
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
        discountPercentage: 36
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
        discountPercentage: 33
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
        discountPercentage: 33
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
        discountPercentage: 40
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
        discountPercentage: 30
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
        discountPercentage: 48
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
        discountPercentage: 41
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

  estimateOriginalPrice(currentPrice) {
    // Estimate original price assuming 20-40% discount
    const discountMultiplier = 1 + (Math.random() * 0.2 + 0.2); // 20-40% markup
    return Math.round(currentPrice * discountMultiplier * 100) / 100;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ColesService();