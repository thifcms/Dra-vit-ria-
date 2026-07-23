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

  const { totalIncome, totalExpense } = useMemo(() => ({
    totalIncome: transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0),
    totalExpense: transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0),
  }), [transactions]);

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
          color="text-[#4A4644]" 
          bg="bg-[#FAF7F2]"
        />
        <BalanceCard 
          label="Entradas do Mês" 
          value={totalIncome} 
          icon={<ArrowUpCircle size={20} />} 
          color="text-[#4F634F]" 
          bg="bg-[#D4E2D4]/30"
        />
        <BalanceCard 
          label="Saídas do Mês" 
          value={totalExpense} 
          icon={<ArrowDownCircle size={20} />} 
          color="text-[#8D6B6B]" 
          bg="bg-[#F5E6E8]/40"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex bg-white rounded-2xl p-1 border border-[#F2EEE9] shadow-sm">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="Todos" />
          <FilterButton active={filter === 'income'} onClick={() => setFilter('income')} label="Entradas" />
          <FilterButton active={filter === 'expense'} onClick={() => setFilter('expense')} label="Saídas" />
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={handleExportCSV}
            className="flex-1 md:flex-none p-4 bg-white border border-[#EBE3DB] text-[#B4A08C] rounded-2xl hover:border-[#B4A08C] transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
          >
            <Download size={18} />
            Relatório
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex-1 md:flex-none p-4 bg-[#D1C7BD] text-white rounded-2xl hover:bg-[#D1C7BD]/90 transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest shadow-md"
          >
            <Plus size={18} />
            Lançar Fluxo
          </button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-[40px] border border-[#F2EEE9] shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-20 text-center text-[#B4A08C] font-light">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#F2EEE9]">
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Data</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Descrição</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Categoria</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Valor</th>
                  <th className="p-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2EEE9]">
                {filteredTransactions.map((t) => (
                  <tr key={t.id} className="hover:bg-[#FDFBF9] transition-colors group">
                    <td className="p-6 text-sm font-light text-[#B4A08C]">{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                    <td className="p-6 font-medium text-[#4A4644]">{t.description}</td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-[#FAF7F2] text-[#B4A08C] text-[10px] font-bold uppercase tracking-widest rounded-lg border border-[#EBE3DB]">
                        {t.category}
                      </span>
                    </td>
                    <td className={`p-6 font-semibold ${t.type === 'income' ? 'text-[#4F634F]' : 'text-[#8D6B6B]'}`}>
                      {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-6 text-right">
                      <button 
                        onClick={() => handleDelete(t.id!)}
                        className="p-2 text-[#EBE3DB] hover:text-[#8D6B6B] opacity-0 group-hover:opacity-100 transition-all"
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
    <div className={`${bg} p-8 rounded-[32px] border border-[#F2EEE9] shadow-sm`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 bg-white rounded-xl ${color} shadow-sm`}>{icon}</div>
        <p className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest">{label}</p>
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
        active ? 'bg-[#D1C7BD] text-white shadow-md' : 'text-[#B4A08C] hover:bg-[#FAF7F2]'
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
    <div className="fixed inset-0 bg-[#4A443F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl"
      >
        <h2 className="serif text-2xl text-[#4A4644] mb-8">Novo Lançamento</h2>
        
        <div className="flex gap-4 mb-8 bg-[#FAF7F2] p-2 rounded-2xl">
          <button 
            onClick={() => setType('income')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${type === 'income' ? 'bg-[#D4E2D4] text-[#4F634F] shadow-sm' : 'text-[#B4A08C]'}`}
          >
            Entrada
          </button>
          <button 
            onClick={() => setType('expense')}
            className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${type === 'expense' ? 'bg-[#F5E6E8] text-[#8D6B6B] shadow-sm' : 'text-[#B4A08C]'}`}
          >
            Saída
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Valor (R$)</label>
            <input 
              required
              type="text"
              placeholder="0,00"
              className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 text-2xl serif outline-none focus:border-[#D1C7BD] transition-all"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Descrição</label>
            <input 
              required
              className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Pagamento Consulta, Compra Insumos..."
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Categoria</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {categories.map(cat => (
                <button 
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border ${
                    category === cat ? 'bg-[#D1C7BD] border-[#D1C7BD] text-white' : 'bg-white border-[#F2EEE9] text-[#B4A08C] hover:border-[#D1C7BD]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input 
              required
              className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="Ou digite outra categoria..."
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#B4A08C] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#D1C7BD]/90 transition-all"
            >
              {saving ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
