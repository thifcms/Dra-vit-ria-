import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { 
  Users, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight,
  Clock,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Play,
  ArrowRight,
  Settings as SettingsIcon,
  Plus,
  MessageSquare,
  Send,
  Gift,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { buildReminderMessage, whatsappLink, openWhatsApp } from '../lib/reminders';
import { checkinLink, cancelLink, todayLocalStr, getClinicOwnerId, hasFinanceAccess } from '../lib/slots';
import { showToast } from '../lib/toast';
import { ClinicSettings } from '../types';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function Dashboard({ user, onNavigate, onOpenPatient, professionalName }: { user: User, onNavigate: (view: any) => void, onOpenPatient?: (patientId: string) => void, professionalName: string }) {
  const [stats, setStats] = useState({
    totalPatients: 0,
    monthRevenue: 0,
    todayAppointments: 0,
    lowStock: 0
  });
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [birthdayPatients, setBirthdayPatients] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<{ id: string, name: string, quantity: number, minThreshold: number, unit: string }[]>([]);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [todaySchedule, setTodaySchedule] = useState<any[]>([]);
  const [pendingOnlineBookings, setPendingOnlineBookings] = useState<any[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClinicOwnerId(db).then(ownerId => getDoc(doc(db, 'settings', ownerId))).then(snap => {
      if (snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
    }).catch(() => {});
  }, [user.uid]);

  useEffect(() => {
    // Patients count & Recents
    const qPatients = query(
      collection(db, 'patients'), 
      orderBy('updatedAt', 'desc'),
      limit(4)
    );
    const unsubPatients = onSnapshot(qPatients, (snap) => {
      setStats(prev => ({ ...prev, totalPatients: snap.size }));
      setRecentPatients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Aniversariantes do dia — busca todos os pacientes (não só os 4 recentes acima),
    // já que quem faz aniversário hoje pode não ter sido atualizado recentemente
    const unsubAllPatients = onSnapshot(collection(db, 'patients'), (snap) => {
      const today = new Date();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();
      const matches = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(p => {
          if (!p.birthDate) return false;
          const [, month, day] = p.birthDate.split('-').map(Number);
          return month === todayMonth && day === todayDay;
        });
      setBirthdayPatients(matches);
    });

    // Schedule for today
    const today = todayLocalStr();
    const qSchedule = query(
      collection(db, 'appointments'),
      where('date', '==', today),
      orderBy('time', 'asc')
    );
    const unsubSchedule = onSnapshot(qSchedule, (snap) => {
      setStats(prev => ({ ...prev, todayAppointments: snap.size }));
      setTodaySchedule(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Pending online bookings (not necessarily today)
    const qPending = query(
      collection(db, 'appointments'),
      where('bookedOnline', '==', true),
      where('status', '==', 'scheduled'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    const unsubPending = onSnapshot(qPending, (snap) => {
      setPendingOnlineBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Finance & Chart Data (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0,0,0,0);

    const qFinance = query(
      collection(db, 'transactions'),
      where('date', '>=', sixMonthsAgo)
    );

    const unsubFinance = onSnapshot(qFinance, (snap) => {
      const docs = snap.docs.map(d => d.data());
      
      // Calculate current month revenue
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      const monthRevenue = docs.reduce((acc, data) => {
        const d = data.date.toDate ? data.date.toDate() : new Date(data.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          return data.type === 'income' ? acc + data.amount : acc - data.amount;
        }
        return acc;
      }, 0);

      setStats(prev => ({ ...prev, monthRevenue }));

      // Prepare chart data
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const lastSix = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth();
        const y = d.getFullYear();
        
        const income = docs
          .filter(data => {
            const dt = data.date.toDate ? data.date.toDate() : new Date(data.date);
            return dt.getMonth() === m && dt.getFullYear() === y && data.type === 'income';
          })
          .reduce((sum, item) => sum + item.amount, 0);

        lastSix.push({
          name: months[m],
          revenue: income
        });
      }
      setChartData(lastSix);
    });

    // Inventory low stock
    const qInventory = query(collection(db, 'inventory'));
    const unsubInventory = onSnapshot(qInventory, (snap) => {
      const lowItems = snap.docs
        .filter(doc => doc.data().quantity <= doc.data().minThreshold)
        .map(doc => ({ id: doc.id, name: doc.data().name, quantity: doc.data().quantity, minThreshold: doc.data().minThreshold, unit: doc.data().unit || '' }));
      setLowStockItems(lowItems);
      setStats(prev => ({ ...prev, lowStock: lowItems.length }));
      setLoading(false);
    });

    return () => {
      unsubPatients();
      unsubAllPatients();
      unsubSchedule();
      unsubPending();
      unsubFinance();
      unsubInventory();
    };
  }, [user.uid]);

  const nextAppointment = todaySchedule.find(a => {
    const [h, m] = a.time.split(':');
    const apptTime = new Date();
    apptTime.setHours(parseInt(h), parseInt(m), 0);
    return apptTime > new Date();
  }) || todaySchedule[0];

  // Agendamentos online vinculados a um paciente já cadastrado não têm guestPhone
  // preenchido (esse campo é só pra quando alguém agenda sem cadastro ainda) — o
  // telefone, nesse caso, mora no próprio cadastro do paciente. Sem esse fallback, o
  // botão "Confirmar & Enviar" clicava e não fazia nada, silenciosamente, pra qualquer
  // agendamento online de um paciente que já existia no sistema.
  const handleSendReminder = async (appt: any) => {
    if (!clinicSettings) return;
    let phone = appt.guestPhone;
    if (!phone && appt.patientId) {
      try {
        const patientSnap = await getDoc(doc(db, 'patients', appt.patientId));
        if (patientSnap.exists()) phone = patientSnap.data().phone;
      } catch { /* segue pro aviso abaixo se não conseguir buscar */ }
    }
    if (!phone) {
      showToast('Este paciente não tem telefone cadastrado', 'error');
      return;
    }

    const checkinUrl = checkinLink(appt.id, appt.checkinToken, appt.date, appt.time);
    const cancel = cancelLink(appt.id, appt.checkinToken, appt.date, appt.time, user.uid);
    const msg = buildReminderMessage({
      patientName: appt.patientName,
      clinicName: clinicSettings.clinicName || 'Nossa Clínica',
      professionalName: clinicSettings.professionalName,
      address: clinicSettings.clinicAddress,
      dateLabel: appt.date === todayLocalStr() ? 'Hoje' : new Date(appt.date + 'T00:00:00').toLocaleDateString('pt-BR'),
      time: appt.time,
      checkinUrl,
      cancelUrl: cancel,
    });
    openWhatsApp(phone, msg);
  };

  if (loading) return null;

  return (
    <div className="space-y-10 pb-10">
      {/* Header & Next Appointment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 bg-[#EADFD4] rounded-[40px] p-8 text-[#4A433D] relative overflow-hidden flex flex-col justify-between min-h-[200px] shadow-xl"
        >
          <div className="relative z-10">
            <h2 className="text-2xl font-light mb-3 serif">
              Olá, <span className="italic">{/^dra\.?\s/i.test(professionalName || '') ? professionalName : `Dra. ${professionalName}`}</span>
            </h2>
            <p className="text-[#4A433D]/70 font-light max-w-sm leading-relaxed text-sm">
              Sua clínica está operando com <span className="text-[#4A433D] font-medium">excelência</span> hoje. Confira os destaques do seu consultório.
            </p>
          </div>
          
          <div className="relative z-10 flex gap-4 mt-6">
            <button 
              onClick={() => onNavigate('schedule')}
              className="px-8 py-4 bg-[#4A433D] text-white rounded-2xl hover:bg-[#4A433D] transition-all shadow-lg font-bold text-[10px] uppercase tracking-widest flex items-center gap-3"
            >
              Agenda de Hoje <ArrowRight size={16} />
            </button>
          </div>

          <div className="absolute right-0 top-0 w-80 h-80 bg-white/30 rounded-full -translate-y-1/3 translate-x-1/3 blur-3xl" />
          <div className="absolute left-1/4 bottom-0 w-40 h-40 bg-[#4A433D]/5 rounded-full translate-y-1/2 blur-2xl" />
        </motion.div>

        <AnimatePresence>
          {nextAppointment && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[48px] p-10 border border-[#F5F2F0] flex flex-col justify-between shadow-xl relative group overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 text-[#FDFBF9] group-hover:text-[#EADFD4]/10 transition-colors">
                <Clock size={80} />
              </div>
              
              <div className="relative z-10">
                <span className="bg-[#FDFBF9] text-[#9CA3AF] px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-[0.2em] border border-[#F5F2F0]">
                  Próximo Atendimento
                </span>
                <h3 className="text-4xl font-light text-[#4A433D] serif mt-8 mb-2">{nextAppointment.time}</h3>
                <p className="text-xl text-[#4A433D] font-medium">{nextAppointment.patientName}</p>
                <p className="text-[#9CA3AF] font-light text-sm mt-1">{nextAppointment.notes || 'Procedimento Estético'}</p>
              </div>

              <button 
                onClick={() => onNavigate('patients')}
                className="relative z-10 w-full mt-10 py-5 bg-[#FDFBF9] text-[#9CA3AF] rounded-[24px] font-bold text-[10px] uppercase tracking-widest border border-[#F5F2F0] hover:bg-[#EADFD4] hover:text-white hover:border-[#EADFD4] transition-all flex items-center justify-center gap-2"
              >
                Abrir Prontuário <Play size={14} fill="currentColor" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Base de Pacientes" 
          value={stats.totalPatients} 
          icon={<Users className="text-[#EADFD4]" size={20} />} 
          trend="+4 novos"
        />
        {hasFinanceAccess(user?.email) && (
          <StatCard 
            label="Faturamento Mês" 
            value={`R$ ${stats.monthRevenue.toLocaleString('pt-BR')}`} 
            icon={<TrendingUp className="text-[#8BA888]" size={20} />} 
            trend="Estável"
          />
        )}
        <StatCard 
          label="Consultas Hoje" 
          value={stats.todayAppointments} 
          icon={<Calendar className="text-[#9CA3AF]" size={20} />} 
        />
        <StatCard 
          label="Alerta de Estoque" 
          value={stats.lowStock} 
          icon={<AlertCircle className={stats.lowStock > 0 ? "text-red-400" : "text-[#9CA3AF]"} size={20} />} 
          variant={stats.lowStock > 0 ? "danger" : "default"}
          trend={stats.lowStock > 0 ? "Revisar" : "Normal"}
          onClick={stats.lowStock > 0 ? () => setShowLowStockModal(true) : undefined}
        />
      </div>

      {/* Quick Actions & Bento Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <motion.div 
          whileHover={{ scale: 1.01 }}
          className="md:col-span-1 bg-[#FDFBF9] border border-[#F5F2F0] rounded-[40px] p-10 flex flex-col justify-between group cursor-pointer"
          onClick={() => onNavigate('patients')}
        >
          <div>
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-[#EADFD4] shadow-sm mb-6 group-hover:bg-[#EADFD4] group-hover:text-white transition-all">
              <Plus size={24} />
            </div>
            <h3 className="serif text-2xl text-[#4A433D] mb-2">Novo Cadastro</h3>
            <p className="text-xs text-[#9CA3AF] font-light leading-relaxed">Adicione um novo paciente à sua base de dados em segundos.</p>
          </div>
          <ArrowRight className="mt-8 text-[#F5F2F0] group-hover:text-[#EADFD4] group-hover:translate-x-2 transition-all" />
        </motion.div>

        {hasFinanceAccess(user?.email) && (
          <motion.div 
            whileHover={{ scale: 1.01 }}
            className="md:col-span-1 bg-[#FDFBF9] border border-[#F5F2F0] rounded-[40px] p-10 flex flex-col justify-between group cursor-pointer"
            onClick={() => onNavigate('finance')}
          >
            <div>
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-[#8BA888] shadow-sm mb-6 group-hover:bg-[#8BA888] group-hover:text-white transition-all">
                <TrendingUp size={24} />
              </div>
              <h3 className="serif text-2xl text-[#4A433D] mb-2">Fluxo de Caixa</h3>
              <p className="text-xs text-[#9CA3AF] font-light leading-relaxed">Visualize a saúde financeira do seu consultório em tempo real.</p>
            </div>
            <ArrowRight className="mt-8 text-[#F5F2F0] group-hover:text-[#8BA888] group-hover:translate-x-2 transition-all" />
          </motion.div>
        )}

        <motion.div 
          whileHover={{ scale: 1.01 }}
          className="md:col-span-1 bg-[#EADFD4] rounded-[40px] p-10 flex flex-col justify-between group cursor-pointer text-[#4A433D]"
          onClick={() => onNavigate('settings')}
        >
          <div>
            <div className="w-14 h-14 bg-white/50 rounded-2xl flex items-center justify-center text-[#4A433D] shadow-sm mb-6 group-hover:bg-white transition-all">
              <SettingsIcon size={24} />
            </div>
            <h3 className="serif text-2xl mb-2">Configurações</h3>
            <p className="text-xs text-[#4A433D]/60 font-light leading-relaxed">Personalize os termos de consentimento e dados da clínica.</p>
          </div>
          <ArrowRight className="mt-8 text-[#4A433D]/30 group-hover:text-[#4A433D] group-hover:translate-x-2 transition-all" />
        </motion.div>
      </div>

      {/* Chart Section — Receita, visível só pra quem tem acesso financeiro */}
      {hasFinanceAccess(user?.email) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[48px] border border-[#F5F2F0] p-12 card-shadow"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-4">
            <div>
              <h3 className="serif text-2xl text-[#4A433D] mb-1">Crescimento Mensal</h3>
              <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">Acompanhamento de Receita • Últimos 6 meses</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#EADFD4]" />
                <span className="text-xs text-[#9CA3AF]">Receita Bruta</span>
              </div>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EADFD4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#EADFD4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F2F0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  tickFormatter={(v) => `R$ ${v/1000}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '20px', 
                    border: 'none', 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                    padding: '15px 20px'
                  }}
                  itemStyle={{ color: '#4A433D', fontWeight: 600, fontSize: '14px' }}
                  labelStyle={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  name="Receita"
                  stroke="#EADFD4" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pending Online Bookings */}
        {pendingOnlineBookings.length > 0 && (
          <div className="bg-[#FDFBF9] rounded-[40px] border border-[#F5F2F0] p-10 card-shadow lg:col-span-2">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="serif text-2xl text-[#4A433D]">Novos Agendamentos Online</h3>
                <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">Confirme e envie o link de chegada para o paciente</p>
              </div>
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#EADFD4] shadow-sm">
                <Send size={20} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingOnlineBookings.map((appt) => (
                <div key={appt.id} className="bg-white p-6 rounded-3xl border border-[#F5F2F0] flex items-center justify-between group">
                  <div>
                    <p className="text-sm font-semibold text-[#4A433D]">{appt.patientName}</p>
                    <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">
                      {new Date(appt.date + 'T00:00:00').toLocaleDateString('pt-BR')} às {appt.time}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleSendReminder(appt)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FDFBF9] text-[#9CA3AF] hover:bg-[#25D366] hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Confirmar & Enviar <MessageSquare size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aniversariantes do Dia */}
        {birthdayPatients.length > 0 && (
          <div className="bg-white rounded-[40px] border border-[#F5F2F0] p-10 card-shadow">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-[#F0F7F0] rounded-2xl flex items-center justify-center text-[#8BA888]">
                <Gift size={20} />
              </div>
              <h3 className="serif text-2xl text-[#4A433D]">
                {birthdayPatients.length === 1 ? 'Aniversariante do Dia' : 'Aniversariantes do Dia'}
              </h3>
            </div>
            <div className="space-y-4">
              {birthdayPatients.map(patient => (
                <div key={patient.id} className="flex items-center justify-between gap-4 p-6 rounded-3xl bg-[#FDFBF9] border border-[#F5F2F0]">
                  <button onClick={() => onOpenPatient?.(patient.id)} className="text-left flex-1">
                    <p className="text-sm font-semibold text-[#4A433D]">{patient.name}</p>
                    {patient.phone && <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">{patient.phone}</p>}
                  </button>
                  {patient.phone && (
                    <button
                      onClick={() => {
                        const firstName = patient.name.split(' ')[0];
                        const message = `Feliz aniversário, ${firstName}! 🎉 A equipe deseja um dia repleto de alegria — muito obrigada por fazer parte da nossa história!`;
                        openWhatsApp(patient.phone, message);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-[#9CA3AF] hover:bg-[#25D366] hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-[#F5F2F0]"
                    >
                      Parabenizar <MessageSquare size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's Schedule List */}
        <div className="bg-white rounded-[40px] border border-[#F5F2F0] p-10 card-shadow">
          <div className="flex items-center justify-between mb-10">
            <h3 className="serif text-2xl text-[#4A433D]">Agenda de Hoje</h3>
            <button onClick={() => onNavigate('schedule')} className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest hover:text-red-400 transition-colors flex items-center gap-2">
              Agenda Completa <ChevronRight size={14} />
            </button>
          </div>
          <div className="space-y-6">
            {todaySchedule.map((appt) => (
              <div key={appt.id} className="flex items-center gap-6 p-6 rounded-3xl border border-transparent hover:border-[#F5F2F0] hover:bg-[#FDFBF9]/40 transition-all group">
                <div className="text-xs font-bold text-[#9CA3AF] uppercase w-12 text-center py-2 bg-[#FDFBF9] rounded-xl">{appt.time}</div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-[#4A433D]">{appt.patientName}</p>
                  <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">{appt.notes || 'Avaliação Clínica'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleSendReminder(appt)}
                    className="p-2 text-[#9CA3AF] hover:text-[#25D366] hover:bg-green-50 rounded-xl transition-all"
                    title="Enviar Lembrete WhatsApp"
                  >
                    <MessageSquare size={18} />
                  </button>
                  <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                    appt.status === 'confirmed' ? 'bg-[#F0F7F0] text-[#8BA888]' : 'bg-[#FDFBF9] text-[#9CA3AF]'
                  }`}>
                    {appt.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                  </div>
                </div>
              </div>
            ))}
            {todaySchedule.length === 0 && (
              <div className="text-center py-16 space-y-4">
                <div className="p-4 bg-[#FDFBF9] rounded-full inline-block text-[#EADFD4]">
                  <Calendar size={32} />
                </div>
                <p className="text-sm text-[#9CA3AF] font-light italic">Sem compromissos hoje.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity / Patients */}
        <div className="bg-white rounded-[40px] border border-[#F5F2F0] p-10 card-shadow">
          <div className="flex items-center justify-between mb-10">
            <h3 className="serif text-2xl text-[#4A433D]">Novos Pacientes</h3>
            <button onClick={() => onNavigate('patients')} className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest hover:text-red-400 transition-colors flex items-center gap-2">
              Ver Todos <ChevronRight size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {recentPatients.map((p) => (
              <div
                key={p.id}
                onClick={() => { if (p.id) { onOpenPatient ? onOpenPatient(p.id) : onNavigate('patients'); } }}
                className="flex items-center justify-between p-6 bg-[#FDFBF9]/50 rounded-3xl border border-[#F5F2F0] hover:border-[#EADFD4] transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-[#F5F2F0] text-[#9CA3AF] group-hover:bg-[#EADFD4] group-hover:text-white transition-all">
                    <Users size={20} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[#4A433D]">{p.name}</p>
                    <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">Prontuário Ativo</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-[#F5F2F0] group-hover:text-[#9CA3AF] transition-colors" />
              </div>
            ))}
            {recentPatients.length === 0 && (
              <div className="text-center py-16 space-y-4">
                <div className="p-4 bg-[#FDFBF9] rounded-full inline-block text-[#EADFD4]">
                  <Users size={32} />
                </div>
                <p className="text-sm text-[#9CA3AF] font-light italic">Nenhum paciente novo.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showLowStockModal && (
        <div className="fixed inset-0 bg-[#4A433D]/30 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="text-red-400" size={22} />
                <h3 className="serif text-2xl text-[#4A433D]">Estoque Baixo</h3>
              </div>
              <button onClick={() => setShowLowStockModal(false)} className="text-[#9CA3AF] hover:text-[#4A433D] transition-all"><X size={22} /></button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {lowStockItems.map(item => (
                <div key={item.id} className="p-4 bg-red-50/40 rounded-2xl flex items-center justify-between">
                  <span className="text-sm text-[#4A433D] font-medium">{item.name}</span>
                  <span className="text-xs text-red-500 font-bold">{item.quantity} {item.unit} (mín. {item.minThreshold})</span>
                </div>
              ))}
              {lowStockItems.length === 0 && <p className="text-sm text-[#9CA3AF] italic text-center py-4">Nenhum item com estoque baixo.</p>}
            </div>
            <button
              onClick={() => { setShowLowStockModal(false); onNavigate('inventory'); }}
              className="w-full mt-8 py-4 bg-[#4A433D] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#5C544E] transition-all"
            >
              Ir para o Estoque
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, trend, variant = "default", onClick }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      onClick={onClick}
      className={`p-10 bg-white border border-[#F5F2F0] rounded-[40px] shadow-sm relative overflow-hidden group ${variant === 'danger' ? 'bg-red-50/20' : ''} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between mb-8">
        <div className={`p-4 rounded-2xl transition-all ${variant === 'danger' ? 'bg-red-100/50 text-red-500' : 'bg-[#FDFBF9] text-[#9CA3AF] group-hover:bg-[#EADFD4] group-hover:text-white'}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[9px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full ${variant === 'danger' ? 'bg-red-100 text-red-500' : 'bg-[#FDFBF9] text-[#8BA888]'}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-2 ml-1">{label}</p>
        <p className="text-3xl font-light text-[#4A433D] serif leading-tight">{value}</p>
      </div>
      <div className="absolute right-0 bottom-0 w-24 h-24 bg-[#EADFD4]/5 rounded-full translate-x-1/2 translate-y-1/2" />
    </motion.div>
  );
}
