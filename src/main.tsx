import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import UpdateConfirmation from './components/UpdateConfirmation.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { LATEST_UPDATE_NOTE } from './changelog';

// Registra o service worker manualmente pra poder controlar exatamente o que acontece
// quando sai uma versão nova: em vez de pedir pra clicar em "Atualizar", aplica sozinho
// e recarrega — resolve de vez a confusão de ficar preso numa versão antiga em cache.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Avisa rapidamente que está atualizando (pra não parecer que a tela travou do nada)
    // e já aplica a atualização sozinho, sem esperar clique
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: #4A433D; color: white; padding: 14px 22px; border-radius: 20px;
      font-family: -apple-system, sans-serif; font-size: 13px; z-index: 99999;
      display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    `;
    container.innerHTML = `<span>Atualizando o app...</span>`;
    document.body.appendChild(container);
    // Marca que uma atualização está em andamento — o app confere isso assim que carrega
    // de novo (depois do reload que updateSW(true) provoca) e mostra a confirmação visual
    // de "app atualizado" com o resumo do que mudou, já que sem isso não sobra nenhum
    // sinal de que a atualização realmente aconteceu (o reload troca a página inteira,
    // incluindo esse aviso).
    localStorage.setItem('appJustUpdated', LATEST_UPDATE_NOTE);
    updateSW(true);
  },
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    // Checagem periódica de verdade — sem isso, o app só percebe uma atualização em
    // momentos específicos do navegador (variam por plataforma), o que na prática podia
    // significar ficar preso numa versão antiga por muito tempo se a pessoa deixa o app
    // aberto sem fechar. A cada 60s, pergunta pro servidor se tem versão nova.
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 1000);

    // Também confere assim que o app volta a ficar visível (troca de aba, volta do
    // background) — cobre o caso comum de celular: usuário sai do app, volta depois,
    // encontra a versão mais nova na hora, sem esperar o próximo ciclo de 60s.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {});
      }
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <UpdateConfirmation />
    </ErrorBoundary>
  </StrictMode>,
);
