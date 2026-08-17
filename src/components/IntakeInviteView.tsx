import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { fetchWithRetry } from '../lib/retryFetch';
import IntakeQuestionnaire from './IntakeQuestionnaire';

// Página pública de convite pra Ficha Clínica — diferente do fluxo original (que só
// aparecia depois do check-in de um agendamento específico), esse link funciona
// sozinho: cadastro manual de paciente novo, ou reenvio a qualquer momento pelo menu de
// check-in na Agenda. Lê só o mínimo necessário do convite (nunca o prontuário inteiro).
export default function IntakeInviteView() {
  const token = window.location.hash.split('/')[1]?.split('?')[0];
  const [invite, setInvite] = useState<{ patientId: string; patientName: string; ownerId: string; appointmentId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Diferente de "link não existe" — aqui é uma falha de conexão passageira, retry
  // automático já tentou e não conseguiu. Mostra mensagem diferente, com botão de tentar
  // de novo, em vez de dizer que o link está errado (o que não é verdade e só confunde
  // o paciente a pedir um link novo sem necessidade).
  const [networkError, setNetworkError] = useState(false);
  // Chave de reserva pra quando o convite não está vinculado a nenhum agendamento
  // específico (cadastro manual de paciente novo, por exemplo)
  const [fallbackKey] = useState(() => crypto.randomUUID());

  const loadInvite = () => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    setNetworkError(false);
    fetchWithRetry(() => getDoc(doc(db, 'intakeInvites', token)))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          setInvite({ patientId: data.patientId, patientName: data.patientName, ownerId: data.ownerId, appointmentId: data.appointmentId });
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNetworkError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInvite(); }, [token]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9]">
        <div className="w-8 h-8 border-2 border-[#EADFD4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (networkError) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6 text-center gap-4">
        <p className="text-[#4A433D] font-medium serif text-lg">Não foi possível conectar agora.</p>
        <p className="text-sm text-[#9CA3AF]">Verifique sua conexão com a internet e tente de novo — o link continua válido.</p>
        <button
          onClick={loadInvite}
          className="px-8 py-3 bg-[#EADFD4] text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (notFound || !invite) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6 text-center gap-3">
        <p className="text-[#4A433D] font-medium serif text-lg">Link inválido ou expirado.</p>
        <p className="text-sm text-[#9CA3AF]">Peça um novo link à recepção.</p>
      </div>
    );
  }

  return (
    <IntakeQuestionnaire
      appointmentId={invite.appointmentId || fallbackKey}
      patientId={invite.patientId}
      patientName={invite.patientName}
      ownerId={invite.ownerId}
    />
  );
}
