import { useEffect, useRef } from 'react';
import { collection, query, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Appointment } from '../types';
import { todayLocalStr } from '../lib/slots';
import { showToast } from '../lib/toast';

// Ao virar o dia, qualquer atendimento de um dia ANTERIOR que ainda estava "agendado" ou
// "confirmado" (nunca foi marcado como realizado nem cancelado) é automaticamente
// marcado como "Faltou". Antes essa lógica vivia dentro de Schedule.tsx, que só é
// montado quando alguém visita a aba Agenda — se ninguém abrisse a Agenda naquele dia,
// a marcação nunca rodava. Vive aqui, montado sempre que o app está aberto (App.tsx),
// independente de qual aba está ativa.
export default function NoShowAutoMarker({ user }: { user: User }) {
  const checkedTodayRef = useRef<string | null>(null);
  // Evita ficar tentando de novo sem parar dentro da mesma sessão do app quando a
  // causa é permanente (ex: erro de permissão) — sem isso, cada pequena mudança na
  // coleção de agendamentos disparava uma nova tentativa, empilhando o mesmo erro
  // repetidas vezes na tela.
  const attemptsThisSessionRef = useRef(0);
  const MAX_ATTEMPTS_PER_SESSION = 2;

  useEffect(() => {
    const q = query(collection(db, 'appointments'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const todayStr = todayLocalStr();
      // Já rodou hoje — evita ficar reprocessando à toa a cada mudança na coleção
      if (checkedTodayRef.current === todayStr) return;
      if (attemptsThisSessionRef.current >= MAX_ATTEMPTS_PER_SESSION) return;

      const appointments = snap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
      const stale = appointments.filter(a => a.date < todayStr && (a.status === 'scheduled' || a.status === 'confirmed'));
      if (stale.length === 0) {
        checkedTodayRef.current = todayStr;
        return;
      }

      checkedTodayRef.current = todayStr;
      attemptsThisSessionRef.current += 1;
      (async () => {
        let marked = 0;
        const errors: string[] = [];
        for (const appt of stale) {
          try {
            await updateDoc(doc(db, 'appointments', appt.id!), { status: 'no_show' });
            marked++;
          } catch (err: any) {
            errors.push(`${appt.patientName || appt.id}: ${err?.code || err?.message}`);
          }
        }
        if (marked > 0) {
          showToast(`${marked} atendimento(s) de dias anteriores marcado(s) como falta automaticamente`);
        }
        if (errors.length > 0) {
          console.error('NoShowAutoMarker — falhas ao marcar falta:', errors);
          showToast(`Falha ao marcar falta: ${errors[0]}`, 'error');
          // Se NENHUMA gravação passou, não marca como "verificado hoje" — assim, na
          // próxima mudança na coleção (ou próxima vez que o app carregar), tenta de
          // novo em vez de desistir silenciosamente pelo resto do dia. O limite de
          // tentativas por sessão acima evita que isso vire um loop de erros.
          if (marked === 0) checkedTodayRef.current = null;
        }
      })();
    }, (err) => {
      // Callback de erro do PRÓPRIO listener — diferente do try/catch de cada
      // atualização individual acima, isso cobre uma falha na escuta em si (ex: sem
      // permissão pra sequer LER a coleção), que antes falhava completamente em
      // silêncio, sem nenhum rastro de que a checagem nem chegou a rodar.
      console.error('NoShowAutoMarker — erro ao escutar agendamentos:', err);
    });
    return () => unsubscribe();
  }, [user.uid]);

  return null;
}
