import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ChefHat, User, ShoppingCart, Wifi, WifiOff } from 'lucide-react';

const Navigation = ({ apiStatus }) => {
  const location = useLocation();
  
  const navItems = [
    { path: '/', icon: Home, label: 'Deals' },
    { path: '/recipes', icon: ChefHat, label: 'Recipes' },
    { path: '/profile', icon: User, label: 'Profile' }
  ];

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">SmartPlate</span>
            
            {/* API Status Indicator */}
            <div className="ml-2">
              {apiStatus === 'connected' && (
                <div className="flex items-center text-green-600">
                  <Wifi className="w-4 h-4" />
                  <span className="ml-1 text-xs font-medium">API</span>
                </div>
              )}
              {apiStatus === 'disconnected' && (
                <div className="flex items-center text-yellow-600">
                  <WifiOff className="w-4 h-4" />
                  <span className="ml-1 text-xs font-medium">Demo</span>
                </div>
              )}
              {apiStatus === 'unknown' && (
                <div className="flex items-center text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          </Link>
          
          <div className="flex space-x-6">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === path
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;