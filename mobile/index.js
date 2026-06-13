import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and ensures the environment is set up appropriately whether running in Expo
// Go or a native build. This replaces the removed expo/AppEntry.js entry point
// (deprecated in Expo SDK 50).
registerRootComponent(App);
