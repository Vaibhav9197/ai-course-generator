import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import Provider from './components/Provider.jsx';
import App from './App.jsx';
import { warmUpBackend } from './utils/api.js';
import './index.css';

// Kick the backend awake while React boots — Render's free tier cold-starts in ~50s.
warmUpBackend();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
