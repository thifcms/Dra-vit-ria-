import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { auth, signInWithGoogle, db } from './lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { ToastHost, showToast } from './lib/toast';
import { hashPin, isValidPinFormat } from './lib/pin';
import { verifyBiometric } from './lib/webauthn';
import { getClinicOwnerId } from './lib/slots';
import type { ClinicSettings, Patient } from './types';
import { 
  Users, 
  Calendar, 
  Package, 
  BarChart3, 
  Settings as SettingsIcon, 
  LogOut, 
  LayoutDashboard,
  MoreVertical,
  X,
  Search,
  User as UserIcon,
  Fingerprint,
  CreditCard,
  ArrowLeft
} from 'lucide-react';

// Views — carregadas sob demanda (code-splitting), só a tela ativa entra no bundle inicial
const Dashboard = lazy(() => import('./components/Dashboard'));
const Patients = lazy(() => import('./components/Patients'));
const Schedule = lazy(() => import('./components/Schedule'));
const Inventory = lazy(() => import('./components/Inventory'));
const Finance = lazy(() => import('./components/Finance'));
const Settings = lazy(() => import('./components/Settings'));
const PublicBooking = lazy(() => import('./components/PublicBooking'));
const CheckIn = lazy(() => import('./components/CheckIn'));
const Cancel = lazy(() => import('./components/Cancel'));
const ComingSoon = lazy(() => import('./components/ComingSoon'));

type View = 'dashboard' | 'patients' | 'schedule' | 'inventory' | 'finance' | 'settings';

export default function App() {
  // Páginas públicas — sem login, acessíveis de qualquer link externo.
  // Ficam num componente separado pra não misturar hooks condicionais com o resto do app.
  // Guardado em estado (não só lido direto de window.location) e atualizado pelo evento
  // hashchange — sem isso, trocar de #agendar pra fora dele não atualizava a tela sozinho,
  // ficando presa na página de agendamento até fechar e abrir o app de novo.
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (hash.startsWith('#agendar')) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <PublicBooking />
      </Suspense>
    );
  }
  if (hash.startsWith('#checkin')) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <CheckIn />
      </Suspense>
    );
  }
  if (hash.startsWith('#cancelar')) {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <Cancel />
      </Suspense>
    );
  }
  if (hash.startsWith('#app')) {
    return <AuthenticatedApp />;
  }
  return (
    <Suspense fallback={<ViewLoadingFallback />}>
      <ComingSoon />
    </Suspense>
  );
}

// Transição de fade sutil, usada tanto entre a abertura → login → app quanto entre as
// páginas internas — mantém tudo consistente, sem nenhum movimento, só opacidade.
const PAGE_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.35, ease: 'easeInOut' },
};

function AuthenticatedApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const loading = !authChecked || !minSplashElapsed;
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [jumpToPatientId, setJumpToPatientId] = useState<string | null>(null);

  const professionalName = clinicSettings?.professionalName || user?.displayName || 'Minha Conta';

  const searchResults = useMemo(() => {
    if (!sidebarSearch.trim()) return [];
    const q = sidebarSearch.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.cpf || '').includes(q)).slice(0, 6);
  }, [sidebarSearch, patients]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Confirma que o e-mail está autorizado (como administrador OU como usuário
        // comum) antes de deixar entrar — sem isso, qualquer conta Google conseguiria
        // "se cadastrar" sozinha no sistema.
        try {
          const [adminDoc, staffDoc] = await Promise.all([
            getDoc(doc(db, 'system', 'authorized_admins')),
            getDoc(doc(db, 'system', 'authorized_staff')),
          ]);
          const adminEmails: string[] = adminDoc.exists() ? (adminDoc.data().emails || []) : [];
          const staffEmails: string[] = staffDoc.exists() ? (staffDoc.data().emails || []) : [];
          const allowedEmails = [...adminEmails, ...staffEmails];
          if (!u.email || !allowedEmails.includes(u.email)) {
            await signOut(auth);
            showToast('Este e-mail não tem autorização para acessar o sistema.', 'error');
            setUser(null);
            setAuthChecked(true);
            return;
          }
        } catch {
          // Se a checagem falhar por qualquer motivo (ex: lista ainda não existe), nega
          // por segurança em vez de deixar passar
          await signOut(auth);
          setUser(null);
          setAuthChecked(true);
          return;
        }
      }
      setUser(u);
      setAuthChecked(true);
    });
    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/popup-blocked') {
        showToast('O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo.', 'error');
      } else if (err?.code === 'auth/operation-not-supported-in-this-environment') {
        showToast('Não é possível fazer login dentro deste app. Abra o link no Safari/Chrome direto.', 'error');
      } else if (err?.code && err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        showToast('Não foi possível entrar com o Google. Tente novamente.', 'error');
      }
    }
  };

  useEffect(() => {
    // Segura a tela de abertura por tempo suficiente pra dar pra ver a animação da logo
    // por completo, mesmo quando o Firebase confirma o login quase instantaneamente.
    const timer = setTimeout(() => setMinSplashElapsed(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) { setClinicSettings(null); setPatients([]); return; }
    let unsubSettings = () => {};
    getClinicOwnerId(db).then(ownerId => {
      unsubSettings = onSnapshot(doc(db, 'settings', ownerId), (snap) => {
        if (snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
      });
    }).catch(() => {});

    // Sem filtro por userId — com acesso compartilhado, qualquer administrador autorizado
    // precisa ver todos os pacientes, não só os que ele mesmo cadastrou
    const unsubPatients = onSnapshot(
      collection(db, 'patients'),
      snap => setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)))
    );
    return () => {
      unsubSettings();
      unsubPatients();
    };
  }, [user]);

  // PIN/biometria de segurança extra, além do login do Google — desbloqueado uma vez por
  // sessão (sessionStorage some quando a aba/app fecha, pedindo de novo na próxima abertura)
  const [pinUnlocked, setPinUnlocked] = useState(() => sessionStorage.getItem('pinUnlocked') === 'true');
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState(false);
  const [checkingPin, setCheckingPin] = useState(false);
  const [checkingBiometric, setCheckingBiometric] = useState(false);
  const [biometricFailed, setBiometricFailed] = useState(false);
  const needsPinCheck = !!((clinicSettings?.biometricEnabled && clinicSettings?.pinHash) || clinicSettings?.webauthnCredentialId) && !pinUnlocked;

  // Re-trava automaticamente sempre que a pessoa sai da tela do app (troca de aba, minimiza,
  // bloqueia o celular) — ao voltar, pede PIN/biometria de novo, em vez de continuar
  // desbloqueado só porque ainda é "a mesma sessão" do navegador.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        sessionStorage.removeItem('pinUnlocked');
        setPinUnlocked(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleCheckPin = async () => {
    if (!isValidPinFormat(pinEntry) || !clinicSettings?.pinHash || checkingPin) return;
    setCheckingPin(true);
    const hash = await hashPin(pinEntry);
    if (hash === clinicSettings.pinHash) {
      sessionStorage.setItem('pinUnlocked', 'true');
      setPinUnlocked(true);
    } else {
      setPinError(true);
      setPinEntry('');
      setTimeout(() => setPinError(false), 1500);
    }
    setCheckingPin(false);
  };

  const handleCheckBiometric = async () => {
    if (!clinicSettings?.webauthnCredentialId || checkingBiometric) return;
    setCheckingBiometric(true);
    setBiometricFailed(false);
    const ok = await verifyBiometric(clinicSettings.webauthnCredentialId);
    if (ok) {
      sessionStorage.setItem('pinUnlocked', 'true');
      setPinUnlocked(true);
    } else {
      setBiometricFailed(true);
    }
    setCheckingBiometric(false);
  };

  // Tenta a biometria sozinho assim que a tela aparece, se tiver cadastrada — evita um
  // toque a mais, já que o Face ID/Touch ID tende a aparecer na hora de qualquer jeito
  useEffect(() => {
    if (needsPinCheck && clinicSettings?.webauthnCredentialId) {
      handleCheckBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsPinCheck]);

  const handleForgotPin = async () => {
    if (!user) return;
    // Saída de emergência: desativa a exigência de PIN/biometria direto (sem precisar
    // entrar em Configurações, já que é justamente isso que ficaria trancado). Pra usar
    // de novo nesse celular, é só reativar em Configurações → Segurança.
    const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
    await updateDoc(doc(db, 'settings', ownerId), { biometricEnabled: false, webauthnCredentialId: undefined }).catch(() => {});
    sessionStorage.setItem('pinUnlocked', 'true');
    setPinUnlocked(true);
  };

  return (
    <AnimatePresence mode="wait">
    {loading ? (
      <motion.div key="loading" {...PAGE_FADE} className="h-screen w-screen flex items-center justify-center bg-white">
        <motion.img
          src="/logo/logo-full-v2.png"
          alt="Dra. Vitória Oliveira — Estética Orofacial"
          className="h-24 w-auto object-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 5, ease: 'easeInOut' }}
        />
      </motion.div>
    ) : !user ? (
      <motion.div key="login" {...PAGE_FADE} className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6">
        <div className="w-full max-w-md bg-white p-10 rounded-[32px] shadow-sm border border-[#F5F2F0] text-center">
          <div className="w-20 h-20 bg-[#EADFD4]/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <UserIcon className="text-[#EADFD4] w-10 h-10" />
          </div>
          <h1 className="text-3xl font-light text-[#4A433D] mb-2 serif">Bem-vindo</h1>
          <p className="text-[#9CA3AF] mb-10 font-light italic">Gestão moderna e delicada</p>
          
          <button 
            onClick={handleSignIn}
            className="w-full py-4 px-6 bg-[#EADFD4] text-white rounded-2xl flex items-center justify-center gap-3 hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] font-medium"
          >
            <span className="tracking-wide">Entrar com Google</span>
          </button>
          
          <p className="mt-8 text-xs text-[#9CA3AF] font-light uppercase tracking-[0.2em]">Acesso Seguro & Criptografado</p>
        </div>
        
        <ToastHost />
      </motion.div>
    ) : needsPinCheck ? (
      <motion.div key="pin" {...PAGE_FADE} className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6">
        <motion.div
          animate={pinError ? { x: [0, -10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm bg-white p-10 rounded-[32px] shadow-sm border border-[#F5F2F0] text-center"
        >
          <div className="w-20 h-20 bg-[#EADFD4]/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <UserIcon className="text-[#EADFD4] w-10 h-10" />
          </div>
          <h1 className="text-2xl font-light text-[#4A433D] mb-2 serif">
            {clinicSettings?.webauthnCredentialId ? 'Confirme sua identidade' : 'Digite seu PIN'}
          </h1>
          <p className="text-[#9CA3AF] mb-8 font-light text-sm">Segurança extra pra abrir o app</p>

          {clinicSettings?.webauthnCredentialId && (
            <>
              <button
                onClick={handleCheckBiometric}
                disabled={checkingBiometric}
                className="w-full py-4 px-6 bg-[#EADFD4] text-white rounded-2xl flex items-center justify-center gap-3 hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] font-medium mb-4 disabled:opacity-50"
              >
                <Fingerprint size={20} />
                {checkingBiometric ? 'Verificando...' : 'Usar Face ID / Digital'}
              </button>
              {biometricFailed && (
                <p className="text-xs text-red-400 mb-4">Não reconhecido. Tente de novo ou use o PIN.</p>
              )}
              {clinicSettings?.pinHash && (
                <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mb-4">ou digite o PIN</p>
              )}
            </>
          )}

          {clinicSettings?.pinHash && (
            <>
          <input
            autoFocus={!clinicSettings?.webauthnCredentialId}
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinEntry}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setPinEntry(v);
              if (v.length === 6) setTimeout(() => handleCheckPin(), 50);
            }}
            placeholder="••••••"
            className={`w-full bg-[#FDFBF9] border rounded-2xl p-4 outline-none transition-all font-light text-center tracking-[0.6em] text-2xl mb-4 ${
              pinError ? 'border-red-300' : 'border-[#F1F3F5] focus:border-[#EADFD4]/30'
            }`}
          />
          {pinError && <p className="text-xs text-red-400 mb-4">PIN incorreto, tente de novo</p>}

          <button
            disabled={pinEntry.length !== 6 || checkingPin}
            onClick={handleCheckPin}
            className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 mb-4"
          >
            {checkingPin ? 'Verificando...' : 'Entrar'}
          </button>
            </>
          )}

          <button onClick={handleForgotPin} className="text-xs text-[#9CA3AF] hover:text-[#4A433D] transition-all">
            Esqueci o PIN / biometria
          </button>
        </motion.div>
        <ToastHost />
      </motion.div>
    ) : (
    <motion.div key="app" {...PAGE_FADE} className="flex h-screen bg-[#FDFBF9] text-[#4A433D] overflow-hidden relative">
      <ToastHost />
      {/* Sidebar - Retractable Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/10 backdrop-blur-[1px] z-[50]"
            />
            
            {/* Drawer */}
            <motion.nav 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-white border-r border-[#F5F2F0] shadow-2xl z-[60] flex flex-col p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#EADFD4] rounded-2xl flex items-center justify-center shadow-sm">
                    <span className="text-white font-serif text-xl">{professionalName.trim().charAt(0).toUpperCase() || '?'}</span>
                  </div>
                  <span className="serif text-xl tracking-tight text-[#4A433D]">{professionalName}</span>
                </div>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 text-[#9CA3AF] hover:text-[#EADFD4] transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Search in Sidebar */}
              <div className="mb-8 relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition-colors group-focus-within:text-[#EADFD4]" size={18} />
                <input 
                  type="text" 
                  placeholder="Pesquisar pacientes..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-[#EADFD4]/30 focus:bg-white transition-all text-sm font-light"
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#F5F2F0] rounded-2xl shadow-lg overflow-hidden z-10">
                    {searchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setActiveView('patients'); setJumpToPatientId(p.id!); setIsSidebarOpen(false); setSidebarSearch(''); }}
                        className="w-full text-left px-4 py-3 text-sm text-[#4A433D] hover:bg-[#FDFBF9] border-b border-[#F5F2F0] last:border-0"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex flex-col gap-2">
                <NavItemExpanded 
                  active={activeView === 'dashboard'} 
                  onClick={() => { setActiveView('dashboard'); setIsSidebarOpen(false); }}
                  icon={<LayoutDashboard size={20} />}
                  label="Painel de Controle"
                />
                <NavItemExpanded 
                  active={activeView === 'patients'} 
                  onClick={() => { setActiveView('patients'); setIsSidebarOpen(false); }}
                  icon={<Users size={20} />}
                  label="Gestão de Pacientes"
                />
                <NavItemExpanded 
                  active={activeView === 'schedule'} 
                  onClick={() => { setActiveView('schedule'); setIsSidebarOpen(false); }}
                  icon={<Calendar size={20} />}
                  label="Agenda Clínica"
                />
                <NavItemExpanded 
                  active={activeView === 'inventory'} 
                  onClick={() => { setActiveView('inventory'); setIsSidebarOpen(false); }}
                  icon={<Package size={20} />}
                  label="Estoque & Insumos"
                />
                <NavItemExpanded 
                  active={activeView === 'finance'} 
                  onClick={() => { setActiveView('finance'); setIsSidebarOpen(false); }}
                  icon={<CreditCard size={20} />}
                  label="Controle Financeiro"
                />
                <NavItemExpanded 
                  active={activeView === 'settings'} 
                  onClick={() => { setActiveView('settings'); setIsSidebarOpen(false); }}
                  icon={<SettingsIcon size={20} />}
                  label="Configurações"
                />
              </div>

              <div className="mt-auto pt-8 border-t border-[#F5F2F0]">
                <div className="flex items-center gap-4 mb-6 px-2">
                  <div className="w-12 h-12 rounded-full border border-[#F5F2F0] shadow-sm bg-[#FDFBF9] flex items-center justify-center overflow-hidden shrink-0">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={professionalName} className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={24} className="text-[#EADFD4]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#4A433D] truncate">{professionalName}</p>
                    <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">{clinicSettings?.registrationNumber ? `CRO/CRM ${clinicSettings.registrationNumber}` : 'Especialista'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => { sessionStorage.removeItem('pinUnlocked'); signOut(auth); }}
                  className="w-full flex items-center gap-4 px-6 py-4 text-[#9CA3AF] hover:text-red-400 hover:bg-red-50/30 rounded-2xl transition-all font-medium text-sm group"
                >
                  <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
                  <span>Sair do Sistema</span>
                </button>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-auto min-h-28 bg-white flex items-center justify-between px-6 md:px-10 py-6 z-10 border-b border-[#F5F2F0]">
          <div className="space-y-1">
            <div className="flex items-center gap-x-3 gap-y-1 whitespace-nowrap">
              {activeView !== 'dashboard' && (
                <button
                  onClick={() => setActiveView('dashboard')}
                  className="p-2 -ml-2 text-[#9CA3AF] hover:text-[#EADFD4] hover:bg-[#FDFBF9] rounded-xl transition-all"
                  title="Voltar ao início"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <h1 className="serif text-xl md:text-2xl text-[#4A433D] leading-none">
                {activeView === 'dashboard' ? '' : 
                 activeView === 'patients' ? 'Pacientes' :
                 activeView === 'schedule' ? 'Agenda' :
                 activeView === 'inventory' ? 'Estoque' :
                 activeView === 'finance' ? 'Financeiro' : 'Configurações'}
              </h1>
              {activeView === 'dashboard' && (
                <span className="serif text-xl md:text-2xl text-[#EADFD4] leading-none">{/^dra\.?\s/i.test(professionalName || '') ? professionalName : `Dra. ${professionalName}`}</span>
              )}
            </div>
            <p className="text-[10px] md:text-xs text-[#9CA3AF] font-semibold uppercase tracking-[0.2em] mt-2">
              {activeView === 'dashboard' ? 'Gestão Clínica & Financeira' : 'Consultório Digital'}
            </p>
          </div>
          
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-4 bg-white border border-[#F5F2F0] text-[#9CA3AF] rounded-2xl shadow-sm hover:border-[#EADFD4]/30 hover:text-[#EADFD4] transition-all group shrink-0"
          >
            <MoreVertical size={24} className="group-hover:scale-110 transition-transform" />
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              {...PAGE_FADE}
            >
              <Suspense fallback={<ViewLoadingFallback />}>
                {activeView === 'dashboard' && <Dashboard user={user} onNavigate={setActiveView} professionalName={professionalName} />}
                {activeView === 'patients' && (
                  <Patients
                    user={user}
                    initialPatientId={jumpToPatientId}
                  />
                )}
                {activeView === 'schedule' && (
                  <Schedule 
                    user={user} 
                    onOpenPatient={(patientId: string) => { setActiveView('patients'); setJumpToPatientId(patientId); }}
                  />
                )}
                {activeView === 'inventory' && <Inventory user={user} />}
                {activeView === 'finance' && <Finance user={user} />}
                {activeView === 'settings' && <Settings user={user} />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </motion.div>
    )}
    </AnimatePresence>
  );
}

function NavItemExpanded({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-medium text-sm ${
        active 
          ? 'bg-[#FDFBF9] text-[#EADFD4] shadow-sm' 
          : 'text-[#9CA3AF] hover:bg-[#FDFBF9]/50 hover:translate-x-1'
      }`}
    >
      <div className={`${active ? 'text-[#EADFD4]' : 'text-[#9CA3AF]'}`}>
        {icon}
      </div>
      <span>{label}</span>
    </button>
  );
}

function ViewLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-[#EADFD4] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
