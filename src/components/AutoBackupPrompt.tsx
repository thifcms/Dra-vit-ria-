import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Patient, ClinicSettings } from '../types';
import { getClinicOwnerId } from '../lib/slots';
import { buildFullBackupBlob, buildPatientsZipBlob, downloadBlob, CLINIC_GOOGLE_ACCOUNT } from '../lib/backupBuilders';
import { uploadToGoogleDrive } from '../lib/googleDrive';
import { showToast } from '../lib/toast';
import { motion, AnimatePresence } from 'motion/react';
import { Cloud, X, CheckCircle2, Loader2 } from 'lucide-react';

// Não existe como um app estático (sem servidor próprio) rodar algo sozinho à meia-noite
// sem ninguém com a tela aberta — isso vale tanto pra baixar o arquivo quanto pra
// autorizar o Google Drive, que sempre exige clique humano por segurança. O jeito viável
// de aproximar disso é checar, toda vez que um administrador usa o app, se: (1) hoje já
// teve atendimento, (2) todos os atendimentos de hoje já estão concluídos ou cancelados
// (ou seja, o último foi finalizado — não sobrou nenhum ainda pendente/agendado), e
// (3) o backup de hoje ainda não foi feito. Se as três forem verdade, mostra um aviso
// simples pedindo só um clique pra disparar os dois backups de uma vez (Completo + Só
// Prontuários), local e Drive.
export default function AutoBackupPrompt({ user, isAdminUser }: { user: User; isAdminUser: boolean }) {
  const [shouldShow, setShouldShow] = useState(false);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [running, setRunning] = useState(false);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);

  useEffect(() => {
    if (!isAdminUser) return;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
        const todayStr = new Date().toISOString().split('T')[0];

        // Já foi feito hoje? Se sim, nem precisa ficar de olho no resto
        const lastBackupSnap = await getDoc(doc(db, 'system', 'lastAutoBackup'));
        if (lastBackupSnap.exists() && lastBackupSnap.data().date === todayStr) return;

        const settingsSnap = await getDoc(doc(db, 'settings', ownerId));
        const settings = settingsSnap.exists() ? (settingsSnap.data() as ClinicSettings) : null;
        setClinicSettings(settings);

        // onSnapshot (não getDocs) pra reagir na hora se o app já estiver aberto quando
        // o último atendimento do dia for marcado como concluído — sem precisar fechar
        // e abrir o app de novo pra ver o aviso aparecer.
        const q = query(collection(db, 'appointments'), where('date', '==', todayStr));
        unsubscribe = onSnapshot(q, snap => {
          if (snap.empty) { setShouldShow(false); return; } // sem atendimento hoje ainda
          const stillPending = snap.docs.some(d => {
            const status = d.data().status;
            return status !== 'completed' && status !== 'cancelled';
          });
          setShouldShow(!stillPending);
        });
      } catch { /* melhor esforço — não trava o resto do app se essa checagem falhar */ }
    })();
    return () => unsubscribe?.();
  }, [isAdminUser]);

  const handleRunBackup = async () => {
    setRunning(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const patientsSnap = await getDocs(collection(db, 'patients'));
      const patients = patientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));

      const full = await buildFullBackupBlob(user.uid);
      const zip = await buildPatientsZipBlob(patients, clinicSettings);
      downloadBlob(full.blob, full.filename);
      downloadBlob(zip.blob, zip.filename);

      if (clinicSettings?.googleDriveClientId) {
        await uploadToGoogleDrive(full.blob, full.filename, clinicSettings.googleDriveClientId, CLINIC_GOOGLE_ACCOUNT).catch(() =>
          showToast('Backup local ok, mas falhou o envio do Backup Completo ao Drive', 'error')
        );
        await uploadToGoogleDrive(zip.blob, zip.filename, clinicSettings.googleDriveClientId, CLINIC_GOOGLE_ACCOUNT).catch(() =>
          showToast('Backup local ok, mas falhou o envio dos Prontuários ao Drive', 'error')
        );
      }

      await setDoc(doc(db, 'system', 'lastAutoBackup'), {
        date: new Date().toISOString().split('T')[0],
        doneAt: new Date().toISOString(),
        doneBy: user.email,
      });
      showToast('Backup do dia concluído');
      setShouldShow(false);
    } catch (err) {
      showToast('Erro ao gerar o backup do dia — tente de novo em Configurações → Gestão', 'error');
    }
    setRunning(false);
  };

  if (!shouldShow || dismissedThisSession) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 right-6 z-40 max-w-sm bg-white rounded-[28px] border border-[#F5F2F0] shadow-xl p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-10 h-10 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4] shrink-0">
            <Cloud size={18} />
          </div>
          <button onClick={() => setDismissedThisSession(true)} className="text-[#9CA3AF] hover:text-[#4A433D]">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[#4A433D] font-medium mb-1">Backup do dia</p>
        <p className="text-xs text-[#9CA3AF] font-light mb-5">
          Houve atendimento hoje e o backup ainda não foi feito. Fazer agora (Completo + Prontuários, local e
          Google Drive se configurado)?
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setDismissedThisSession(true)}
            disabled={running}
            className="flex-1 py-3 text-[#9CA3AF] font-bold text-[10px] uppercase tracking-widest"
          >
            Agora Não
          </button>
          <button
            onClick={handleRunBackup}
            disabled={running}
            className="flex-1 py-3 bg-[#4A433D] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#5C544E] transition-all disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {running ? 'Fazendo...' : 'Fazer Backup'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
