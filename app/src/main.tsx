import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ege/fonts.css';
import './ege/ege-ui.css';
import './app.css';
import App from './App';

// The kit styles hang off body.ege. Set it here too, in case the host page rewrites the body tag.
document.body.classList.add('ege');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
