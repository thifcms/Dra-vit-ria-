import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { auth, signInWithGoogle, db } from './lib/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { ToastHost } from './lib/toast';
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
  CreditCard
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

type View = 'dashboard' | 'patients' | 'schedule' | 'inventory' | 'finance' | 'settings';

export default function App() {
  // Páginas públicas — sem login, acessíveis de qualquer link externo.
  // Ficam num componente separado pra não misturar hooks condicionais com o resto do app.
  const hash = window.location.hash;
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
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) { setClinicSettings(null); setPatients([]); return; }
    const unsubSettings = onSnapshot(doc(db, 'settings', user.uid), (snap) => {
      if (snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
    });

    const unsubPatients = onSnapshot(
      query(collection(db, 'patients'), where('userId', '==', user.uid)),
      snap => setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)))
    );
    return () => {
      unsubSettings();
      unsubPatients();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(14px)' }}
          animate={{ 
            opacity: 1,
            scale: 1,
            filter: 'blur(0px)',
          }} 
          transition={{ 
            duration: 5,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: [0.65, 0, 0.35, 1],
          }}
        >
          <img src="/Dra-vit-ria-/logo/logo-full.png" alt="Dra. Vitória Oliveira — Estética Orofacial" className="h-24 w-auto object-contain" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-10 rounded-[32px] shadow-sm border border-[#F5F2F0] text-center"
        >
          <div className="w-20 h-20 bg-[#EADFD4]/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <UserIcon className="text-[#EADFD4] w-10 h-10" />
          </div>
          <h1 className="text-3xl font-light text-[#5C544E] mb-2 serif">Bem-vindo</h1>
          <p className="text-[#9CA3AF] mb-10 font-light italic">Gestão moderna e delicada</p>
          
          <button 
            onClick={signInWithGoogle}
            className="w-full py-4 px-6 bg-[#EADFD4] text-white rounded-2xl flex items-center justify-center gap-3 hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] font-medium"
          >
            <span className="tracking-wide">Entrar com Google</span>
          </button>
          
          <p className="mt-8 text-xs text-[#9CA3AF] font-light uppercase tracking-[0.2em]">Acesso Seguro & Criptografado</p>
        </motion.div>
        
        <ToastHost />
      </div>
    );
  }
          
  return (
    <div className="flex h-screen bg-[#FDFBF9] text-[#5C544E] overflow-hidden relative">
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
                  <span className="serif text-xl tracking-tight text-[#5C544E]">{professionalName}</span>
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
                        className="w-full text-left px-4 py-3 text-sm text-[#5C544E] hover:bg-[#FDFBF9] border-b border-[#F5F2F0] last:border-0"
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
                    <p className="text-sm font-semibold text-[#5C544E] truncate">{professionalName}</p>
                    <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">{clinicSettings?.registrationNumber ? `CRO/CRM ${clinicSettings.registrationNumber}` : 'Especialista'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => signOut(auth)}
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
              <h1 className="serif text-xl md:text-2xl text-[#5C544E] leading-none">
                {activeView === 'dashboard' ? '' : 
                 activeView === 'patients' ? 'Pacientes' :
                 activeView === 'schedule' ? 'Agenda' :
                 activeView === 'inventory' ? 'Estoque' :
                 activeView === 'finance' ? 'Financeiro' : 'Configurações'}
              </h1>
              {activeView === 'dashboard' && (
                <span className="serif text-xl md:text-2xl text-[#EADFD4] leading-none">{professionalName}</span>
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Suspense fallback={<ViewLoadingFallback />}>
                {activeView === 'dashboard' && <Dashboard user={user} onNavigate={setActiveView} professionalName={professionalName} />}
                {activeView === 'patients' && (
                  <Patients
                    user={user}
                    initialPatientId={jumpToPatientId}
                  />
                )}
                {activeView === 'schedule' && <Schedule user={user} />}
                {activeView === 'inventory' && <Inventory user={user} />}
                {activeView === 'finance' && <Finance user={user} />}
                {activeView === 'settings' && <Settings user={user} />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
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
