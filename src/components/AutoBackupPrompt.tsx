import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Patient, ClinicSettings } from '../types';
import { getClinicOwnerId } from '../lib/slots';
import { buildFullBackupBlob, buildPatientsZipBlob, uploadToFirebaseStorage, CLINIC_GOOGLE_ACCOUNT } from '../lib/backupBuilders';
import { uploadToGoogleDrive } from '../lib/googleDrive';
import { showToast } from '../lib/toast';
import { motion, AnimatePresence } from 'motion/react';
import { Cloud, X, CheckCircle2, Loader2 } from 'lucide-react';

// Backup automático de fim de dia — só roda se "Backup em Nuvem" estiver ativo em
// Configurações. Não existe como um app estático (sem servidor próprio) rodar algo
// sozinho à meia-noite sem ninguém com a tela aberta — mas dá pra aproximar bastante:
//
// - O envio pro Firebase Storage é 100% automático e silencioso, sem nenhum clique — quem
//   está usando o app já está autenticado, então isso acontece sozinho assim que o último
//   atendimento do dia é marcado como concluído (ou, se ninguém estiver com o app aberto
//   nesse momento, na próxima vez que alguém abrir o app naquele mesmo dia).
// - O envio pro Google Drive é a ÚNICA parte que não dá pra automatizar de verdade — o
//   Google exige um clique humano por segurança (bloqueio de pop-up), não tem contorno
//   possível de um app sem servidor. Por isso aparece um aviso mínimo só pra essa parte.
// - Nunca baixa nada no computador — isso só acontece se alguém for em Configurações e
//   clicar manualmente nos botões de backup.
export default function AutoBackupPrompt({ user, isAdminUser }: { user: User; isAdminUser: boolean }) {
  const [needsDriveClick, setNeedsDriveClick] = useState(false);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const [running, setRunning] = useState(false);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const firebasePartTriedRef = useRef(false);

  useEffect(() => {
    if (!isAdminUser) return;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
        const settingsSnap = await getDoc(doc(db, 'settings', ownerId));
        const settings = settingsSnap.exists() ? (settingsSnap.data() as ClinicSettings) : null;
        setClinicSettings(settings);

        // Interruptor desligado — nem fica de olho em nada
        if (!settings?.cloudBackupEnabled) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const lastBackupSnap = await getDoc(doc(db, 'system', 'lastAutoBackup'));
        const lastBackupData = lastBackupSnap.exists() ? lastBackupSnap.data() : null;
        const alreadyDoneToday = lastBackupData?.date === todayStr;
        const firebaseAlreadyDone = alreadyDoneToday && lastBackupData?.firebaseDone;
        const driveAlreadyDone = alreadyDoneToday && lastBackupData?.driveDone;

        if (firebaseAlreadyDone && (driveAlreadyDone || !settings?.googleDriveClientId)) return; // nada pendente hoje

        // onSnapshot pra reagir na hora se o app já estiver aberto quando o último
        // atendimento do dia for marcado como concluído
        const q = query(collection(db, 'appointments'), where('date', '==', todayStr));
        unsubscribe = onSnapshot(q, async snap => {
          if (snap.empty) return; // sem atendimento hoje ainda
          const stillPending = snap.docs.some(d => {
            const status = d.data().status;
            return status !== 'completed' && status !== 'cancelled' && status !== 'no_show';
          });
          if (stillPending) return; // ainda não é o último

          // Parte silenciosa: sobe pro Firebase Storage sozinho, sem pedir nada — só
          // tenta uma vez por carregamento da página, pra não ficar repetindo à toa se
          // o listener disparar de novo por outro motivo
          if (!firebaseAlreadyDone && !firebasePartTriedRef.current) {
            firebasePartTriedRef.current = true;
            try {
              const patientsSnap = await import('firebase/firestore').then(m => m.getDocs(collection(db, 'patients')));
              const patients = patientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
              const full = await buildFullBackupBlob(user.uid);
              const zip = await buildPatientsZipBlob(patients, settings);
              await uploadToFirebaseStorage(full.blob, full.filename);
              await uploadToFirebaseStorage(zip.blob, zip.filename);
              await setDoc(doc(db, 'system', 'lastAutoBackup'), {
                date: todayStr,
                firebaseDone: true,
                driveDone: driveAlreadyDone || false,
                doneAt: new Date().toISOString(),
                doneBy: user.email,
              }, { merge: true });
            } catch { /* melhor esforço — o backup manual em Configurações continua disponível */ }
          }

          // Parte que precisa de clique: só mostra se o Drive estiver configurado e
          // ainda não tiver sido feito hoje
          if (settings?.googleDriveClientId && !driveAlreadyDone) {
            setNeedsDriveClick(true);
          }
        });
      } catch { /* melhor esforço — não trava o resto do app se essa checagem falhar */ }
    })();
    return () => unsubscribe?.();
  }, [isAdminUser]);

  const handleSendToDrive = async () => {
    setRunning(true);
    try {
      const patientsSnap = await import('firebase/firestore').then(m => m.getDocs(collection(db, 'patients')));
      const patients = patientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
      const full = await buildFullBackupBlob(user.uid);
      const zip = await buildPatientsZipBlob(patients, clinicSettings);

      await uploadToGoogleDrive(full.blob, full.filename, clinicSettings!.googleDriveClientId!, CLINIC_GOOGLE_ACCOUNT);
      await uploadToGoogleDrive(zip.blob, zip.filename, clinicSettings!.googleDriveClientId!, CLINIC_GOOGLE_ACCOUNT);

      await setDoc(doc(db, 'system', 'lastAutoBackup'), {
        date: new Date().toISOString().split('T')[0],
        driveDone: true,
        doneAt: new Date().toISOString(),
        doneBy: user.email,
      }, { merge: true });
      showToast('Backup do dia enviado ao Google Drive');
      setNeedsDriveClick(false);
    } catch (err) {
      showToast('Erro ao enviar ao Drive — tente de novo em Configurações → Gestão', 'error');
    }
    setRunning(false);
  };

  if (!needsDriveClick || dismissedThisSession) return null;

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
        <p className="text-sm text-[#4A433D] font-medium mb-1">Backup do dia — falta só o Drive</p>
        <p className="text-xs text-[#9CA3AF] font-light mb-5">
          Já salvo no Firebase automaticamente. O Google exige um clique humano por segurança pra autorizar o
          envio ao Drive — não dá pra pular essa etapa.
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
            onClick={handleSendToDrive}
            disabled={running}
            className="flex-1 py-3 bg-[#4A433D] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#5C544E] transition-all disabled:opacity-50"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {running ? 'Enviando...' : 'Enviar ao Drive'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
