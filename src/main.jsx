import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { initNative } from './lib/native.js';

// Initialize native bindings (StatusBar, SplashScreen, hardware back button).
// On web this is a no-op.
initNative();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
