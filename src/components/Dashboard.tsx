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
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function Dashboard({ user, onNavigate }: { user: User, onNavigate: (view: any) => void }) {
  const [stats, setStats] = useState({
    totalPatients: 0,
    monthRevenue: 0,
    todayAppointments: 0,
    lowStock: 0
  });
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Patients count & Recents
    const qPatients = query(
      collection(db, 'patients'), 
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(4)
    );
    const unsubPatients = onSnapshot(qPatients, (snap) => {
      setStats(prev => ({ ...prev, totalPatients: snap.size }));
      setRecentPatients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Schedule for today
    const today = new Date().toISOString().split('T')[0];
    const qSchedule = query(
      collection(db, 'appointments'),
      where('userId', '==', user.uid),
      where('date', '==', today),
      orderBy('time', 'asc')
    );
    const unsubSchedule = onSnapshot(qSchedule, (snap) => {
      setStats(prev => ({ ...prev, todayAppointments: snap.size }));
      setTodaySchedule(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Finance & Chart Data (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0,0,0,0);

    const qFinance = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
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
    const qInventory = query(collection(db, 'inventory'), where('userId', '==', user.uid));
    const unsubInventory = onSnapshot(qInventory, (snap) => {
      const low = snap.docs.filter(doc => doc.data().quantity <= doc.data().minThreshold).length;
      setStats(prev => ({ ...prev, lowStock: low }));
      setLoading(false);
    });

    return () => {
      unsubPatients();
      unsubSchedule();
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

  if (loading) return null;

  return (
    <div className="space-y-10 pb-10">
      {/* Header & Next Appointment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-2 bg-[#4A4644] rounded-[48px] p-12 text-white relative overflow-hidden flex flex-col justify-between min-h-[300px] shadow-2xl"
        >
          <div className="relative z-10">
            <h2 className="text-4xl font-light mb-4 serif">
              Olá, <span className="italic">Dra. Vitória</span>
            </h2>
            <p className="text-white/60 font-light max-w-sm leading-relaxed text-lg">
              Sua clínica está operando com <span className="text-[#D1C7BD] font-medium">excelência</span> hoje. Confira os destaques do seu consultório.
            </p>
          </div>
          
          <div className="relative z-10 flex gap-4 mt-8">
            <button 
              onClick={() => onNavigate('schedule')}
              className="px-10 py-5 bg-[#D1C7BD] text-white rounded-2xl hover:bg-[#D1C7BD]/90 transition-all shadow-lg font-bold text-[10px] uppercase tracking-widest flex items-center gap-3"
            >
              Agenda de Hoje <ArrowRight size={16} />
            </button>
          </div>

          <div className="absolute right-0 top-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3 blur-3xl" />
          <div className="absolute left-1/4 bottom-0 w-40 h-40 bg-[#D1C7BD]/10 rounded-full translate-y-1/2 blur-2xl" />
        </motion.div>

        <AnimatePresence>
          {nextAppointment && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[48px] p-10 border border-[#F2EEE9] flex flex-col justify-between shadow-xl relative group overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 text-[#FAF7F2] group-hover:text-[#D1C7BD]/10 transition-colors">
                <Clock size={80} />
              </div>
              
              <div className="relative z-10">
                <span className="bg-[#FAF7F2] text-[#B4A08C] px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-[0.2em] border border-[#F2EEE9]">
                  Próximo Atendimento
                </span>
                <h3 className="text-4xl font-light text-[#4A4644] serif mt-8 mb-2">{nextAppointment.time}</h3>
                <p className="text-xl text-[#4A4644] font-medium">{nextAppointment.patientName}</p>
                <p className="text-[#B4A08C] font-light text-sm mt-1">{nextAppointment.notes || 'Procedimento Estético'}</p>
              </div>

              <button 
                onClick={() => onNavigate('patients')}
                className="relative z-10 w-full mt-10 py-5 bg-[#FAF7F2] text-[#B4A08C] rounded-[24px] font-bold text-[10px] uppercase tracking-widest border border-[#F2EEE9] hover:bg-[#D1C7BD] hover:text-white hover:border-[#D1C7BD] transition-all flex items-center justify-center gap-2"
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
          icon={<Users className="text-[#D1C7BD]" size={20} />} 
          trend="+4 novos"
        />
        <StatCard 
          label="Faturamento Mês" 
          value={`R$ ${stats.monthRevenue.toLocaleString('pt-BR')}`} 
          icon={<TrendingUp className="text-[#4F634F]" size={20} />} 
          trend="Estável"
        />
        <StatCard 
          label="Consultas Hoje" 
          value={stats.todayAppointments} 
          icon={<Calendar className="text-[#B4A08C]" size={20} />} 
        />
        <StatCard 
          label="Alerta de Estoque" 
          value={stats.lowStock} 
          icon={<AlertCircle className={stats.lowStock > 0 ? "text-red-400" : "text-[#B4A08C]"} size={20} />} 
          variant={stats.lowStock > 0 ? "danger" : "default"}
          trend={stats.lowStock > 0 ? "Revisar" : "Normal"}
        />
      </div>

      {/* Chart Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[48px] border border-[#F2EEE9] p-12 card-shadow"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-4">
          <div>
            <h3 className="serif text-2xl text-[#4A4644] mb-1">Crescimento Mensal</h3>
            <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest">Acompanhamento de Receita • Últimos 6 meses</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#D1C7BD]" />
              <span className="text-xs text-[#B4A08C]">Receita Bruta</span>
            </div>
          </div>
        </div>
        
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D1C7BD" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#D1C7BD" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F2EEE9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#B4A08C', fontSize: 10, fontWeight: 700 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#B4A08C', fontSize: 10 }}
                tickFormatter={(v) => `R$ ${v/1000}k`}
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '20px', 
                  border: 'none', 
                  boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                  padding: '15px 20px'
                }}
                itemStyle={{ color: '#4A4644', fontWeight: 600, fontSize: '14px' }}
                labelStyle={{ fontSize: '10px', color: '#B4A08C', fontWeight: 700, textTransform: 'uppercase', marginBottom: '5px' }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#D1C7BD" 
                strokeWidth={4}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
                animationDuration={2000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Today's Schedule List */}
        <div className="bg-white rounded-[40px] border border-[#F2EEE9] p-10 card-shadow">
          <div className="flex items-center justify-between mb-10">
            <h3 className="serif text-2xl text-[#4A4644]">Agenda de Hoje</h3>
            <button onClick={() => onNavigate('schedule')} className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest hover:text-[#8D6B6B] transition-colors flex items-center gap-2">
              Agenda Completa <ChevronRight size={14} />
            </button>
          </div>
          <div className="space-y-6">
            {todaySchedule.map((appt) => (
              <div key={appt.id} className="flex items-center gap-6 p-6 rounded-3xl border border-transparent hover:border-[#F2EEE9] hover:bg-[#FAF7F2]/40 transition-all group">
                <div className="text-xs font-bold text-[#B4A08C] uppercase w-12 text-center py-2 bg-[#FAF7F2] rounded-xl">{appt.time}</div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-[#4A4644]">{appt.patientName}</p>
                  <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest mt-1">{appt.notes || 'Avaliação Clínica'}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                  appt.status === 'confirmed' ? 'bg-[#D4E2D4] text-[#4F634F]' : 'bg-[#FAF7F2] text-[#B4A08C]'
                }`}>
                  {appt.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                </div>
              </div>
            ))}
            {todaySchedule.length === 0 && (
              <div className="text-center py-16 space-y-4">
                <div className="p-4 bg-[#FAF7F2] rounded-full inline-block text-[#D1C7BD]">
                  <Calendar size={32} />
                </div>
                <p className="text-sm text-[#B4A08C] font-light italic">Sem compromissos hoje.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity / Patients */}
        <div className="bg-white rounded-[40px] border border-[#F2EEE9] p-10 card-shadow">
          <div className="flex items-center justify-between mb-10">
            <h3 className="serif text-2xl text-[#4A4644]">Novos Pacientes</h3>
            <button onClick={() => onNavigate('patients')} className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest hover:text-[#8D6B6B] transition-colors flex items-center gap-2">
              Ver Todos <ChevronRight size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {recentPatients.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-6 bg-[#FAF7F2]/50 rounded-3xl border border-[#F2EEE9] hover:border-[#D1C7BD] transition-all group">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-[#F2EEE9] text-[#B4A08C] group-hover:bg-[#D1C7BD] group-hover:text-white transition-all">
                    <Users size={20} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-[#4A4644]">{p.name}</p>
                    <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest">Prontuário Ativo</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-[#EBE3DB] group-hover:text-[#B4A08C] transition-colors" />
              </div>
            ))}
            {recentPatients.length === 0 && (
              <div className="text-center py-16 space-y-4">
                <div className="p-4 bg-[#FAF7F2] rounded-full inline-block text-[#D1C7BD]">
                  <Users size={32} />
                </div>
                <p className="text-sm text-[#B4A08C] font-light italic">Nenhum paciente novo.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, trend, variant = "default" }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className={`p-10 bg-white border border-[#F2EEE9] rounded-[40px] card-shadow relative overflow-hidden group ${variant === 'danger' ? 'bg-red-50/20' : ''}`}
    >
      <div className="flex items-center justify-between mb-8">
        <div className={`p-4 rounded-2xl transition-all ${variant === 'danger' ? 'bg-red-100/50 text-red-500' : 'bg-[#FAF7F2] text-[#B4A08C] group-hover:bg-[#D1C7BD] group-hover:text-white'}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[9px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full ${variant === 'danger' ? 'bg-red-100 text-red-500' : 'bg-[#FAF7F2] text-[#4F634F]'}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] mb-2 ml-1">{label}</p>
        <p className="text-3xl font-light text-[#4A4644] serif leading-tight">{value}</p>
      </div>
      <div className="absolute right-0 bottom-0 w-24 h-24 bg-[#D1C7BD]/5 rounded-full translate-x-1/2 translate-y-1/2" />
    </motion.div>
  );
}
