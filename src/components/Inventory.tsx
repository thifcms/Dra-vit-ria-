import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { InventoryItem } from '../types';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  Package, 
  ArrowRight,
  TrendingDown,
  Trash2,
  Edit2,
  ChevronRight,
  PieChart as PieChartIcon,
  Activity
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from 'recharts';
import { showToast } from '../lib/toast';

const COLORS = ['#D1C7BD', '#4A4644', '#B4A08C', '#EBE3DB', '#F2EEE9'];

export default function Inventory({ user }: { user: User }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'inventory'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(list);
      setLoading(false);
    });
    return unsubscribe;
  }, [user.uid]);

  const filteredItems = useMemo(() => items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase())
  ), [items, searchTerm]);

  const lowStockItems = useMemo(() => items.filter(item => item.quantity <= item.minThreshold), [items]);

  // Prepare chart data
  const categoryData = useMemo(() => items.reduce((acc: any[], item) => {
    const catName = item.category || 'Geral';
    const existing = acc.find(a => a.name === catName);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: catName, value: 1 });
    }
    return acc;
  }, []), [items]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este item do estoque?')) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
      showToast('Item removido');
    } catch (err) {
      showToast('Erro ao remover', 'error');
    }
  };

  const updateQuantity = async (id: string, delta: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      await updateDoc(doc(db, 'inventory', id), {
        quantity: Math.max(0, item.quantity + delta)
      });
      if (item.quantity + delta <= item.minThreshold && delta < 0) {
        showToast(`Atenção: ${item.name} com estoque baixo!`, 'info');
      }
    } catch (err) {
      showToast('Erro ao atualizar', 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Inventory Dashboard Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[#4A4644] text-white p-12 rounded-[48px] flex flex-col justify-between min-h-[350px] relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-white/10 rounded-2xl">
                <Package size={24} className="text-[#D1C7BD]" />
              </div>
              <h2 className="text-3xl font-light serif italic">Controle de Estoque</h2>
            </div>
            <p className="text-white/60 font-light max-w-sm leading-relaxed text-lg mb-8">
              Gerencie seus insumos com <span className="text-[#D1C7BD] font-medium">precisão clínica</span>. Acompanhe a disponibilidade e receba alertas automáticos de reposição.
            </p>
          </div>

          <div className="relative z-10 flex gap-6">
            <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl flex-1 border border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Total de Itens</p>
              <p className="text-4xl font-light serif">{items.length}</p>
            </div>
            <div className={`p-6 rounded-3xl flex-1 border ${lowStockItems.length > 0 ? 'bg-red-400/20 border-red-400/30' : 'bg-white/10 border-white/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Itens Críticos</p>
                {lowStockItems.length > 0 && <AlertTriangle size={14} className="text-red-400" />}
              </div>
              <p className={`text-4xl font-light serif ${lowStockItems.length > 0 ? 'text-red-400' : 'text-white'}`}>{lowStockItems.length}</p>
            </div>
          </div>

          <div className="absolute right-0 top-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3 blur-3xl" />
        </div>

        <div className="bg-white rounded-[48px] border border-[#F2EEE9] p-10 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-8">
              <h3 className="serif text-xl text-[#4A4644]">Distribuição</h3>
              <PieChartIcon size={20} className="text-[#D1C7BD]" />
            </div>
            
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            {categoryData.slice(0, 3).map((cat, i) => (
              <div key={cat.name} className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[#B4A08C]">{cat.name}</span>
                </div>
                <span className="text-[#4A4644]">{cat.value} itens</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Inventory Card */}
      <div className="bg-white rounded-[40px] border border-[#F2EEE9] card-shadow overflow-hidden">
        <div className="p-8 border-b border-[#F2EEE9] bg-[#FDFBF9] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-1 max-w-md bg-white border border-[#EBE3DB] rounded-2xl px-6 py-3 shadow-sm group focus-within:border-[#B4A08C] transition-all">
            <Search size={20} className="text-[#B4A08C]" />
            <input 
              type="text" 
              placeholder="Buscar insumo..." 
              className="flex-1 outline-none font-light text-[#4A4644] placeholder-[#B4A08C]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-[#D1C7BD] text-white px-8 py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#D1C7BD]/90 transition-all shadow-md font-medium text-sm whitespace-nowrap"
          >
            <Plus size={20} /> Adicionar Insumo
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-20 text-center text-[#B4A08C] font-light italic">Sincronizando estoque...</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#F2EEE9]">
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Insumo</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Categoria</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Qtd. Atual</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Mínimo</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Controles</th>
                  <th className="p-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2EEE9]">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#FDFBF9] transition-colors group">
                    <td className="p-6">
                      <p className="font-semibold text-[#4A4644]">{item.name}</p>
                    </td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-[#FAF7F2] text-[#B4A08C] text-[10px] font-bold uppercase tracking-widest rounded-lg border border-[#EBE3DB]">
                        {item.category || 'Geral'}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-light serif ${item.quantity <= item.minThreshold ? 'text-[#8D6B6B] font-bold' : 'text-[#4A4644]'}`}>
                          {item.quantity}
                        </span>
                        <span className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest">{item.unit || 'unid.'}</span>
                      </div>
                    </td>
                    <td className="p-6 text-sm text-[#B4A08C] font-light">{item.minThreshold} {item.unit || 'unid.'}</td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => updateQuantity(item.id!, -1)}
                          className="w-12 h-12 rounded-2xl bg-[#FAF7F2] border border-[#F2EEE9] text-[#B4A08C] flex items-center justify-center hover:bg-[#F5E6E8] hover:text-[#8D6B6B] hover:border-[#E8D3D3] transition-all shadow-sm active:scale-90 font-bold"
                        >
                          -
                        </button>
                        <button 
                          onClick={() => updateQuantity(item.id!, 1)}
                          className="w-12 h-12 rounded-2xl bg-[#D1C7BD]/10 border border-[#D1C7BD]/30 text-[#D1C7BD] flex items-center justify-center hover:bg-[#D1C7BD] hover:text-white transition-all shadow-sm active:scale-90 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="p-6 text-right">
                      <button 
                        onClick={() => handleDelete(item.id!)}
                        className="p-2 text-[#EBE3DB] hover:text-[#8D6B6B] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-20 text-center text-[#B4A08C] font-light italic">
                      Nenhum item encontrado no estoque.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <AddItemModal 
            user={user} 
            onClose={() => setIsAdding(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddItemModal({ user, onClose }: any) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [minThreshold, setMinThreshold] = useState('');
  const [unit, setUnit] = useState('unid.');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'inventory'), {
        userId: user.uid,
        name,
        category,
        quantity: parseInt(quantity),
        minThreshold: parseInt(minThreshold),
        unit,
        updatedAt: new Date().toISOString()
      });
      showToast('Insumo cadastrado');
      onClose();
    } catch (err) {
      showToast('Erro ao cadastrar', 'error');
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
        <h2 className="serif text-2xl text-[#4A4644] mb-8">Novo Insumo</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Nome do Material</label>
            <input 
              required
              className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ex: Toxina Botulínica, Agulha 30G..."
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Qtd. Inicial</label>
              <input 
                required
                type="number"
                className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Estoque Mínimo</label>
              <input 
                required
                type="number"
                className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
                value={minThreshold}
                onChange={e => setMinThreshold(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Unidade</label>
              <select 
                className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light appearance-none"
                value={unit}
                onChange={e => setUnit(e.target.value)}
              >
                <option value="unid.">Unidades</option>
                <option value="ml">Mililitros (ml)</option>
                <option value="caixas">Caixas</option>
                <option value="pacotes">Pacotes</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Categoria</label>
              <input 
                className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="ex: Estética, Descartáveis"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#B4A08C] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#D1C7BD]/90 transition-all"
            >
              {saving ? 'Cadastrando...' : 'Confirmar Estoque'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
