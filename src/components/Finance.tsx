import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, orderBy, Timestamp, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Transaction } from '../types';
import { User } from 'firebase/auth';
import { motion } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  Filter, 
  Download,
  Plus,
  PieChart,
  BarChart
} from 'lucide-react';

export default function Finance({ user }: { user: User }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'transactions'), 
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      } as Transaction));
      setTransactions(list);
    });
    return unsubscribe;
  }, []);

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);
  
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const balance = totalIncome - totalExpense;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="serif text-3xl text-[#4A4644]">Gestão Financeira</h1>
          <p className="text-[#B4A08C] text-xs font-semibold uppercase tracking-widest mt-1">Fluxo de Caixa & Faturamento Real-time</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-white border border-[#EBE3DB] text-[#B4A08C] px-6 py-3 rounded-full flex items-center gap-2 hover:bg-[#FAF7F2] transition-all shadow-sm font-semibold">
            <Download size={18} />
            <span>Relatório PDF</span>
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-[#D1C7BD] text-white px-6 py-3 rounded-full flex items-center gap-2 hover:bg-[#D1C7BD]/90 transition-all shadow-sm font-bold"
          >
            <Plus size={20} />
            <span>Nova Entrada</span>
          </button>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-3xl card-shadow border border-[#F2EEE9]">
          <div className="text-[#B4A08C] text-[10px] font-bold uppercase tracking-[0.2em] mb-4">TOTAL RECEBIMENTOS</div>
          <div className="flex items-center justify-between">
            <h2 className="serif text-3xl text-[#4F634F]">R$ {totalIncome.toLocaleString()}</h2>
            <div className="w-10 h-10 bg-[#E5ECE5] rounded-full flex items-center justify-center text-[#4F634F]">
              <ArrowUpRight size={20} />
            </div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-3xl card-shadow border border-[#F2EEE9]">
          <div className="text-[#B4A08C] text-[10px] font-bold uppercase tracking-[0.2em] mb-4">TOTAL DESPESAS</div>
          <div className="flex items-center justify-between">
            <h2 className="serif text-3xl text-[#4A4644]">R$ {totalExpense.toLocaleString()}</h2>
            <div className="w-10 h-10 bg-[#FAF7F2] rounded-full flex items-center justify-center text-[#D1C7BD]">
              <ArrowDownRight size={20} />
            </div>
          </div>
        </div>
        <div className="bg-[#FAF7F2] p-8 rounded-3xl border border-[#EBE3DB] card-shadow">
          <div className="text-[#B4A08C] text-[10px] font-bold uppercase tracking-[0.2em] mb-4">SALDO EM CAIXA</div>
          <div className="flex items-center justify-between">
            <h2 className="serif text-3xl text-[#4A4644]">R$ {balance.toLocaleString()}</h2>
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#B4A08C] shadow-sm">
              <DollarSign size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-3xl border border-[#F2EEE9] card-shadow overflow-hidden">
        <div className="p-6 border-b border-[#F2EEE9] flex items-center justify-between bg-[#FDFBF9]">
          <h3 className="serif text-lg text-[#4A4644]">Histórico de Transações</h3>
          <button className="text-[#B4A08C] hover:text-[#4A4644] transition-colors"><Filter size={20} /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF7F2] border-b border-[#F2EEE9]">
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Data</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Descrição</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Categoria</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Valor</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2EEE9]">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-[#FDFBF9] transition-colors">
                  <td className="p-6 text-sm font-light text-[#B4A08C]">
                    {t.date.toLocaleDateString('pt-BR')}
                  </td>
                  <td className="p-6 font-semibold text-[#4A4644]">{t.description}</td>
                  <td className="p-6">
                    <span className="px-3 py-1 bg-[#FAF7F2] text-[#B4A08C] text-[9px] font-bold uppercase tracking-widest rounded-lg border border-[#EBE3DB]">
                      {t.category}
                    </span>
                  </td>
                  <td className={`p-6 font-bold ${t.type === 'income' ? 'text-[#4F634F]' : 'text-[#8D6B6B]'}`}>
                    {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString()}
                  </td>
                  <td className="p-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                      t.type === 'income' ? 'bg-[#D4E2D4] text-[#4F634F]' : 'bg-[#FAF7F2] text-[#B4A08C]'
                    }`}>
                      {t.type === 'income' ? 'Recebido' : 'Pago'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-[#4A443F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-lg rounded-[32px] p-10 shadow-2xl"
          >
            <h2 className="text-2xl font-light mb-8">Nova Transação</h2>
            <AddTransactionForm user={user} onClose={() => setIsAdding(false)} />
          </motion.div>
        </div>
      )}
    </div>
  );
}

function AddTransactionForm({ user, onClose }: { user: User, onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        amount: Number(amount),
        type,
        category,
        description,
        date: Timestamp.now()
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Valor (R$)</label>
          <input 
            type="number"
            step="0.01"
            required
            className="w-full bg-[#FDFCFB] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Tipo</label>
          <select 
            className="w-full bg-[#FDFCFB] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light appearance-none"
            value={type}
            onChange={e => setType(e.target.value as any)}
          >
            <option value="income">Entrada (Faturamento)</option>
            <option value="expense">Saída (Despesa)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Categoria</label>
          <input 
            required
            className="w-full bg-[#FDFCFB] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="ex: Botox, Aluguel..."
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Descrição</label>
          <input 
            required
            className="w-full bg-[#FDFCFB] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onClose} className="flex-1 py-4 border border-[#F2EEE9] text-[#B4A08C] rounded-2xl font-light hover:bg-[#FAF7F2]">Cancelar</button>
        <button type="submit" className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-light hover:bg-[#D1C7BD]/90 shadow-md">Registrar</button>
      </div>
    </form>
  );
}
