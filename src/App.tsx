import React, { useState, useEffect } from 'react';
import { auth, signInWithGoogle } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
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

// Views
import Dashboard from './components/Dashboard';
import Patients from './components/Patients';
import Schedule from './components/Schedule';
import Inventory from './components/Inventory';
import Finance from './components/Finance';
import Settings from './components/Settings';

type View = 'dashboard' | 'patients' | 'schedule' | 'inventory' | 'finance' | 'settings';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9]">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }} 
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-[#B4A08C] font-light text-xl tracking-widest serif"
        >
          CLÍNICA DIGITAL
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
          className="w-full max-w-md bg-white p-10 rounded-[32px] card-shadow border border-[#EBE3DB] text-center"
        >
          <div className="w-20 h-20 bg-[#D1C7BD]/20 rounded-full flex items-center justify-center mx-auto mb-8">
            <UserIcon className="text-[#D1C7BD] w-10 h-10" />
          </div>
          <h1 className="text-3xl font-normal text-[#4A4644] mb-2 serif">Bem-vindo</h1>
          <p className="text-[#B4A08C] mb-10 font-light italic">Gestão moderna e delicada</p>
          
          <button 
            onClick={signInWithGoogle}
            className="w-full py-4 px-6 bg-[#D1C7BD] text-white rounded-2xl flex items-center justify-center gap-3 hover:bg-[#D1C7BD]/90 transition-all shadow-sm active:scale-[0.98] font-medium"
          >
            <span className="tracking-wide">Entrar com Google</span>
          </button>
          
          <p className="mt-8 text-xs text-[#B4A08C] font-light uppercase tracking-[0.2em]">Acesso Seguro & Criptografado</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#FDFBF9] text-[#4A4644] overflow-hidden relative">
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
              className="fixed inset-0 bg-black/5 backdrop-blur-[2px] z-[50]"
            />
            
            {/* Drawer */}
            <motion.nav 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-white border-r border-[#EBE3DB] shadow-2xl z-[60] flex flex-col p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#D1C7BD] rounded-2xl flex items-center justify-center shadow-sm">
                    <span className="text-white font-serif text-xl">C</span>
                  </div>
                  <span className="serif text-xl tracking-tight">Clínica Digital</span>
                </div>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 text-[#B4A08C] hover:text-[#8D6B6B] transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Search in Sidebar */}
              <div className="mb-8 relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#B4A08C] transition-colors group-focus-within:text-[#D1C7BD]" size={18} />
                <input 
                  type="text" 
                  placeholder="Pesquisar pacientes..."
                  className="w-full bg-[#FAF7F2] border border-[#EBE3DB] rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-[#B4A08C] focus:bg-white transition-all text-sm font-light"
                />
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

              <div className="mt-auto pt-8 border-t border-[#F2EEE9]">
                <div className="flex items-center gap-4 mb-6 px-2">
                  <div className="w-12 h-12 rounded-full border-2 border-[#D1C7BD] p-0.5 shadow-sm bg-white flex items-center justify-center overflow-hidden shrink-0">
                    <UserIcon size={24} className="text-[#D1C7BD]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#4A4644] truncate">Dra. Vitória Oliveira</p>
                    <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest">Especialista</p>
                  </div>
                </div>
                <button 
                  onClick={() => signOut(auth)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-[#B4A08C] hover:text-[#8D6B6B] hover:bg-[#FAF7F2] rounded-2xl transition-all font-medium text-sm group"
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
        <header className="h-auto min-h-28 bg-[#FDFBF9] flex items-center justify-between px-6 md:px-10 py-6 z-10 border-b border-[#F2EEE9]">
          <div className="space-y-1">
            <div className="flex items-center gap-x-3 gap-y-1 whitespace-nowrap">
              <h1 className="serif text-xl md:text-2xl text-[#4A4644] leading-none">
                {activeView === 'dashboard' ? '' : 
                 activeView === 'patients' ? 'Pacientes' :
                 activeView === 'schedule' ? 'Agenda' :
                 activeView === 'inventory' ? 'Estoque' :
                 activeView === 'finance' ? 'Financeiro' : 'Configurações'}
              </h1>
              {activeView === 'dashboard' && (
                <span className="serif text-xl md:text-2xl text-[#8D6B6B] leading-none">Dra. Vitória Oliveira</span>
              )}
            </div>
            <p className="text-[10px] md:text-xs text-[#B4A08C] font-semibold uppercase tracking-[0.2em] mt-2">
              {activeView === 'dashboard' ? 'Gestão Clínica & Financeira' : 'Consultório Digital'}
            </p>
          </div>
          
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-4 bg-white border border-[#EBE3DB] text-[#B4A08C] rounded-2xl shadow-sm hover:border-[#B4A08C] hover:text-[#8D6B6B] transition-all group shrink-0"
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
              {activeView === 'dashboard' && <Dashboard user={user} onNavigate={setActiveView} />}
              {activeView === 'patients' && <Patients user={user} />}
              {activeView === 'schedule' && <Schedule user={user} />}
              {activeView === 'inventory' && <Inventory user={user} />}
              {activeView === 'finance' && <Finance user={user} />}
              {activeView === 'settings' && <Settings user={user} />}
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
          ? 'bg-[#FAF7F2] text-[#8D6B6B] shadow-inner' 
          : 'text-[#B4A08C] hover:bg-[#FAF7F2]/50 hover:translate-x-1'
      }`}
    >
      <div className={`${active ? 'text-[#8D6B6B]' : 'text-[#B4A08C]'}`}>
        {icon}
      </div>
      <span>{label}</span>
    </button>
  );
}
