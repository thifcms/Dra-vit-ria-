import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

// Página de check-in do próprio paciente — acessada por um link único (com token secreto)
// que a clínica entrega no momento do agendamento. Não lê nenhum dado do agendamento: só
// tenta escrever o horário de chegada, provando conhecer o token. Ninguém consegue usar
// esse link pra ver ou alterar dados de outro paciente.
export default function CheckIn() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const apt = params.get('apt');
  const token = params.get('token');
  const date = params.get('date');
  const time = params.get('time');

  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const handleCheckIn = async () => {
    if (!apt || !token) return;
    setStatus('submitting');
    try {
      await updateDoc(doc(db, 'appointments', apt), {
        checkinToken: token,
        checkedInAt: new Date().toISOString(),
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
    }
  };

  if (!apt || !token) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9] p-6 text-center">
        <p className="text-[#9CA3AF] font-light">Link de check-in inválido.</p>
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
            <div className="w-20 h-20 bg-[#F0F7F0] rounded-full flex items-center justify-center mx-auto mb-8">
              <CheckCircle2 className="text-[#8BA888] w-10 h-10" />
            </div>
            <h1 className="text-2xl font-light text-[#4A433D] mb-3 serif">Chegada confirmada!</h1>
            <p className="text-[#9CA3AF] font-light">Avise a recepção. Você será chamado(a) em breve.</p>
          </>
        ) : status === 'error' ? (
          <>
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8">
              <XCircle className="text-red-400 w-10 h-10" />
            </div>
            <h1 className="text-2xl font-light text-[#4A433D] mb-3 serif">Link inválido ou expirado</h1>
            <p className="text-[#9CA3AF] font-light">Peça um novo link à recepção.</p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-[#EADFD4]/10 rounded-full flex items-center justify-center mx-auto mb-8">
              <Clock className="text-[#EADFD4] w-10 h-10" />
            </div>
            <h1 className="text-2xl font-light text-[#4A433D] mb-2 serif">Confirmar chegada</h1>
            {date && time && (
              <p className="text-[#9CA3AF] font-light mb-8">
                Seu horário: {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} às {time}
              </p>
            )}
            <button
              onClick={handleCheckIn}
              disabled={status === 'submitting'}
              className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
              {status === 'submitting' ? 'Confirmando...' : 'Cheguei — Confirmar Chegada'}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
