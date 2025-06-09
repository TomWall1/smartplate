import React, { useState } from 'react';
import { Save, Plus, X } from 'lucide-react';

const Profile = ({ preferences, onUpdatePreferences }) => {
  const [localPreferences, setLocalPreferences] = useState(preferences);
  const [newPantryItem, setNewPantryItem] = useState('');
  const [newDislike, setNewDislike] = useState('');

  const dietaryOptions = [
    { id: 'vegetarian', label: 'Vegetarian' },
    { id: 'vegan', label: 'Vegan' },
    { id: 'gluten-free', label: 'Gluten Free' },
    { id: 'dairy-free', label: 'Dairy Free' },
    { id: 'low-carb', label: 'Low Carb' },
    { id: 'keto', label: 'Keto' }
  ];

  const mealTypeOptions = [
    { id: 'quick', label: 'Quick (under 30 min)' },
    { id: 'family-friendly', label: 'Family Friendly' },
    { id: 'batch-cook', label: 'Good for Batch Cooking' },
    { id: 'one-pot', label: 'One Pot Meals' },
    { id: 'healthy', label: 'Healthy' },
    { id: 'comfort', label: 'Comfort Food' }
  ];

  const handleDietaryChange = (dietaryId) => {
    const newDietary = localPreferences.dietary.includes(dietaryId)
      ? localPreferences.dietary.filter(id => id !== dietaryId)
      : [...localPreferences.dietary, dietaryId];
    
    setLocalPreferences({ ...localPreferences, dietary: newDietary });
  };

  const handleMealTypeChange = (mealTypeId) => {
    const newMealTypes = localPreferences.mealTypes.includes(mealTypeId)
      ? localPreferences.mealTypes.filter(id => id !== mealTypeId)
      : [...localPreferences.mealTypes, mealTypeId];
    
    setLocalPreferences({ ...localPreferences, mealTypes: newMealTypes });
  };

  const addPantryItem = () => {
    if (newPantryItem.trim()) {
      setLocalPreferences({
        ...localPreferences,
        pantryItems: [...localPreferences.pantryItems, newPantryItem.trim()]
      });
      setNewPantryItem('');
    }
  };

  const removePantryItem = (item) => {
    setLocalPreferences({
      ...localPreferences,
      pantryItems: localPreferences.pantryItems.filter(i => i !== item)
    });
  };

  const addDislike = () => {
    if (newDislike.trim()) {
      setLocalPreferences({
        ...localPreferences,
        dislikes: [...localPreferences.dislikes, newDislike.trim()]
      });
      setNewDislike('');
    }
  };

  const removeDislike = (item) => {
    setLocalPreferences({
      ...localPreferences,
      dislikes: localPreferences.dislikes.filter(i => i !== item)
    });
  };

  const handleSave = () => {
    onUpdatePreferences(localPreferences);
    alert('Preferences saved!');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Your Preferences
        </h1>
        <p className="text-gray-600">
          Customize your recipe recommendations
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6 space-y-6">
        {/* Dietary Restrictions */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Dietary Restrictions</h3>
          <div className="grid grid-cols-2 gap-3">
            {dietaryOptions.map(option => (
              <label key={option.id} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localPreferences.dietary.includes(option.id)}
                  onChange={() => handleDietaryChange(option.id)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Meal Types */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Preferred Meal Types</h3>
          <div className="grid grid-cols-2 gap-3">
            {mealTypeOptions.map(option => (
              <label key={option.id} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localPreferences.mealTypes.includes(option.id)}
                  onChange={() => handleMealTypeChange(option.id)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Pantry Items */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Pantry Items I Have</h3>
          <div className="flex space-x-2 mb-3">
            <input
              type="text"
              value={newPantryItem}
              onChange={(e) => setNewPantryItem(e.target.value)}
              placeholder="Add pantry item..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && addPantryItem()}
            />
            <button
              onClick={addPantryItem}
              className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {localPreferences.pantryItems.map((item, index) => (
              <span key={index} className="inline-flex items-center space-x-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                <span>{item}</span>
                <button
                  onClick={() => removePantryItem(item)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Dislikes */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Ingredients I Don't Like</h3>
          <div className="flex space-x-2 mb-3">
            <input
              type="text"
              value={newDislike}
              onChange={(e) => setNewDislike(e.target.value)}
              placeholder="Add disliked ingredient..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && addDislike()}
            />
            <button
              onClick={addDislike}
              className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {localPreferences.dislikes.map((item, index) => (
              <span key={index} className="inline-flex items-center space-x-1 bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">
                <span>{item}</span>
                <button
                  onClick={() => removeDislike(item)}
                  className="text-red-600 hover:text-red-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="inline-flex items-center space-x-2 px-6 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Preferences</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;