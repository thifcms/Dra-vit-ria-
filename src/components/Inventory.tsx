import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { InventoryItem, InventoryMovement } from '../types';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Package, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownLeft,
  Trash2,
  History,
  TrendingUp,
  Tag
} from 'lucide-react';
import { showToast } from '../lib/toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Inventory({ user }: { user: User }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sincronizar itens de estoque em tempo real
    const q = query(collection(db, 'inventory'), where('userId', '==', user.uid));
    const unsubscribeItems = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      setLoading(false);
    });

    // Sincronizar últimos 100 movimentos
    const mQ = query(
      collection(db, 'inventoryMovements'), 
      where('userId', '==', user.uid),
      orderBy('date', 'desc'),
      limit(100)
    );
    const unsubscribeMoves = onSnapshot(mQ, (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryMovement)));
    });

    return () => {
      unsubscribeItems();
      unsubscribeMoves();
    };
  }, [user.uid]);

  const stats = useMemo(() => {
    const lowStock = items.filter(i => i.quantity <= i.minThreshold).length;
    const totalItems = items.length;
    
    // Consumo por categoria (últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const consumptionMap = new Map<string, number>();
    
    movements
      .filter(m => m.type === 'consumption' && new Date(m.date) >= thirtyDaysAgo)
      .forEach(m => {
        const cat = m.category || 'Geral';
        consumptionMap.set(cat, (consumptionMap.get(cat) || 0) + m.quantity);
      });

    const consumptionData = Array.from(consumptionMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { lowStock, totalItems, consumptionData };
  }, [items, movements]);

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este item permanentemente?')) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
      showToast('Item removido do estoque');
    } catch (err) {
      showToast('Erro ao remover item', 'error');
    }
  };

  const handleUpdateStock = async (item: InventoryItem, amount: number, type: 'consumption' | 'restock') => {
    const newQty = type === 'restock' ? item.quantity + amount : item.quantity - amount;
    if (newQty < 0) {
      showToast('Quantidade insuficiente em estoque', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'inventory', item.id!), { 
        quantity: newQty,
        ...(type === 'restock' ? { lastRestockDate: new Date().toISOString() } : {})
      });

      await addDoc(collection(db, 'inventoryMovements'), {
        userId: user.uid,
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        quantity: amount,
        type,
        date: new Date().toISOString()
      });

      showToast(type === 'restock' ? 'Estoque reabastecido' : 'Consumo registrado');
    } catch (err) {
      showToast('Erro ao atualizar estoque', 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#F8F9FA] rounded-2xl text-[#D1C7BD] border border-[#F1F3F5]">
            <Package size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-light text-[#374151] serif">Estoque & Insumos</h1>
            <p className="text-[#9CA3AF] font-light text-xs uppercase tracking-widest mt-1">Materiais e Controle de Consumo</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#D1C7BD] text-white px-8 py-4 rounded-2xl flex items-center gap-2 hover:bg-[#C5B9AD] transition-all shadow-md active:scale-95 font-medium"
        >
          <Plus size={20} />
          <span>Cadastrar Material</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <InventoryStatCard 
          icon={<TrendingUp size={20} />} 
          label="Total de Materiais" 
          value={stats.totalItems} 
          sub="Itens catalogados"
        />
        <InventoryStatCard 
          icon={<AlertTriangle size={20} />} 
          label="Estoque Baixo" 
          value={stats.lowStock} 
          sub="Abaixo do limite mínimo"
          alert={stats.lowStock > 0}
        />
        <div className="bg-white rounded-[32px] p-8 border border-[#F1F3F5] shadow-sm flex flex-col justify-center">
          <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-4">Consumo por Categoria (30 dias)</h4>
          <div className="h-24 w-full">
            {stats.consumptionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.consumptionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F3F5" />
                  <XAxis dataKey="name" hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontSize: '10px' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {stats.consumptionData.map((_, i) => (
                      <Cell key={i} fill={['#D1C7BD', '#A3988E', '#C5B9AD'][i % 3]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[10px] text-[#9CA3AF] italic text-center py-4">Sem dados de consumo recentes.</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-[#F1F3F5] shadow-sm overflow-hidden min-h-[400px]">
        <div className="p-8 border-b border-[#F1F3F5] flex items-center gap-6 bg-[#F8F9FA]">
          <div className="flex-1 max-w-md bg-white border border-[#F1F3F5] rounded-2xl px-6 py-3 flex items-center gap-4 shadow-sm focus-within:border-[#D1C7BD]/30 transition-all">
            <Search size={20} className="text-[#9CA3AF]" />
            <input 
              type="text" 
              placeholder="Buscar material ou categoria..." 
              className="flex-1 outline-none font-light text-[#374151] placeholder-[#9CA3AF] bg-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-[#9CA3AF] font-light italic">Sincronizando estoque...</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-[#F1F3F5]">
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Material</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Status Estoque</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Última Reposição</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Ações</th>
                  <th className="p-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F5]">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#F8F9FA]/50 transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-sm transition-all ${item.quantity <= item.minThreshold ? 'bg-red-50 border-red-100 text-red-400' : 'bg-white border-[#F1F3F5] text-[#D1C7BD]'}`}>
                          <Tag size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-[#374151]">{item.name}</p>
                          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">{item.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-light serif text-[#374151]">{item.quantity}</span>
                        <span className="text-[10px] text-[#9CA3AF] font-medium">{item.unit}</span>
                        {item.quantity <= item.minThreshold && (
                          <span className="px-2 py-0.5 bg-red-50 text-red-400 text-[8px] font-bold uppercase tracking-widest rounded-full">Crítico</span>
                        )}
                      </div>
                      <div className="w-24 h-1 bg-[#F1F3F5] rounded-full mt-2 overflow-hidden">
                        <div 
                          className={`h-full transition-all ${item.quantity <= item.minThreshold ? 'bg-red-400' : 'bg-[#D1C7BD]'}`} 
                          style={{ width: `${Math.min(100, (item.quantity / (item.minThreshold * 2)) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="p-6 text-xs text-[#9CA3AF] font-light">
                      {item.lastRestockDate ? new Date(item.lastRestockDate).toLocaleDateString('pt-BR') : 'Sem registro'}
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleUpdateStock(item, 1, 'consumption')}
                          className="p-2 text-[#9CA3AF] hover:text-red-400 hover:bg-red-50 rounded-xl transition-all"
                          title="Registrar Consumo (-1)"
                        >
                          <ArrowDownLeft size={18} />
                        </button>
                        <button 
                          onClick={() => handleUpdateStock(item, 1, 'restock')}
                          className="p-2 text-[#9CA3AF] hover:text-[#4F634F] hover:bg-[#E8F5E9] rounded-xl transition-all"
                          title="Registrar Reposição (+1)"
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                    </td>
                    <td className="p-6 text-right">
                      <button 
                        onClick={() => handleDelete(item.id!)}
                        className="p-2 text-[#F1F3F5] hover:text-red-400 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-20 text-center text-[#9CA3AF] font-light italic">
                      Nenhum material encontrado no estoque.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Movimentações Recentes */}
      <div className="bg-white rounded-[40px] border border-[#F1F3F5] shadow-sm p-8">
        <h3 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
          <History size={14} className="text-[#D1C7BD]" /> Histórico de Movimentações
        </h3>
        <div className="space-y-4">
          {movements.slice(0, 8).map(m => (
            <div key={m.id} className="flex items-center justify-between p-4 bg-[#F8F9FA] rounded-2xl border border-[#F1F3F5]">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-xl ${m.type === 'restock' ? 'bg-[#E8F5E9] text-[#4F634F]' : 'bg-red-50 text-red-400'}`}>
                  {m.type === 'restock' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#374151]">{m.itemName}</p>
                  <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-widest">
                    {m.type === 'restock' ? 'Entrada' : 'Saída'} • {new Date(m.date).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <span className={`text-sm font-bold serif ${m.type === 'restock' ? 'text-[#4F634F]' : 'text-red-400'}`}>
                {m.type === 'restock' ? '+' : '-'}{m.quantity}
              </span>
            </div>
          ))}
          {movements.length === 0 && (
            <p className="text-center py-10 text-xs text-[#9CA3AF] font-light italic">Nenhuma movimentação registrada ainda.</p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <AddMaterialModal user={user} onClose={() => setIsAdding(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function InventoryStatCard({ icon, label, value, sub, alert }: any) {
  return (
    <div className={`bg-white rounded-[32px] p-8 border shadow-sm transition-all ${alert ? 'border-red-100 bg-red-50/10' : 'border-[#F1F3F5]'}`}>
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-6 ${alert ? 'bg-red-50 text-red-400' : 'bg-[#F8F9FA] text-[#D1C7BD]'}`}>
        {icon}
      </div>
      <h3 className="serif text-3xl text-[#374151] leading-tight">{value}</h3>
      <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mt-2">{label}</p>
      <p className="text-[10px] text-[#9CA3AF] font-light mt-1">{sub}</p>
    </div>
  );
}

function AddMaterialModal({ user, onClose }: any) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [minThreshold, setMinThreshold] = useState('');
  const [unit, setUnit] = useState('Unidades');
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
        quantity: parseFloat(quantity) || 0,
        minThreshold: parseFloat(minThreshold) || 0,
        unit,
        updatedAt: new Date().toISOString()
      });
      showToast('Material cadastrado com sucesso');
      onClose();
    } catch (err) {
      showToast('Erro ao cadastrar material', 'error');
    } finally {
      setSaving(false);
    }
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
        <h2 className="serif text-2xl text-[#374151] mb-8">Novo Material</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <FormField label="Nome do Material" value={name} onChange={setName} placeholder="ex: Luvas de Nitrilo, Botox 50U..." />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Categoria" value={category} onChange={setCategory} placeholder="ex: Descartáveis, Toxinas..." />
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Unidade</label>
              <select 
                className="w-full bg-[#F8F9FA] border border-[#F1F3F5] rounded-2xl p-4 outline-none focus:border-[#D1C7BD]/30 transition-all font-light appearance-none text-sm"
                value={unit}
                onChange={e => setUnit(e.target.value)}
              >
                <option value="Unidades">Unidades (un)</option>
                <option value="Caixas">Caixas (cx)</option>
                <option value="Ml">Mililitros (ml)</option>
                <option value="Frascos">Frascos (fr)</option>
                <option value="Pares">Pares (pr)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Quantidade Atual" value={quantity} onChange={setQuantity} placeholder="0" type="number" />
            <FormField label="Aviso de Estoque Baixo" value={minThreshold} onChange={setMinThreshold} placeholder="ex: 5" type="number" />
          </div>
          
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#C5B9AD] transition-all"
            >
              {saving ? 'Gravando...' : 'Cadastrar Material'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest ml-1">{label}</label>
      <input 
        type={type}
        required
        className="w-full bg-[#F8F9FA] border border-[#F1F3F5] rounded-2xl p-4 outline-none focus:border-[#D1C7BD]/30 transition-all font-light text-sm"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
