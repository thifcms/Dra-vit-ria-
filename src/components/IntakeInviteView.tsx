import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import IntakeQuestionnaire from './IntakeQuestionnaire';

// Página pública de convite pra Ficha Clínica — diferente do fluxo original (que só
// aparecia depois do check-in de um agendamento específico), esse link funciona
// sozinho: cadastro manual de paciente novo, ou reenvio a qualquer momento pelo menu de
// check-in na Agenda. Lê só o mínimo necessário do convite (nunca o prontuário inteiro).
export default function IntakeInviteView() {
  const token = window.location.hash.split('/')[1]?.split('?')[0];
  const [invite, setInvite] = useState<{ patientId: string; patientName: string; ownerId: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Gera uma chave nova pra essa submissão — não está presa a um agendamento existente
  const [submissionKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    getDoc(doc(db, 'intakeInvites', token))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          setInvite({ patientId: data.patientId, patientName: data.patientName, ownerId: data.ownerId });
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9]">
        <div className="w-8 h-8 border-2 border-[#EADFD4] border-t-transparent rounded-full animate-spin" />
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
      appointmentId={submissionKey}
      patientId={invite.patientId}
      patientName={invite.patientName}
      ownerId={invite.ownerId}
    />
  );
}
