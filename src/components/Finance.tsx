import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Transaction } from '../types';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Download, 
  Filter,
  Search,
  Trash2,
  TrendingUp,
  CreditCard,
  DollarSign
} from 'lucide-react';
import { showToast } from '../lib/toast';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function Finance({ user }: { user: User }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date instanceof Timestamp ? data.date.toDate().toISOString() : data.date
        } as Transaction;
      });
      setTransactions(list);
      setLoading(false);
    });
    return unsubscribe;
  }, [user.uid]);

  const filteredTransactions = useMemo(
    () => transactions.filter(t => filter === 'all' ? true : t.type === filter),
    [transactions, filter]
  );

  const { totalIncome, totalExpense, chartData } = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);

    // Prepare chart data for last 6 months
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const lastSix = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth();
      const y = d.getFullYear();
      
      const mIncome = transactions
        .filter(t => {
          const dt = new Date(t.date);
          return dt.getMonth() === m && dt.getFullYear() === y && t.type === 'income';
        })
        .reduce((sum, item) => sum + item.amount, 0);

      const mExpense = transactions
        .filter(t => {
          const dt = new Date(t.date);
          return dt.getMonth() === m && dt.getFullYear() === y && t.type === 'expense';
        })
        .reduce((sum, item) => sum + item.amount, 0);

      lastSix.push({
        name: months[m],
        Entradas: mIncome,
        Saídas: mExpense
      });
    }

    return { 
      totalIncome: income, 
      totalExpense: expense,
      chartData: lastSix
    };
  }, [transactions]);

  const balance = totalIncome - totalExpense;

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta transação?')) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
      showToast('Transação excluída');
    } catch (err) {
      showToast('Erro ao excluir', 'error');
    }
  };

  const handleExportCSV = () => {
    const headers = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'];
    const rows = filteredTransactions.map(t => [
      new Date(t.date).toLocaleDateString('pt-BR'),
      t.description,
      t.category,
      t.type === 'income' ? 'Entrada' : 'Saída',
      t.amount.toString()
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `financeiro-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('Relatório exportado');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Header & Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BalanceCard 
          label="Saldo Disponível" 
          value={balance} 
          icon={<DollarSign size={20} />} 
          color="text-[#374151]" 
          bg="bg-[#F8F9FA]"
        />
        <BalanceCard 
          label="Entradas do Mês" 
          value={totalIncome} 
          icon={<ArrowUpCircle size={20} />} 
          color="text-[#4F634F]" 
          bg="bg-[#E8F5E9]"
        />
        <BalanceCard 
          label="Saídas do Mês" 
          value={totalExpense} 
          icon={<ArrowDownCircle size={20} />} 
          color="text-red-400" 
          bg="bg-red-50"
        />
      </div>

      {/* Financial Flow Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[48px] border border-[#F1F3F5] p-10 shadow-sm"
      >
        <div className="mb-10">
          <h3 className="serif text-2xl text-[#374151]">Fluxo de Caixa</h3>
          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">Comparativo de Entradas e Saídas • Últimos 6 meses</p>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F634F" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#4F634F" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
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
                tickFormatter={(v) => `R$ ${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`}
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '20px', 
                  border: 'none', 
                  boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                  padding: '15px 20px'
                }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area 
                type="monotone" 
                dataKey="Entradas" 
                stroke="#4F634F" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorIncome)" 
                animationDuration={1500}
              />
              <Area 
                type="monotone" 
                dataKey="Saídas" 
                stroke="#ef4444" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorExpense)" 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex bg-white rounded-2xl p-1 border border-[#F1F3F5] shadow-sm">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="Todos" />
          <FilterButton active={filter === 'income'} onClick={() => setFilter('income')} label="Entradas" />
          <FilterButton active={filter === 'expense'} onClick={() => setFilter('expense')} label="Saídas" />
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={handleExportCSV}
            className="flex-1 md:flex-none p-4 bg-white border border-[#F1F3F5] text-[#9CA3AF] rounded-2xl hover:border-[#D1C7BD] transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
          >
            <Download size={18} />
            Relatório
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex-1 md:flex-none p-4 bg-[#D1C7BD] text-white rounded-2xl hover:bg-[#C5B9AD] transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest shadow-md"
          >
            <Plus size={18} />
            Lançar Fluxo
          </button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-[40px] border border-[#F1F3F5] shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-20 text-center text-[#9CA3AF] font-light">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#F1F3F5]">
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Data</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Descrição</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Categoria</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Valor</th>
                  <th className="p-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F5]">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-[#F8F9FA] transition-colors group">
                    <td className="p-6 text-sm font-light text-[#9CA3AF]">{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                    <td className="p-6 font-medium text-[#374151]">{t.description}</td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-[#F8F9FA] text-[#9CA3AF] text-[10px] font-bold uppercase tracking-widest rounded-lg border border-[#F1F3F5]">
                        {t.category}
                      </span>
                    </td>
                    <td className={`p-6 font-semibold ${t.type === 'income' ? 'text-[#4F634F]' : 'text-red-400'}`}>
                      {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-6 text-right">
                      <button 
                        onClick={() => handleDelete(t.id!)}
                        className="p-2 text-[#F1F3F5] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-20 text-center text-[#B4A08C] font-light italic">
                      Nenhuma transação encontrada no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <AddTransactionModal 
            user={user} 
            onClose={() => setIsAdding(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BalanceCard({ label, value, icon, color, bg }: any) {
  return (
    <div className={`${bg} p-8 rounded-[32px] border border-[#F1F3F5] shadow-sm`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 bg-white rounded-xl ${color} shadow-sm`}>{icon}</div>
        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-3xl font-light serif ${color}`}>
        R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function FilterButton({ active, onClick, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
        active ? 'bg-[#D1C7BD] text-white shadow-md' : 'text-[#9CA3AF] hover:bg-[#F8F9FA]'
      }`}
    >
      {label}
    </button>
  );
}

function AddTransactionModal({ user, onClose }: any) {
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const categories = [
    'Estética Facial',
    'Estética Corporal',
    'Buco-Maxilo',
    'Implantes',
    'Manutenção',
    'Operacional',
    'Aluguel',
    'Marketing',
    'Insumos',
    'Outros'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        type,
        amount: parseFloat(amount.replace(',', '.')),
        description,
        category,
        date: Timestamp.now()
      });
      showToast('Lançamento realizado');
      onClose();
    } catch (err) {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-[#374151]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl"
      >
        <h2 className="serif text-2xl text-[#374151] mb-8">Novo Lançamento</h2>
        
        <div className="flex gap-4 mb-8 bg-[#F8F9FA] p-2 rounded-2xl">
          <button 
            onClick={() => setType('income')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${type === 'income' ? 'bg-[#E8F5E9] text-[#4F634F] shadow-sm' : 'text-[#9CA3AF]'}`}
          >
            Entrada
          </button>
          <button 
            onClick={() => setType('expense')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${type === 'expense' ? 'bg-red-50 text-red-400 shadow-sm' : 'text-[#9CA3AF]'}`}
          >
            Saída
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Valor (R$)</label>
            <input 
              required
              type="text"
              placeholder="0,00"
              className="w-full bg-[#F8F9FA] border border-[#F1F3F5] rounded-2xl p-4 text-2xl serif outline-none focus:border-[#D1C7BD]/30 transition-all"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Descrição</label>
            <input 
              required
              className="w-full bg-[#F8F9FA] border border-[#F1F3F5] rounded-2xl p-4 outline-none focus:border-[#D1C7BD]/30 transition-all font-light"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Pagamento Consulta, Compra Insumos..."
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Categoria</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {categories.map(cat => (
                <button 
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border ${
                    category === cat ? 'bg-[#D1C7BD] border-[#D1C7BD] text-white' : 'bg-white border-[#F1F3F5] text-[#9CA3AF] hover:border-[#D1C7BD]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input 
              required
              className="w-full bg-[#F8F9FA] border border-[#F1F3F5] rounded-2xl p-4 outline-none focus:border-[#D1C7BD]/30 transition-all font-light"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="Ou digite outra categoria..."
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#C5B9AD] transition-all"
            >
              {saving ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
