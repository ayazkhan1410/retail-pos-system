import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { useLanguageStore } from './i18n';

const launch = new URL(window.location.href);
const setupLanguage = launch.searchParams.get('setupLanguage');
if (setupLanguage === 'en' || setupLanguage === 'ur') {
  if (!localStorage.getItem('smartshop-language')) useLanguageStore.getState().setLanguage(setupLanguage);
  launch.searchParams.delete('setupLanguage');
  window.history.replaceState(null, '', launch);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline shell is best-effort; POS still works when the API is up.
    });
  });
}

