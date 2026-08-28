// Notificação push — avisa a equipe (contas administradoras) quando um agendamento
// novo é criado, mesmo com o app fechado. A chave pública abaixo é segura de deixar
// no código (é feita pra isso, ao contrário da chave privada, que fica só no serviço
// de e-mail, nunca aqui no app).
export const VAPID_PUBLIC_KEY = 'BHxfb5RN_J0IK2vWmHhH3bTyR1MQb82r43I4J7rpX1H6vu5Vz6o-M8NV3oXFzQMyntJWhtCIVgFmB3W3NMoim1w';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushSubscriptionStatus(): Promise<'not-supported' | 'denied' | 'subscribed' | 'not-subscribed'> {
  if (!isPushSupported()) return 'not-supported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'not-subscribed';
  } catch {
    return 'not-subscribed';
  }
}

// Pede permissão (se ainda não tiver) e assina — devolve o objeto de assinatura pronto
// pra salvar no Firestore
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}
