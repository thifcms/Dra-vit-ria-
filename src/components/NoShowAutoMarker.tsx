import { useEffect, useRef, useState } from 'react';
import { collection, query, onSnapshot, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Appointment, Patient } from '../types';
import { todayLocalStr } from '../lib/slots';
import { showToast } from '../lib/toast';
import { openWhatsApp, buildNoShowFollowUpMessage } from '../lib/reminders';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageCircle } from 'lucide-react';

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

  // Lista de quem acabou de ser marcado como falta automaticamente — mostrada como
  // sugestão de repescagem (mensagem pronta, um clique), sem forçar nada. Some da lista
  // assim que a pessoa manda ou dispensa aquele contato específico.
  const [reengageQueue, setReengageQueue] = useState<Appointment[]>([]);

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
        const markedAppts: Appointment[] = [];
        for (const appt of stale) {
          try {
            await updateDoc(doc(db, 'appointments', appt.id!), { status: 'no_show' });
            marked++;
            markedAppts.push(appt);
          } catch (err: any) {
            errors.push(`${appt.patientName || appt.id}: ${err?.code || err?.message}`);
          }
        }
        if (marked > 0) {
          showToast(`${marked} atendimento(s) de dias anteriores marcado(s) como falta automaticamente`);
          setReengageQueue(markedAppts);
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

  const dismissOne = (id: string) => setReengageQueue(prev => prev.filter(a => a.id !== id));

  const handleReengage = async (appt: Appointment) => {
    try {
      const patientSnap = appt.patientId ? await getDoc(doc(db, 'patients', appt.patientId)) : null;
      const patient = patientSnap?.exists() ? (patientSnap.data() as Patient) : null;
      const phone = patient?.phone || appt.guestPhone;
      if (!phone) {
        showToast('Paciente sem telefone cadastrado', 'error');
        dismissOne(appt.id!);
        return;
      }
      const message = buildNoShowFollowUpMessage({ patientName: appt.patientName, clinicName: 'a clínica' });
      openWhatsApp(phone, message);
    } finally {
      dismissOne(appt.id!);
    }
  };

  if (reengageQueue.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 right-6 z-40 max-w-sm bg-white rounded-[28px] border border-[#F5F2F0] shadow-xl p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 shrink-0">
            <MessageCircle size={18} />
          </div>
          <button onClick={() => setReengageQueue([])} className="text-[#9CA3AF] hover:text-[#4A433D]">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[#4A433D] font-medium mb-1">Reengajar quem faltou?</p>
        <p className="text-xs text-[#9CA3AF] font-light mb-4">
          {reengageQueue.length} paciente(s) marcado(s) como falta — mandar uma mensagem sugerindo remarcar?
        </p>
        <div className="space-y-2">
          {reengageQueue.slice(0, 3).map(appt => (
            <button
              key={appt.id}
              onClick={() => handleReengage(appt)}
              className="w-full flex items-center justify-between py-3 px-4 bg-[#FDFBF9] rounded-2xl text-xs font-medium text-[#4A433D] hover:bg-[#F5F2F0] transition-all"
            >
              {appt.patientName}
              <MessageCircle size={14} className="text-[#8BA888]" />
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
