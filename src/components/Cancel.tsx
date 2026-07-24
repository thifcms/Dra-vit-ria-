import React, { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { slotId } from '../lib/slots';
import { motion } from 'motion/react';
import { XCircle, Clock, AlertTriangle } from 'lucide-react';

// Página de cancelamento do próprio paciente — acessada por um link único (com o mesmo
// token secreto do check-in) que a clínica entrega junto com a confirmação do agendamento.
// Não lê nenhum dado: só cancela o agendamento provando conhecer o token, e libera o
// horário na agenda pública automaticamente (a liberação só é permitida depois que o
// agendamento já está marcado como cancelado — ver firestore.rules).
export default function Cancel() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const apt = params.get('apt');
  const token = params.get('token');
  const date = params.get('date');
  const time = params.get('time');
  const clinic = params.get('clinic');

  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const handleCancel = async () => {
    if (!apt || !token) return;
    setStatus('submitting');
    try {
      await updateDoc(doc(db, 'appointments', apt), {
        checkinToken: token,
        status: 'cancelled',
      });
      // Libera o horário na agenda pública (só funciona depois do passo acima, por segurança)
      if (clinic && date && time) {
        await deleteDoc(doc(db, 'busySlots', slotId(clinic, date, time))).catch(() => {});
      }
      setStatus('done');
    } catch (err) {
      setStatus('error');
    }
  };

  if (!apt || !token) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9] p-6 text-center">
        <p className="text-[#9CA3AF] font-light">Link de cancelamento inválido.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#FDFBF9] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white p-10 rounded-[32px] shadow-sm border border-[#F5F2F0] text-center"
      >
        {status === 'done' ? (
          <>
            <div className="w-20 h-20 bg-[#FDF0F0] rounded-full flex items-center justify-center mx-auto mb-8">
              <XCircle className="text-red-400 w-10 h-10" />
            </div>
            <h1 className="text-2xl font-light text-[#5C544E] mb-3 serif">Consulta cancelada</h1>
            <p className="text-[#9CA3AF] font-light">Seu horário foi liberado. Se quiser remarcar, é só agendar de novo quando quiser.</p>
          </>
        ) : status === 'error' ? (
          <>
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8">
              <XCircle className="text-red-400 w-10 h-10" />
            </div>
            <h1 className="text-2xl font-light text-[#5C544E] mb-3 serif">Link inválido ou expirado</h1>
            <p className="text-[#9CA3AF] font-light">Se precisar cancelar, entre em contato diretamente com a clínica.</p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-8">
              <AlertTriangle className="text-amber-500 w-10 h-10" />
            </div>
            <h1 className="text-2xl font-light text-[#5C544E] mb-2 serif">Cancelar consulta?</h1>
            {date && time && (
              <p className="text-[#9CA3AF] font-light mb-8">
                {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {time}
              </p>
            )}
            <button
              onClick={handleCancel}
              disabled={status === 'submitting'}
              className="w-full py-4 bg-red-400 text-white rounded-2xl font-medium hover:bg-red-500 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
              {status === 'submitting' ? 'Cancelando...' : 'Sim, cancelar minha consulta'}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
