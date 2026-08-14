import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { InventoryItem } from '../types';
import { nearestExpiry, daysUntil } from '../lib/inventoryBatches';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

// Avisa proativamente quando algum lote do estoque está perto de vencer (30 dias) ou já
// venceu — antes só existia um selo passivo na tela de Estoque, que só quem fosse
// procurar via. Sempre ativo (App.tsx), independente de qual aba está aberta, avisa uma
// vez por dia — mesmo princípio do aviso de backup e de falta automática.
export default function ExpiryAlert({ user, isAdminUser }: { user: User; isAdminUser: boolean }) {
  const [expiringItems, setExpiringItems] = useState<{ name: string; days: number }[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const checkedTodayRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAdminUser) return;
    const unsubscribe = onSnapshot(collection(db, 'inventory'), (snap) => {
      const todayStr = new Date().toISOString().split('T')[0];
      if (checkedTodayRef.current === todayStr) return;
      checkedTodayRef.current = todayStr;

      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));
      const expiring: { name: string; days: number }[] = [];
      items.forEach(item => {
        const nearest = nearestExpiry(item.batches);
        if (!nearest) return;
        const days = daysUntil(nearest);
        if (days <= 30) expiring.push({ name: item.name, days });
      });
      expiring.sort((a, b) => a.days - b.days);
      if (expiring.length > 0) setExpiringItems(expiring);
    });
    return () => unsubscribe();
  }, [isAdminUser]);

  if (expiringItems.length === 0 || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-6 z-40 max-w-sm bg-white rounded-[28px] border border-[#F5F2F0] shadow-xl p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center text-red-400 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <button onClick={() => setDismissed(true)} className="text-[#9CA3AF] hover:text-[#4A433D]">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-[#4A433D] font-medium mb-3">Lotes vencendo no estoque</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {expiringItems.slice(0, 6).map((it, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-[#4A433D]">{it.name}</span>
              <span className={`font-bold px-2 py-0.5 rounded-full ${it.days < 0 ? 'bg-red-50 text-red-400' : 'bg-amber-50 text-amber-600'}`}>
                {it.days < 0 ? `Vencido há ${Math.abs(it.days)}d` : it.days === 0 ? 'Vence hoje' : `${it.days}d`}
              </span>
            </div>
          ))}
        </div>
        {expiringItems.length > 6 && (
          <p className="text-[10px] text-[#9CA3AF] mt-2">+ {expiringItems.length - 6} outro(s) — veja tudo em Estoque</p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
