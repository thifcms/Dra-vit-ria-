import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth, signInAnonymousPortal } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, FileText, Receipt, LogOut, Lock, Clock, CheckCircle2, KeyRound, Gift, CalendarPlus, Download } from 'lucide-react';
import { getClinicOwnerId, phoneIndexKey, cpfIndexKey } from '../lib/slots';
import { hashPin } from '../lib/pin';
import { Patient, Appointment } from '../types';

// Portal do Paciente — login em duas partes:
// 1) CPF + telefone, conferidos de verdade nas REGRAS do banco (não só na tela) — o
//    mesmo mecanismo de antes, criando uma sessão anônima vinculada ao paciente certo.
// 2) Senha — no PRIMEIRO acesso, depois do CPF/telefone passarem, pede pra criar uma
//    senha (guardada como hash, nunca em texto puro). Nos acessos seguintes, depois de
//    CPF+telefone baterem de novo, pede a senha já cadastrada em vez de deixar entrar
//    direto — segurança adicional, já que só CPF+telefone sozinhos são informações
//    relativamente fáceis de alguém mais próximo do paciente conhecer.
export default function PatientPortal() {
  const [authReady, setAuthReady] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'appointments' | 'documents' | 'budgets' | 'promotions'>('appointments');
  const [promotions, setPromotions] = useState<{ id: string; message: string; expiresAt: string }[]>([]);
  const [pendingRatingAppointment, setPendingRatingAppointment] = useState<Appointment | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  // 'cpfPhone': tela inicial | 'setPassword': primeiro acesso, criando senha |
  // 'enterPassword': acessos seguintes, digitando a senha já cadastrada
  const [step, setStep] = useState<'cpfPhone' | 'setPassword' | 'enterPassword'>('cpfPhone');
  const [pendingPatientId, setPendingPatientId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Já tem sessão de portal válida guardada nesse uid (dispositivo já passou por
        // CPF+telefone+senha antes)? Carrega direto — assim o paciente não precisa
        // digitar tudo de novo toda vez que abrir no MESMO celular/navegador.
        try {
          const sessionSnap = await getDoc(doc(db, 'portalSessions', u.uid));
          if (sessionSnap.exists()) {
            await loadPatientData(sessionSnap.data().patientId);
          }
        } catch { /* sessão não existe ainda, ou não é válida — mostra o login normal */ }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const loadPatientData = async (patientId: string) => {
    const patientSnap = await getDoc(doc(db, 'patients', patientId));
    if (!patientSnap.exists()) return;
    setPatient({ id: patientSnap.id, ...patientSnap.data() } as Patient);

    const q = query(collection(db, 'appointments'), where('patientId', '==', patientId));
    const apptSnap = await getDocs(q);
    const today = new Date().toISOString().split('T')[0];
    const allAppts = apptSnap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
    const upcoming = allAppts
      .filter(a => a.date >= today && a.status !== 'cancelled')
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    setAppointments(upcoming);

    // Atendimento concluído recentemente (últimos 14 dias) que ainda não foi avaliado —
    // pede a avaliação assim que o paciente entra no portal, sem precisar procurar
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const unrated = allAppts
      .filter(a => a.status === 'completed' && !a.rating && a.date >= fourteenDaysAgo)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    setPendingRatingAppointment(unrated[0] || null);

    // Promoções ainda dentro do prazo — as vencidas simplesmente não aparecem mais,
    // sem precisar de nenhuma limpeza manual (a comparação de data já resolve isso)
    try {
      const promoSnap = await getDocs(collection(db, 'promotions'));
      const nowIso = new Date().toISOString();
      const active = promoSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as { id: string; message: string; expiresAt: string }))
        .filter(p => p.expiresAt > nowIso)
        .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
      setPromotions(active);
    } catch { /* melhor esforço — promoções não são essenciais pro resto do portal funcionar */ }
  };

  const handleLogin = async () => {
    if (!cpf.trim() || !phone.trim()) {
      setLoginError('Preencha CPF e telefone.');
      return;
    }
    setLoggingIn(true);
    setLoginError('');
    try {
      const ownerId = await getClinicOwnerId(db);
      const cpfKey = cpfIndexKey(ownerId, cpf);
      const phoneKey = phoneIndexKey(ownerId, phone);

      // Descobre o patientId a partir do CPF — o índice é público pra leitura (mesmo
      // mecanismo já usado no agendamento online)
      const cpfIndexSnap = await getDoc(doc(db, 'patientCpfIndex', cpfKey));
      if (!cpfIndexSnap.exists()) {
        setLoginError('CPF ou telefone não encontrados. Confira os dados ou fale com a clínica.');
        setLoggingIn(false);
        return;
      }
      const patientId = cpfIndexSnap.data().patientId;

      // Entra anonimamente (só pra ter um uid) — separado num try próprio porque, se o
      // provedor "Anônimo" ainda não estiver habilitado no Firebase, o erro daqui é bem
      // diferente de "CPF/telefone errados", e mostrar a mensagem errada só confundiria
      let cred;
      try {
        cred = auth.currentUser || (await signInAnonymousPortal()).user;
      } catch (authErr: any) {
        console.error('Erro ao autenticar no portal:', authErr);
        setLoginError('O portal ainda não está configurado — peça pra clínica habilitar o login anônimo no Firebase.');
        setLoggingIn(false);
        return;
      }

      // Tenta criar a sessão do portal — a REGRA do banco confere se o telefone
      // TAMBÉM aponta pro mesmo paciente antes de permitir; se não bater, a escrita é
      // recusada e cai no catch abaixo
      await setDoc(doc(db, 'portalSessions', cred.uid), { patientId, cpfKey, phoneKey });

      // CPF+telefone confirmados — agora decide se é primeiro acesso (pede pra criar
      // senha) ou se já existe conta (pede a senha já cadastrada)
      const accountSnap = await getDoc(doc(db, 'portalAccounts', patientId));
      setPendingPatientId(patientId);
      setStep(accountSnap.exists() ? 'enterPassword' : 'setPassword');
    } catch (err: any) {
      console.error('Erro no login do portal:', err);
      if (err?.code === 'permission-denied') {
        setLoginError('Telefone não confere com o CPF informado, ou o portal ainda não está totalmente configurado. Confira os dados ou fale com a clínica.');
      } else {
        setLoginError(`Não foi possível entrar agora: ${err?.code || err?.message || 'erro desconhecido'}`);
      }
    }
    setLoggingIn(false);
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 6) {
      setLoginError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLoginError('As senhas não são iguais.');
      return;
    }
    if (!pendingPatientId) return;
    setLoggingIn(true);
    setLoginError('');
    try {
      const passwordHash = await hashPin(newPassword);
      await setDoc(doc(db, 'portalAccounts', pendingPatientId), { passwordHash, createdAt: new Date().toISOString() });
      await loadPatientData(pendingPatientId);
    } catch (err) {
      setLoginError('Não foi possível criar a senha agora — tente novamente.');
    }
    setLoggingIn(false);
  };

  const handleEnterPassword = async () => {
    if (!password.trim() || !pendingPatientId) {
      setLoginError('Digite sua senha.');
      return;
    }
    setLoggingIn(true);
    setLoginError('');
    try {
      const accountSnap = await getDoc(doc(db, 'portalAccounts', pendingPatientId));
      const storedHash = accountSnap.exists() ? accountSnap.data().passwordHash : null;
      const enteredHash = await hashPin(password);
      if (storedHash && storedHash === enteredHash) {
        await loadPatientData(pendingPatientId);
      } else {
        setLoginError('Senha incorreta.');
      }
    } catch (err) {
      setLoginError('Não foi possível conferir a senha agora — tente novamente.');
    }
    setLoggingIn(false);
  };

  // "Baixar Meus Dados" — direito de acesso/portabilidade garantido pela LGPD. Reaproveita
  // a mesma geração de PDF já usada no backup de prontuários da equipe (patientPdf.ts),
  // agora disponível pro próprio paciente. Importante: isso é só DOWNLOAD — não existe
  // botão de apagar os dados aqui, já que o prontuário clínico precisa ficar guardado
  // por 20 anos por exigência do CFM, mesmo que o paciente peça exclusão.
  const [downloadingData, setDownloadingData] = useState(false);
  const handleSubmitRating = async () => {
    if (!pendingRatingAppointment || ratingValue === 0) return;
    setSubmittingRating(true);
    try {
      await updateDoc(doc(db, 'appointments', pendingRatingAppointment.id!), {
        rating: ratingValue,
        ratingComment: ratingComment.trim() || undefined,
        ratedAt: new Date().toISOString(),
      });
      setPendingRatingAppointment(null);
    } catch (err) {
      console.error('Erro ao enviar avaliação:', err);
    }
    setSubmittingRating(false);
  };

  const handleDownloadMyData = async () => {
    if (!patient) return;
    setDownloadingData(true);
    try {
      const ownerId = await getClinicOwnerId(db);
      const settingsSnap = await getDoc(doc(db, 'settings', ownerId));
      const clinicSettings = settingsSnap.exists() ? settingsSnap.data() : null;
      const { generatePatientPdf, patientPdfFileName } = await import('../lib/patientPdf');
      const blob = await generatePatientPdf(patient, clinicSettings as any);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = patientPdfFileName(patient);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao gerar PDF dos dados do paciente:', err);
    }
    setDownloadingData(false);
  };

  const handleLogout = async () => {
    try {
      if (auth.currentUser) await deleteDoc(doc(db, 'portalSessions', auth.currentUser.uid));
      await signOut(auth);
    } catch { /* melhor esforço */ }
    setPatient(null);
    setAppointments([]);
    setCpf('');
    setPhone('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPendingPatientId(null);
    setStep('cpfPhone');
    setLoginError('');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center">
        <p className="text-[#9CA3AF] text-sm">Carregando...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-[#FDFBF9] flex flex-col items-center relative overflow-hidden">
        <PortalWatermark />
        <div className="w-full flex justify-center pt-10 pb-4 relative z-10">
          <img src="/logo/logo-full-v3.png" alt="Dra. Vitória Oliveira" className="h-16 w-auto object-contain" />
        </div>
        <div className="flex-1 w-full flex items-center justify-center p-6 relative z-10">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[40px] shadow-lg p-10 max-w-sm w-full"
        >
          <div className="w-14 h-14 bg-[#F0F7F0] rounded-2xl flex items-center justify-center text-[#8BA888] mb-6">
            {step === 'cpfPhone' ? <Lock size={24} /> : <KeyRound size={24} />}
          </div>

          {step === 'cpfPhone' && (
            <>
              <h1 className="serif text-2xl text-[#4A433D] mb-2">Portal do Paciente</h1>
              <p className="text-xs text-[#9CA3AF] font-light mb-8">
                Entre com seu CPF e telefone cadastrados na clínica.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 block ml-1">CPF</label>
                  <input
                    value={cpf}
                    onChange={e => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 text-sm outline-none focus:border-[#8BA888]/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 block ml-1">Telefone</label>
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 text-sm outline-none focus:border-[#8BA888]/40 transition-all"
                  />
                </div>
              </div>
              {loginError && <p className="text-xs text-red-500 mt-4">{loginError}</p>}
              <button
                onClick={handleLogin}
                disabled={loggingIn}
                className="w-full mt-6 py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all disabled:opacity-50"
              >
                {loggingIn ? 'Verificando...' : 'Continuar'}
              </button>
            </>
          )}

          {step === 'setPassword' && (
            <>
              <h1 className="serif text-2xl text-[#4A433D] mb-2">Crie sua senha</h1>
              <p className="text-xs text-[#9CA3AF] font-light mb-8">
                É seu primeiro acesso. Crie uma senha — vai usar ela junto com CPF e telefone nas próximas vezes.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 block ml-1">Nova senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Pelo menos 6 caracteres"
                    className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 text-sm outline-none focus:border-[#8BA888]/40 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 block ml-1">Confirmar senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Digite de novo"
                    className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 text-sm outline-none focus:border-[#8BA888]/40 transition-all"
                  />
                </div>
              </div>
              {loginError && <p className="text-xs text-red-500 mt-4">{loginError}</p>}
              <button
                onClick={handleSetPassword}
                disabled={loggingIn}
                className="w-full mt-6 py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all disabled:opacity-50"
              >
                {loggingIn ? 'Criando...' : 'Criar Senha e Entrar'}
              </button>
            </>
          )}

          {step === 'enterPassword' && (
            <>
              <h1 className="serif text-2xl text-[#4A433D] mb-2">Digite sua senha</h1>
              <p className="text-xs text-[#9CA3AF] font-light mb-8">
                CPF e telefone confirmados — agora sua senha pra concluir.
              </p>
              <div>
                <label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 block ml-1">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  autoFocus
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 text-sm outline-none focus:border-[#8BA888]/40 transition-all"
                />
              </div>
              {loginError && <p className="text-xs text-red-500 mt-4">{loginError}</p>}
              <button
                onClick={handleEnterPassword}
                disabled={loggingIn}
                className="w-full mt-6 py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all disabled:opacity-50"
              >
                {loggingIn ? 'Entrando...' : 'Entrar'}
              </button>
              <button
                onClick={() => { setStep('cpfPhone'); setPassword(''); setLoginError(''); }}
                className="w-full mt-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest"
              >
                Voltar
              </button>
            </>
          )}
        </motion.div>
        </div>
      </div>
    );
  }

  // Anamnese e Evolução ficam de fora da navegação normal do portal (só Termos
  // aparecem em "Documentos") — decisão específica do administrador. O botão "Baixar
  // Meus Dados" continua trazendo o prontuário completo, já que esse é um direito de
  // acesso garantido pela LGPD, diferente de deixar isso navegável dia a dia no portal.
  const signedDocs = [
    ...((patient.consentTerms || []).map((t: any) => ({ type: 'Termo', date: t.signedAt, ...t }))),
  ].sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div className="min-h-screen bg-[#FDFBF9] pb-20 relative overflow-hidden">
      <PortalWatermark />
      <div className="w-full flex justify-center pt-8 pb-2 bg-[#FDFBF9] relative z-10">
        <img src="/logo/logo-full-v3.png" alt="Dra. Vitória Oliveira" className="h-12 w-auto object-contain" />
      </div>
      <div className="bg-white border-b border-[#F5F2F0] p-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Olá,</p>
          <p className="serif text-lg text-[#4A433D]">{patient.name.split(' ')[0]}</p>
        </div>
        <button onClick={handleLogout} className="p-3 text-[#9CA3AF] hover:text-red-400 transition-all">
          <LogOut size={20} />
        </button>
      </div>

      <div className="relative z-10">
      <div className="flex gap-2 p-4 overflow-x-auto">
        <TabBtn active={activeTab === 'appointments'} onClick={() => setActiveTab('appointments')} icon={<Calendar size={16} />} label="Agendamentos" />
        <TabBtn active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={<FileText size={16} />} label="Documentos" />
        <TabBtn active={activeTab === 'budgets'} onClick={() => setActiveTab('budgets')} icon={<Receipt size={16} />} label="Orçamentos" />
        {promotions.length > 0 && (
          <TabBtn active={activeTab === 'promotions'} onClick={() => setActiveTab('promotions')} icon={<Gift size={16} />} label={`Promoções (${promotions.length})`} />
        )}
      </div>

      <div className="px-4">
        <a
          href="#agendar"
          className="w-full flex items-center justify-center gap-2 py-4 bg-[#4A433D] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#5C544E] transition-all"
        >
          <CalendarPlus size={16} /> Agende Nova Consulta
        </a>
        <button
          onClick={handleDownloadMyData}
          disabled={downloadingData}
          className="w-full flex items-center justify-center gap-2 py-3 mt-3 text-[#9CA3AF] hover:text-[#4A433D] font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
        >
          <Download size={14} /> {downloadingData ? 'Gerando...' : 'Baixar Meus Dados'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        {activeTab === 'appointments' && (
          appointments.length === 0 ? (
            <EmptyState text="Nenhum agendamento futuro." />
          ) : (
            appointments.map(a => (
              <div key={a.id} className="bg-white rounded-3xl border border-[#F5F2F0] p-6">
                <p className="text-[10px] font-bold text-[#8BA888] uppercase tracking-widest mb-1">
                  {new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="serif text-xl text-[#4A433D]">{a.time}</p>
                {a.notes && <p className="text-xs text-[#9CA3AF] mt-1">{a.notes}</p>}
              </div>
            ))
          )
        )}

        {activeTab === 'documents' && (
          signedDocs.length === 0 ? (
            <EmptyState text="Nenhum documento assinado ainda." />
          ) : (
            signedDocs.map((d: any, i: number) => (
              <div key={i} className="bg-white rounded-3xl border border-[#F5F2F0] p-6 flex items-center gap-4">
                <div className="w-10 h-10 bg-[#F0F7F0] rounded-2xl flex items-center justify-center text-[#8BA888] shrink-0">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#4A433D]">{d.type}</p>
                  <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">
                    {d.date ? new Date(d.date).toLocaleDateString('pt-BR') : ''}
                  </p>
                </div>
              </div>
            ))
          )
        )}

        {activeTab === 'budgets' && (
          (patient.budgetHistory || []).length === 0 ? (
            <EmptyState text="Nenhum orçamento no histórico." />
          ) : (
            [...(patient.budgetHistory || [])].reverse().map((b: any) => (
              <div key={b.id} className="bg-white rounded-3xl border border-[#F5F2F0] p-6">
                <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-1">
                  {b.budgetNumber ? `Orçamento nº ${b.budgetNumber}` : 'Orçamento'}
                </p>
                <p className="serif text-xl text-[#4A433D]">R$ {b.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <p className="text-[10px] text-[#9CA3AF] mt-2">
                  Assinado em {new Date(b.signedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))
          )
        )}

        {activeTab === 'promotions' && (
          promotions.length === 0 ? (
            <EmptyState text="Nenhuma promoção ativa no momento." />
          ) : (
            promotions.map(p => (
              <div key={p.id} className="bg-white rounded-3xl border border-[#8BA888]/30 p-6">
                <p className="text-sm text-[#4A433D] whitespace-pre-wrap">{p.message.replace(/\{nome\}/g, patient.name.split(' ')[0])}</p>
                <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-4">
                  Válida até {new Date(p.expiresAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))
          )
        )}
      </div>
      </div>

      <AnimatePresence>
        {pendingRatingAppointment && (
          <div className="fixed inset-0 bg-[#4A433D]/30 backdrop-blur-md z-[70] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white/85 backdrop-blur-xl rounded-[32px] p-8 max-w-sm w-full"
            >
              <p className="serif text-xl text-[#4A433D] mb-2">Como foi seu atendimento?</p>
              <p className="text-xs text-[#9CA3AF] font-light mb-6">
                {pendingRatingAppointment.notes || 'Sua última consulta'} — {new Date(pendingRatingAppointment.date + 'T00:00:00').toLocaleDateString('pt-BR')}
              </p>
              <div className="flex justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setRatingValue(n)} className="text-3xl transition-all" style={{ opacity: n <= ratingValue ? 1 : 0.25 }}>
                    ⭐
                  </button>
                ))}
              </div>
              <textarea
                value={ratingComment}
                onChange={e => setRatingComment(e.target.value)}
                placeholder="Quer contar mais alguma coisa? (opcional)"
                rows={3}
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 text-sm outline-none focus:border-[#8BA888]/40 transition-all resize-none mb-4"
              />
              <button
                onClick={handleSubmitRating}
                disabled={ratingValue === 0 || submittingRating}
                className="w-full py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all disabled:opacity-50"
              >
                {submittingRating ? 'Enviando...' : 'Enviar Avaliação'}
              </button>
              <button
                onClick={() => setPendingRatingAppointment(null)}
                className="w-full mt-3 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest"
              >
                Agora não
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${
        active ? 'bg-[#8BA888] text-white shadow-sm' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0]'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-16 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-white/50">
      {text}
    </div>
  );
}

// Marca d'água grande e bem clara do logo, ocupando quase a página toda, centralizada
// verticalmente na tela — mesmo princípio visual já usado nos documentos impressos do
// app (buildLetterheadHtml). Fica atrás de tudo (baixa opacidade + pointer-events: none,
// não atrapalha clique em nada) e nunca sobrepõe o logo do topo porque esse fica dentro
// de uma barra com fundo sólido (bg-[#FDFBF9]), que cobre visualmente qualquer parte da
// marca d'água que passe por trás dela.
function PortalWatermark() {
  return (
    <img
      src="/logo/logo-mark-v3.png"
      alt=""
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] max-w-[600px] opacity-[0.06] pointer-events-none select-none z-0"
    />
  );
}
