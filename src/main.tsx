import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import UpdateConfirmation from './components/UpdateConfirmation.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { LATEST_UPDATE_NOTE } from './changelog';

// Registra o service worker manualmente pra poder controlar exatamente quando a
// atualização é aplicada: detecta em segundo plano o tempo todo, mas só recarrega de
// verdade quando a pessoa reabre o app (troca de aba, volta do segundo plano) — nunca no
// meio do uso ativo, pra não arriscar perder algo que não foi salvo ainda (uma anamnese
// sendo preenchida, por exemplo).
let pendingUpdate: (() => void) | null = null;
const appOpenedAt = Date.now();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    localStorage.setItem('appJustUpdated', LATEST_UPDATE_NOTE);
    const apply = () => updateSW(true);
    // Detectado nos primeiros segundos = é a própria abertura do app agora, aplica na
    // hora. Detectado depois disso = pessoa já está usando o app, guarda e só aplica na
    // próxima vez que reabrir (ou se a aba já estiver em segundo plano nesse instante).
    if (Date.now() - appOpenedAt < 5000 || document.visibilityState === 'hidden') {
      apply();
    } else {
      pendingUpdate = apply;
    }
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

    // Ponto-chave: ao voltar a ficar visível (reabrir o app), primeiro aplica qualquer
    // atualização que já estava esperando, e também aproveita pra checar se apareceu uma
    // nova desde a última vez
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (pendingUpdate) {
          pendingUpdate();
          pendingUpdate = null;
        } else {
          registration.update().catch(() => {});
        }
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
