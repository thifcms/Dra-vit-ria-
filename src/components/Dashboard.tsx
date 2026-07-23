import React from 'react';
import { User } from 'firebase/auth';
import { motion } from 'motion/react';
import { 
  Users, 
  Calendar, 
  TrendingUp, 
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  BarChart3,
  User as UserIcon
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const productivityData = [
  { name: 'Seg', atendimentos: 4 },
  { name: 'Ter', atendimentos: 7 },
  { name: 'Qua', atendimentos: 5 },
  { name: 'Qui', atendimentos: 8 },
  { name: 'Sex', atendimentos: 6 },
  { name: 'Sáb', atendimentos: 3 },
];

interface DashboardProps {
  user: User;
  onNavigate: (view: any) => void;
}

export default function Dashboard({ user, onNavigate }: DashboardProps) {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="FATURAMENTO MENSAL" 
          value="R$ 15.420" 
          trend="+8.2%" 
          trendUp={true}
          icon={<TrendingUp size={16} className="text-[#8D6B6B]" />}
          color="bg-[#F5E6E8]"
        />
        <StatCard 
          label="PRODUTIVIDADE" 
          value="24 Atendimentos" 
          trend="Meta: 92%" 
          trendUp={true}
          icon={<Calendar size={16} className="text-[#4F634F]" />}
          color="bg-[#D4E2D4]"
        />
        <StatCard 
          label="NOVOS PACIENTES" 
          value="12" 
          trend="+15%" 
          trendUp={true}
          icon={<Users size={16} className="text-[#B4A08C]" />}
          color="bg-[#FAF7F2]"
        />
        <StatCard 
          label="STATUS ESTOQUE" 
          value="3 Itens" 
          trend="Reposição" 
          trendUp={false}
          icon={<AlertCircle size={16} className="text-[#D1C7BD]" />}
          color="bg-[#D1C7BD]/20"
        />
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Productivity Chart */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-3xl p-8 card-shadow border border-[#F2EEE9]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#FAF7F2] rounded-xl text-[#B4A08C]">
                <BarChart3 size={20} />
              </div>
              <h3 className="serif text-xl text-[#4A4644]">Produtividade Semanal</h3>
            </div>
            <select className="bg-transparent text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest outline-none cursor-pointer">
              <option>Esta Semana</option>
              <option>Semana Passada</option>
            </select>
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productivityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F2EEE9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#B4A08C', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: '#FAF7F2' }}
                  contentStyle={{ 
                    backgroundColor: '#FFF', 
                    borderRadius: '16px', 
                    border: '1px solid #F2EEE9',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    fontSize: '12px'
                  }}
                />
                <Bar 
                  dataKey="atendimentos" 
                  fill="#D4E2D4" 
                  radius={[8, 8, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Appointments Summary */}
        <div className="col-span-12 lg:col-span-4 bg-white rounded-3xl p-8 card-shadow border border-[#F2EEE9]">
          <div className="flex items-center justify-between mb-8">
            <h3 className="serif text-xl text-[#4A4644]">Próximos</h3>
            <span className="text-[10px] text-[#B4A08C] uppercase tracking-widest">{new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span>
          </div>
          <div className="space-y-4">
            <AppointmentItem 
              time="14:00" 
              patient="Mariana Silva" 
              procedure="Toxina" 
              status="Confirmado"
              color="bg-[#F5E6E8]"
            />
            <AppointmentItem 
              time="15:30" 
              patient="Ricardo Santos" 
              procedure="Preenchimento" 
              status="Aguardando"
              color="bg-[#E5ECE5]"
            />
            <AppointmentItem 
              time="17:00" 
              patient="Ana Paula" 
              procedure="Bioestimulador" 
              status="Confirmado"
              color="bg-[#F5E6E8]"
            />
          </div>
          <button 
            onClick={() => onNavigate('patients')}
            className="w-full mt-8 py-3 bg-[#FAF7F2] text-[#B4A08C] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#F2EEE9] transition-all"
          >
            Ver Todos os Prontuários
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 mt-8">
        {/* Alerts Area */}
        <div className="col-span-12 lg:col-span-6 bg-[#F5E6E8]/30 rounded-3xl p-6 border border-[#E8D3D3]">
          <div className="flex justify-between items-start mb-4">
            <h3 className="serif text-lg text-[#8D6B6B]">Alertas de Estoque</h3>
            <span className="bg-[#FFB3B3] text-white text-[9px] px-2 py-0.5 rounded-full font-bold">URGENTE</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#6B5A5A] font-light">Toxina Botulínica</span>
              <span className="font-bold text-[#A05252] italic">01 un.</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#6B5A5A] font-light">Agulhas 30G</span>
              <span className="font-bold text-[#A05252] italic">02 un.</span>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('inventory')}
            className="w-full mt-4 py-2 bg-white/50 border border-[#E8D3D3] rounded-xl text-xs font-semibold text-[#8D6B6B] hover:bg-white transition-all"
          >
            Solicitar Reposição
          </button>
        </div>

        {/* Quick Finance Summary */}
        <div className="col-span-12 lg:col-span-6 bg-white rounded-3xl p-6 card-shadow border border-[#F2EEE9]">
          <h3 className="serif text-lg text-[#4A4644] mb-4">Fluxo Financeiro</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3 border-b border-[#F2EEE9] pb-3">
              <div className="w-8 h-8 rounded-full bg-[#E5ECE5] flex items-center justify-center text-[#4F634F] shrink-0">
                <ArrowUpRight size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#4A4644] truncate">Mariana Silva</div>
                <div className="text-[9px] text-[#B4A08C] truncate">Recebido - Pix</div>
              </div>
              <div className="text-xs font-bold text-[#4F634F] whitespace-nowrap">+ R$ 1.200</div>
            </div>
            <div className="flex items-center gap-3 border-b border-[#F2EEE9] pb-3 text-opacity-50">
              <div className="w-8 h-8 rounded-full bg-[#F5E6E8] flex items-center justify-center text-[#8D6B6B] shrink-0">
                <ArrowDownRight size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#4A4644] truncate">Dental Cremer</div>
                <div className="text-[9px] text-[#B4A08C] truncate">Saída - Boleto</div>
              </div>
              <div className="text-xs font-bold text-[#8D6B6B] whitespace-nowrap">- R$ 450</div>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('finance')}
            className="mt-6 flex items-center justify-center gap-2 w-full text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest pt-4 border-t border-[#F2EEE9] hover:text-[#4A4644] transition-all"
          >
            Ver Relatório Completo
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, trend, trendUp, icon, color }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl card-shadow border border-[#F2EEE9] hover:scale-[1.02] transition-all duration-300">
      <div className="flex justify-between items-start mb-4">
        <div className="text-[#B4A08C] text-[10px] font-semibold tracking-wider">{label}</div>
        <div className={`p-2 rounded-xl ${color}`}>
          {icon}
        </div>
      </div>
      <div className="serif text-2xl text-[#4A4644]">{value}</div>
      <div className={`text-[10px] mt-2 font-medium ${trendUp ? 'text-[#7FB069]' : 'text-[#A05252]'}`}>
        {trend}
      </div>
    </div>
  );
}

function AppointmentItem({ time, patient, procedure, status, color }: any) {
  return (
    <div className="flex items-center p-4 bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl hover:bg-white transition-all group">
      <div className={`w-10 h-10 rounded-full ${color} flex-shrink-0 mr-4 group-hover:scale-110 transition-transform`}></div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[#4A4644]">{patient}</div>
        <div className="text-[10px] text-[#B4A08C] font-light uppercase tracking-wide">{procedure}</div>
      </div>
      <div className="text-right mr-6">
        <div className="text-xs font-medium text-[#4A4644]">{time}</div>
        <div className={`text-[9px] font-bold uppercase ${status === 'Confirmado' ? 'text-[#7FB069]' : 'text-[#B4A08C]'}`}>
          {status}
        </div>
      </div>
      <div className="flex gap-2">
        <button className="p-2 hover:bg-[#FAF7F2] rounded-lg transition-colors text-[#B4A08C]">
          <Plus size={16} />
        </button>
        <button className="bg-[#D1C7BD] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#D1C7BD]/80 transition-colors shadow-sm">
          Prontuário
        </button>
      </div>
    </div>
  );
}
