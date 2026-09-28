import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ege/fonts.css';
import './ege/ege-ui.css';
import './app.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
