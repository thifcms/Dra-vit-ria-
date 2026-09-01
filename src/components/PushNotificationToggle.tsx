import { useState, useEffect } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { showToast } from '../lib/toast';
import { Bell, BellOff } from 'lucide-react';
import { isPushSupported, getPushSubscriptionStatus, subscribeToPush, unsubscribeFromPush } from '../lib/push';

// Botão de ativar/desativar notificação push — avisa quando um agendamento novo chega
// na Agenda, mesmo com o app fechado. Cada administrador ativa a própria, no próprio
// aparelho (uma assinatura por uid, guardada em pushSubscriptions/{uid}).
export default function PushNotificationToggle({ user }: { user: User }) {
  const [status, setStatus] = useState<'loading' | 'not-supported' | 'denied' | 'subscribed' | 'not-subscribed'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushSubscriptionStatus().then(setStatus);
  }, []);

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (status === 'subscribed') {
        await unsubscribeFromPush();
        await deleteDoc(doc(db, 'pushSubscriptions', user.uid)).catch(() => {});
        setStatus('not-subscribed');
        showToast('Notificações desativadas');
      } else {
        const sub = await subscribeToPush();
        if (!sub) {
          showToast('Não foi possível ativar — confira se as notificações estão permitidas no navegador', 'error');
          setStatus(await getPushSubscriptionStatus());
          setBusy(false);
          return;
        }
        await setDoc(doc(db, 'pushSubscriptions', user.uid), {
          subscription: sub.toJSON(),
          updatedAt: new Date().toISOString(),
        });
        setStatus('subscribed');
        showToast('Notificações ativadas — você vai ser avisado quando chegar agendamento novo');
      }
    } catch (err: any) {
      console.error('Erro ao configurar notificações:', err);
      showToast(`Erro ao configurar notificações: ${err?.code || err?.message || 'desconhecido'}`, 'error');
    }
    setBusy(false);
  };

  if (status === 'loading') return null;
  if (status === 'not-supported') {
    return (
      <p className="text-[10px] text-[#9CA3AF] font-light mt-2 ml-1">
        Notificações não são suportadas neste navegador/aparelho.
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        disabled={busy || status === 'denied'}
        className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 ${
          status === 'subscribed' ? 'bg-[#F0F7F0] text-[#8BA888]' : 'bg-[#EADFD4] text-white hover:bg-[#DFCFBF]'
        }`}
      >
        {status === 'subscribed' ? <BellOff size={16} /> : <Bell size={16} />}
        {busy ? 'Aguarde...' : status === 'subscribed' ? 'Desativar Notificações' : 'Ativar Notificações de Agendamento'}
      </button>
      {status === 'denied' && (
        <p className="text-[10px] text-red-400 font-light mt-2 ml-1">
          Notificações bloqueadas nas configurações do navegador — precisa liberar manualmente lá pra ativar aqui.
        </p>
      )}
    </div>
  );
}
