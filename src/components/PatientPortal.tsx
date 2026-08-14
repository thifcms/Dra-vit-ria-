import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth, signInAnonymousPortal } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, FileText, Receipt, LogOut, Lock, Clock, CheckCircle2 } from 'lucide-react';
import { getClinicOwnerId, phoneIndexKey, cpfIndexKey } from '../lib/slots';
import { Patient, Appointment } from '../types';

// Portal do Paciente — entra com CPF + telefone (sem senha nem SMS, por decisão do
// administrador: mais simples, com menos segurança do que um login por SMS teria).
// A autenticação de verdade acontece de forma anônima no Firebase (só pra ter um uid
// válido) — a checagem real de "esse CPF e esse telefone são realmente do mesmo
// paciente" acontece nas REGRAS do banco (portalSessions), não só na tela, então não
// dá pra burlar direto pelo navegador.
export default function PatientPortal() {
  const [authReady, setAuthReady] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'appointments' | 'documents' | 'budgets'>('appointments');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Já tem sessão de portal válida guardada nesse uid? Carrega direto, sem pedir
        // CPF/telefone de novo — assim o paciente não precisa logar toda vez que abrir
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
    const upcoming = apptSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Appointment))
      .filter(a => a.date >= today && a.status !== 'cancelled')
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    setAppointments(upcoming);
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

      // Entra anonimamente (só pra ter um uid) e tenta criar a sessão do portal — a
      // REGRA do banco confere se o telefone TAMBÉM aponta pro mesmo paciente antes de
      // permitir; se não bater, a escrita é recusada e cai no catch abaixo
      const cred = auth.currentUser || (await signInAnonymousPortal()).user;
      await setDoc(doc(db, 'portalSessions', cred.uid), { patientId, cpfKey, phoneKey });

      await loadPatientData(patientId);
    } catch (err: any) {
      console.error('Erro no login do portal:', err);
      if (err?.code === 'permission-denied') {
        setLoginError('CPF ou telefone não encontrados. Confira os dados ou fale com a clínica.');
      } else {
        setLoginError('Não foi possível entrar agora — tente novamente em instantes.');
      }
    }
    setLoggingIn(false);
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
      <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[40px] shadow-lg p-10 max-w-sm w-full"
        >
          <div className="w-14 h-14 bg-[#F0F7F0] rounded-2xl flex items-center justify-center text-[#8BA888] mb-6">
            <Lock size={24} />
          </div>
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
            {loggingIn ? 'Entrando...' : 'Entrar'}
          </button>
        </motion.div>
      </div>
    );
  }

  const signedDocs = [
    ...((patient.anamnesisHistory || []).filter((h: any) => h.signatureUrl).map((h: any) => ({ type: 'Anamnese', date: h.releasedAt || h.date, ...h }))),
    ...((patient.consentTerms || []).map((t: any) => ({ type: 'Termo', date: t.signedAt, ...t }))),
  ].sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div className="min-h-screen bg-[#FDFBF9] pb-20">
      <div className="bg-white border-b border-[#F5F2F0] p-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Olá,</p>
          <p className="serif text-lg text-[#4A433D]">{patient.name.split(' ')[0]}</p>
        </div>
        <button onClick={handleLogout} className="p-3 text-[#9CA3AF] hover:text-red-400 transition-all">
          <LogOut size={20} />
        </button>
      </div>

      <div className="flex gap-2 p-4 overflow-x-auto">
        <TabBtn active={activeTab === 'appointments'} onClick={() => setActiveTab('appointments')} icon={<Calendar size={16} />} label="Agendamentos" />
        <TabBtn active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={<FileText size={16} />} label="Documentos" />
        <TabBtn active={activeTab === 'budgets'} onClick={() => setActiveTab('budgets')} icon={<Receipt size={16} />} label="Orçamentos" />
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
                {a.procedure && <p className="text-xs text-[#9CA3AF] mt-1">{a.procedure}</p>}
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
      </div>
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
