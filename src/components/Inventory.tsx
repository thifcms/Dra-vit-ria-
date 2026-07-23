import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { InventoryItem } from '../types';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  Package, 
  ChevronRight, 
  Edit2, 
  Trash2,
  Minus,
  PlusCircle
} from 'lucide-react';

export default function Inventory({ user }: { user: User }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'inventory'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(list);
    });
    return unsubscribe;
  }, []);

  const lowStockItems = items.filter(item => item.quantity <= item.minThreshold);
  const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleUpdateQuantity = async (id: string, newQty: number) => {
    if (newQty < 0) return;
    await updateDoc(doc(db, 'inventory', id), { quantity: newQty });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="serif text-3xl text-[#4A4644]">Estoque de Insumos</h1>
          <p className="text-[#B4A08C] text-xs font-semibold uppercase tracking-widest mt-1">Materiais Cirúrgicos & Odontológicos</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#D1C7BD] text-white px-6 py-3 rounded-full flex items-center gap-2 hover:bg-[#D1C7BD]/90 transition-all shadow-sm font-semibold"
        >
          <Plus size={20} />
          <span>Novo Item</span>
        </button>
      </div>

      {/* Alerts */}
      <AnimatePresence>
        {lowStockItems.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#FAF7F2] border border-[#EBE3DB] rounded-3xl p-6 flex items-start gap-5 shadow-sm"
          >
            <div className="bg-[#D1C7BD] p-2.5 rounded-xl text-white shadow-sm">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h4 className="text-[#8D6B6B] font-bold text-xs uppercase tracking-widest">Atenção Necessária</h4>
              <p className="text-[#B4A08C] text-sm font-light mt-1">
                {lowStockItems.length} insumos atingiram o limite crítico de reposição.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {lowStockItems.map(item => (
                  <span key={item.id} className="bg-white px-3 py-1.5 rounded-xl text-[10px] font-bold text-[#4A4644] border border-[#EBE3DB] shadow-sm">
                    {item.name}: {item.quantity} {item.unit}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-3xl border border-[#F2EEE9] card-shadow overflow-hidden">
        <div className="p-6 border-b border-[#F2EEE9] flex items-center gap-4 bg-[#FDFBF9]">
          <Search size={20} className="text-[#B4A08C]" />
          <input 
            type="text" 
            placeholder="Buscar por insumo..." 
            className="flex-1 outline-none font-light text-[#4A4644] placeholder-[#B4A08C] bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF7F2] border-b border-[#F2EEE9]">
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Insumo</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Categoria</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Disponibilidade</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Status</th>
                <th className="p-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2EEE9]">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-[#FDFBF9] transition-colors group">
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#FAF7F2] border border-[#EBE3DB] flex items-center justify-center text-[#B4A08C]">
                        <Package size={20} />
                      </div>
                      <div>
                        <span className="font-semibold text-[#4A4644] block">{item.name}</span>
                        <span className="text-[9px] text-[#B4A08C] font-bold uppercase tracking-widest">{item.code || 'S/ Código'} • {item.supplier || 'S/ Fornecedor'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-sm font-light text-[#B4A08C]">{item.category}</td>
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleUpdateQuantity(item.id!, item.quantity - 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EBE3DB] text-[#B4A08C] hover:bg-[#FAF7F2] hover:text-[#D1C7BD] transition-all"
                        >
                          <Minus size={14} />
                        </button>
                        <div className="w-14 text-center font-bold text-sm text-[#4A4644]">
                          {item.quantity}
                        </div>
                        <button 
                          onClick={() => handleUpdateQuantity(item.id!, item.quantity + 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EBE3DB] text-[#B4A08C] hover:bg-[#FAF7F2] hover:text-[#D1C7BD] transition-all"
                        >
                          <PlusCircle size={14} />
                        </button>
                      </div>
                      <span className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest">{item.unit}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    {item.quantity <= item.minThreshold ? (
                      <span className="px-3 py-1 bg-[#8D6B6B] text-white text-[9px] font-bold uppercase tracking-widest rounded-full shadow-sm">Crítico</span>
                    ) : (
                      <span className="px-3 py-1 bg-[#D1C7BD] text-white text-[9px] font-bold uppercase tracking-widest rounded-full shadow-sm">Adequado</span>
                    )}
                  </td>
                  <td className="p-6 text-right">
                    <button className="p-2 text-[#B4A08C] hover:text-[#4A4644] transition-colors"><Edit2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <AddItemModal user={user} onClose={() => setIsAdding(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddItemModal({ user, onClose }: { user: User, onClose: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [minThreshold, setMinThreshold] = useState(0);
  const [unit, setUnit] = useState('un');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'inventory'), {
        userId: user.uid,
        name,
        code,
        supplier,
        category,
        quantity: Number(quantity),
        minThreshold: Number(minThreshold),
        unit,
        lastRestockDate: new Date().toISOString()
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#4A443F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#FDFBF9] w-full max-w-2xl rounded-[32px] p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <h2 className="text-2xl font-semibold serif mb-8 text-[#4A4644]">Cadastrar Novo Insumo</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2">Nome do Insumo</label>
              <input 
                required
                className="w-full bg-white border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light shadow-sm"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2">Código do Item</label>
              <input 
                className="w-full bg-white border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light shadow-sm"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2">Fornecedor Principal</label>
              <input 
                className="w-full bg-white border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light shadow-sm"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2">Categoria</label>
              <select 
                className="w-full bg-white border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light appearance-none shadow-sm"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">Selecione...</option>
                <option value="Cirúrgico">Cirúrgico</option>
                <option value="Odontológico">Odontológico</option>
                <option value="Facial">Facial</option>
                <option value="Injetável">Injetável</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2">Unidade de Medida</label>
              <input 
                placeholder="ex: un, ml, cx, frasco"
                className="w-full bg-white border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light shadow-sm"
                value={unit}
                onChange={e => setUnit(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2">Quantidade Inicial</label>
              <input 
                type="number"
                className="w-full bg-white border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light shadow-sm"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2">Estoque Mínimo (Alerta)</label>
              <input 
                type="number"
                className="w-full bg-white border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light shadow-sm"
                value={minThreshold}
                onChange={e => setMinThreshold(Number(e.target.value))}
              />
            </div>
          </div>
          
          <div className="flex gap-4 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-4 border border-[#EBE3DB] text-[#B4A08C] rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#FAF7F2] transition-all"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#D1C7BD]/90 transition-all shadow-md"
            >
              Confirmar Cadastro
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
