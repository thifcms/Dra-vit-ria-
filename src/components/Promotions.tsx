import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Patient, InventoryItem } from '../types';
import { openWhatsApp } from '../lib/reminders';
import { nearestExpiry, daysUntil } from '../lib/inventoryBatches';
import { showToast } from '../lib/toast';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Search, CheckCircle2, X, MessageCircle, AlertTriangle, Users } from 'lucide-react';

// Promoções — envio de mensagem em massa pra pacientes selecionados, "como se fosse um
// grupo". O WhatsApp não deixa mandar mensagem pra várias pessoas de uma vez só a
// partir do navegador (isso só existe via API paga do WhatsApp Business) — a forma
// honesta de aproximar isso é uma FILA: seleciona todo mundo, e vai passando um por um,
// cada clique abrindo o WhatsApp já com a mensagem pronta pra aquele paciente
// específico, só precisando apertar enviar lá.
export default function Promotions({ user }: { user: User }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [sendingQueue, setSendingQueue] = useState<Patient[] | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, 'patients'), (snap) => {
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
    });
    const unsub2 = onSnapshot(collection(db, 'inventory'), (snap) => {
      setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  // Itens com lote vencendo em até 45 dias — janela um pouco maior que o aviso comum
  // (30 dias), já que aqui a ideia é dar tempo de planejar e rodar a promoção antes do
  // vencimento chegar de verdade
  const expiringItems = useMemo(() => {
    return inventoryItems
      .map(item => {
        const nearest = nearestExpiry(item.batches);
        if (!nearest) return null;
        const days = daysUntil(nearest);
        if (days > 45) return null;
        return { name: item.name, days };
      })
      .filter((x): x is { name: string; days: number } => !!x)
      .sort((a, b) => a.days - b.days);
  }, [inventoryItems]);

  const filteredPatients = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) && p.phone
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filteredPatients.map(p => p.id!)));
  const clearSelection = () => setSelectedIds(new Set());

  const useExpirySuggestion = (itemName: string) => {
    setMessage(`Olá, {nome}! 🎉 Estamos com uma condição especial em ${itemName} por tempo limitado — que tal aproveitar? Responda essa mensagem pra saber mais!`);
    showToast('Sugestão aplicada — ajuste o texto se quiser antes de enviar');
  };

  const handleStartSending = () => {
    if (selectedIds.size === 0) {
      showToast('Selecione ao menos um paciente', 'error');
      return;
    }
    if (!message.trim()) {
      showToast('Escreva a mensagem antes de enviar', 'error');
      return;
    }
    const queue = patients.filter(p => selectedIds.has(p.id!));
    setSendingQueue(queue);
    setQueueIndex(0);
    setSentCount(0);
  };

  const currentQueuePatient = sendingQueue?.[queueIndex];
  const personalizedMessage = currentQueuePatient
    ? message.replace(/\{nome\}/g, currentQueuePatient.name.split(' ')[0])
    : '';

  const handleSendCurrent = () => {
    if (!currentQueuePatient?.phone) return;
    openWhatsApp(currentQueuePatient.phone, personalizedMessage);
    setSentCount(prev => prev + 1);
  };

  const handleNextInQueue = () => {
    if (!sendingQueue) return;
    if (queueIndex + 1 >= sendingQueue.length) {
      showToast(`Envio concluído — ${sentCount} mensagem(ns) enviada(s)`);
      setSendingQueue(null);
      setSelectedIds(new Set());
      setMessage('');
      return;
    }
    setQueueIndex(prev => prev + 1);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="serif text-2xl text-[#4A433D]">Promoções</h3>
          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">
            Mensagem em massa pra pacientes selecionados, via WhatsApp
          </p>
        </div>
      </div>

      <div className="p-5 bg-amber-50 border border-amber-100 rounded-3xl flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Lembrete: publicidade em odontologia/estética segue as normas éticas do conselho profissional (CFO/CRO) —
          evite promessas de resultado ou linguagem de venda agressiva.
        </p>
      </div>

      {expiringItems.length > 0 && (
        <div className="p-8 bg-white rounded-[32px] border border-[#F5F2F0] shadow-sm">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-4">
            Sugestão — produtos com validade próxima, aproveite antes de perder
          </p>
          <div className="flex flex-wrap gap-3">
            {expiringItems.map(item => (
              <button
                key={item.name}
                onClick={() => useExpirySuggestion(item.name)}
                className="flex items-center gap-2 px-5 py-3 bg-[#FDF3E7] text-amber-700 rounded-2xl text-xs font-medium hover:bg-amber-100 transition-all"
              >
                {item.name}
                <span className="text-[9px] font-bold uppercase tracking-widest bg-white px-2 py-0.5 rounded-full">
                  {item.days < 0 ? `vencido há ${Math.abs(item.days)}d` : `${item.days}d`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="p-8 bg-white rounded-[32px] border border-[#F5F2F0] shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest flex items-center gap-2">
              <Users size={14} /> Destinatários ({selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''})
            </p>
            <div className="flex gap-3">
              <button onClick={selectAll} className="text-[10px] font-bold text-[#8BA888] uppercase tracking-widest">Marcar todos</button>
              <button onClick={clearSelection} className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Limpar</button>
            </div>
          </div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar paciente..."
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl pl-11 pr-4 py-3 text-sm outline-none focus:border-[#EADFD4]/30 transition-all"
            />
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {filteredPatients.map(p => (
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id!)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-[#FDFBF9] transition-all text-left"
              >
                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 ${selectedIds.has(p.id!) ? 'bg-[#8BA888] border-[#8BA888]' : 'border-[#F5F2F0]'}`}>
                  {selectedIds.has(p.id!) && <CheckCircle2 size={14} className="text-white" />}
                </div>
                <span className="text-sm text-[#4A433D]">{p.name}</span>
              </button>
            ))}
            {filteredPatients.length === 0 && (
              <p className="text-xs text-[#9CA3AF] italic text-center py-8">
                Nenhum paciente com telefone cadastrado encontrado.
              </p>
            )}
          </div>
        </div>

        <div className="p-8 bg-white rounded-[32px] border border-[#F5F2F0] shadow-sm flex flex-col">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-4">Mensagem</p>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Digite a mensagem — use {nome} pra personalizar com o primeiro nome de cada paciente"
            rows={8}
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 text-sm outline-none focus:border-[#EADFD4]/30 transition-all resize-none flex-1"
          />
          <p className="text-[10px] text-[#9CA3AF] mt-2">Use <strong>{'{nome}'}</strong> pra personalizar — vira o primeiro nome de cada paciente.</p>
          <button
            onClick={handleStartSending}
            className="w-full mt-6 py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all flex items-center justify-center gap-2"
          >
            <Send size={16} /> Iniciar Envio ({selectedIds.size})
          </button>
        </div>
      </div>

      <AnimatePresence>
        {sendingQueue && currentQueuePatient && (
          <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-md z-[70] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[32px] p-8 max-w-sm w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">
                  {queueIndex + 1} de {sendingQueue.length}
                </p>
                <button onClick={() => setSendingQueue(null)} className="text-[#9CA3AF] hover:text-[#4A433D]">
                  <X size={20} />
                </button>
              </div>
              <p className="serif text-xl text-[#4A433D] mb-2">{currentQueuePatient.name}</p>
              <p className="text-xs text-[#9CA3AF] font-bold uppercase tracking-widest mb-4">{currentQueuePatient.phone}</p>
              <div className="p-4 bg-[#FDFBF9] rounded-2xl mb-6">
                <p className="text-sm text-[#4A433D] whitespace-pre-wrap">{personalizedMessage}</p>
              </div>
              <button
                onClick={handleSendCurrent}
                className="w-full py-4 bg-[#25D366] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:opacity-90 transition-all flex items-center justify-center gap-2 mb-3"
              >
                <MessageCircle size={16} /> Abrir WhatsApp
              </button>
              <button
                onClick={handleNextInQueue}
                className="w-full py-3 text-[#9CA3AF] font-bold text-[10px] uppercase tracking-widest hover:text-[#4A433D] transition-all"
              >
                {queueIndex + 1 >= sendingQueue.length ? 'Finalizar' : 'Próximo Paciente'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
