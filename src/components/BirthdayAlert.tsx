import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Patient } from '../types';
import { openWhatsApp } from '../lib/reminders';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, X, MessageCircle } from 'lucide-react';

// Avisa quando algum paciente faz aniversário hoje — retenção simples: um lembrete
// carinhoso custa pouco e ajuda a manter o vínculo. Sempre ativo (App.tsx), uma vez por
// dia, mesmo princípio dos outros avisos proativos (backup, falta, validade).
export default function BirthdayAlert({ user, isAdminUser }: { user: User; isAdminUser: boolean }) {
  const [birthdayPatients, setBirthdayPatients] = useState<Patient[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const checkedTodayRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAdminUser) return;
    const unsubscribe = onSnapshot(collection(db, 'patients'), (snap) => {
      const todayStr = new Date().toISOString().split('T')[0];
      if (checkedTodayRef.current === todayStr) return;
      checkedTodayRef.current = todayStr;

      const today = new Date();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();

      const patients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
      const matches = patients.filter(p => {
        if (!p.birthDate) return false;
        // birthDate guardado como "AAAA-MM-DD" — compara só mês e dia, ignorando o ano
        const [, month, day] = p.birthDate.split('-').map(Number);
        return month === todayMonth && day === todayDay;
      });
      if (matches.length > 0) setBirthdayPatients(matches);
    });
    return () => unsubscribe();
  }, [isAdminUser]);

  const dismissOne = (id: string) => setBirthdayPatients(prev => prev.filter(p => p.id !== id));

  const handleCongratulate = (patient: Patient) => {
    if (!patient.phone) {
      dismissOne(patient.id!);
      return;
    }
    const firstName = patient.name.split(' ')[0];
    const message = `Feliz aniversário, ${firstName}! 🎉 A equipe deseja um dia repleto de alegria — muito obrigada por fazer parte da nossa história!`;
    openWhatsApp(patient.phone, message);
    dismissOne(patient.id!);
  };

  if (birthdayPatients.length === 0 || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-6 z-40 max-w-sm bg-white rounded-[28px] border border-[#F5F2F0] shadow-xl p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-10 h-10 bg-[#F0F7F0] rounded-2xl flex items-center justify-center text-[#8BA888] shrink-0">
            <Gift size={18} />
          </div>
          <button onClick={() => setDismissed(true)} className="text-[#9CA3AF] hover:text-[#4A433D]">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[#4A433D] font-medium mb-3">
          {birthdayPatients.length === 1 ? 'Aniversário hoje!' : `${birthdayPatients.length} aniversariantes hoje!`}
        </p>
        <div className="space-y-2">
          {birthdayPatients.slice(0, 4).map(patient => (
            <button
              key={patient.id}
              onClick={() => handleCongratulate(patient)}
              className="w-full flex items-center justify-between py-3 px-4 bg-[#FDFBF9] rounded-2xl text-xs font-medium text-[#4A433D] hover:bg-[#F5F2F0] transition-all"
            >
              {patient.name}
              <MessageCircle size={14} className="text-[#8BA888]" />
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
