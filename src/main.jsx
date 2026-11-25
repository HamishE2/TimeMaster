import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './filePersistence.css';
import './chronograph.css';
import './screens.css';
import './polish.css';
import './financials.css';
import './stepForm.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
