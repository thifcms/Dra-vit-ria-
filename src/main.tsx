import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Registra o service worker manualmente (em vez do jeito automático padrão) só pra poder
// mostrar um aviso claro quando tiver uma versão nova publicada, em vez de o usuário ficar
// sem saber se já está na versão mais recente ou não — resolve boa parte da confusão de
// "cache antigo" que a gente vinha tendo.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: #5C544E; color: white; padding: 14px 20px; border-radius: 20px;
      font-family: -apple-system, sans-serif; font-size: 13px; z-index: 99999;
      display: flex; align-items: center; gap: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    `;
    container.innerHTML = `
      <span>Nova versão disponível</span>
      <button style="background:#EADFD4;color:#5C544E;border:none;border-radius:12px;padding:8px 14px;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;">Atualizar</button>
    `;
    container.querySelector('button')!.addEventListener('click', () => {
      updateSW(true);
    });
    document.body.appendChild(container);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
