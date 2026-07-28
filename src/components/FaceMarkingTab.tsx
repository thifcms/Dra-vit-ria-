import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, query, where, onSnapshot, addDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Patient, FaceMarkingSession, FaceMarkingPoint, InventoryItem } from '../types';
import { User } from 'firebase/auth';
import { Plus, X, Trash2, Calendar, Package } from 'lucide-react';
import GenericFaceDiagram from './GenericFaceDiagram';
import { showToast } from '../lib/toast';

const MARK_COLORS = [
  { color: '#5B8DEF', label: 'Toxina' },
  { color: '#E0637A', label: 'Preenchedor' },
  { color: '#4CAF7D', label: 'Bioestimulador' },
  { color: '#D4A24C', label: 'Outro' },
];

export default function FaceMarkingTab({ patient, user }: { patient: Patient; user: User }) {
  const [editing, setEditing] = useState(false);
  const [viewingSession, setViewingSession] = useState<FaceMarkingSession | null>(null);
  const [points, setPoints] = useState<FaceMarkingPoint[]>([]);
  const [activeColor, setActiveColor] = useState(MARK_COLORS[0].color);
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'inventory'), where('userId', '==', user.uid)),
      snap => setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)))
    );
    return unsub;
  }, [user.uid]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const sessions = [...(patient.faceMarkings || [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (!patient.sex) {
    return (
      <div className="p-16 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-[#FDFBF9]/30">
        Defina o sexo do paciente (no cabeçalho, ao lado do nome) pra liberar o mapa de aplicação —
        é isso que decide qual diagrama de rosto usar.
      </div>
    );
  }

  const startNew = () => {
    setPoints([]);
    setNotes('');
    setSelectedPointIdx(null);
    setEditing(true);
  };

  const handleDiagramClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPoints(prev => [...prev, { x, y, label: '', color: activeColor }]);
    setSelectedPointIdx(points.length);
  };

  const updatePointLabel = (idx: number, label: string) => {
    setPoints(prev => prev.map((p, i) => (i === idx ? { ...p, label } : p)));
  };

  const updatePointInventory = (idx: number, itemId: string | undefined, itemName: string | undefined, quantity: number) => {
    setPoints(prev => prev.map((p, i) => (i === idx ? {
      ...p,
      inventoryItemId: itemId || undefined,
      inventoryItemName: itemId ? itemName : undefined,
      inventoryQuantity: itemId ? quantity : undefined,
    } : p)));
  };

  const removePoint = (idx: number) => {
    setPoints(prev => prev.filter((_, i) => i !== idx));
    setSelectedPointIdx(null);
  };

  const handleSave = async () => {
    if (points.length === 0) return;
    setSaving(true);
    try {
      const session: FaceMarkingSession = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        sex: patient.sex!,
        notes: notes || undefined,
        points,
      };
      const next = [...(patient.faceMarkings || []), session];
      await updateDoc(doc(db, 'patients', patient.id!), { faceMarkings: next });

      // Baixa automática no estoque — só pros pontos que foram vinculados a um item
      const linkedPoints = points.filter(p => p.inventoryItemId && p.inventoryQuantity);
      for (const p of linkedPoints) {
        await updateDoc(doc(db, 'inventory', p.inventoryItemId!), {
          quantity: increment(-p.inventoryQuantity!),
        }).catch(() => {});
        await addDoc(collection(db, 'inventory_movements'), {
          userId: user.uid,
          itemId: p.inventoryItemId,
          itemName: p.inventoryItemName || '',
          quantity: p.inventoryQuantity,
          type: 'consumption',
          date: session.date,
        }).catch(() => {});
      }
      if (linkedPoints.length > 0) {
        showToast(`Estoque atualizado (${linkedPoints.length} item(ns) baixado(s))`);
      }

      setEditing(false);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const deleteSession = async (id: string) => {
    const next = (patient.faceMarkings || []).filter(s => s.id !== id);
    await updateDoc(doc(db, 'patients', patient.id!), { faceMarkings: next }).catch(() => {});
    setViewingSession(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
        <h3 className="serif text-2xl text-[#5C544E]">Mapa de Aplicação</h3>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-5 py-3 bg-[#EADFD4] text-white rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-[#DFCFBF] transition-all shadow-sm"
        >
          <Plus size={16} /> Novo Mapa
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="p-16 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-[#FDFBF9]/30">
          Nenhum mapa de aplicação registrado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => setViewingSession(session)}
              className="bg-white border border-[#F5F2F0] rounded-[28px] p-4 hover:border-[#EADFD4]/50 transition-all text-left shadow-sm"
            >
              <div className="bg-[#FDFBF9] rounded-2xl mb-3 relative overflow-hidden" style={{ aspectRatio: session.sex === 'F' ? '538/490' : '524/490' }}>
                <GenericFaceDiagram sex={session.sex} />
                {session.points.map((p, i) => (
                  <div
                    key={i}
                    className="absolute w-2.5 h-2.5 rounded-full border border-white shadow"
                    style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.color, transform: 'translate(-50%, -50%)' }}
                  />
                ))}
              </div>
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest flex items-center gap-1.5">
                <Calendar size={11} />
                {new Date(session.date).toLocaleDateString('pt-BR')}
              </p>
              <p className="text-[11px] text-[#5C544E] mt-1">{session.points.length} ponto(s)</p>
            </button>
          ))}
        </div>
      )}

      {/* Editor de novo mapa */}
      {editing && (
        <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden">
            <div className="flex-1 bg-[#FDFBF9] p-8 flex items-center justify-center relative min-h-[400px]">
              <div className="relative w-full max-w-[320px] mx-auto" style={{ aspectRatio: patient.sex === 'F' ? '538/490' : '524/490' }}>
                <GenericFaceDiagram sex={patient.sex} />
                <svg
                  viewBox="0 0 300 380"
                  className="absolute inset-0 w-full h-full cursor-crosshair"
                  onClick={handleDiagramClick}
                >
                  <rect x="0" y="0" width="300" height="380" fill="transparent" />
                </svg>
                {points.map((p, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setSelectedPointIdx(i); }}
                    className="absolute w-5 h-5 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.color }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#9CA3AF] uppercase tracking-widest font-medium">
                Toque no rosto pra marcar um ponto
              </p>
            </div>

            <div className="w-full md:w-[340px] p-8 flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h4 className="serif text-xl text-[#5C544E]">Novo Mapa</h4>
                <button onClick={() => setEditing(false)} className="text-[#9CA3AF] hover:text-[#5C544E]">
                  <X size={22} />
                </button>
              </div>

              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">Tipo do próximo ponto</p>
              <div className="grid grid-cols-2 gap-2 mb-6">
                {MARK_COLORS.map(c => (
                  <button
                    key={c.color}
                    onClick={() => setActiveColor(c.color)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      activeColor === c.color ? 'border-[#EADFD4] bg-[#FDFBF9]' : 'border-[#F5F2F0]'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    {c.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">
                Pontos marcados ({points.length})
              </p>
              <div className="space-y-2 mb-6 flex-1">
                {points.length === 0 && (
                  <p className="text-xs text-[#9CA3AF] italic">Nenhum ponto ainda — toque no rosto ao lado.</p>
                )}
                {points.map((p, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-xl border space-y-2 ${
                      selectedPointIdx === i ? 'border-[#EADFD4] bg-[#FDFBF9]' : 'border-[#F5F2F0]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: p.color }}>
                        {i + 1}
                      </span>
                      <input
                        value={p.label}
                        onChange={e => updatePointLabel(i, e.target.value)}
                        placeholder="Ex: 4U, região frontal"
                        className="flex-1 text-xs bg-transparent outline-none text-[#5C544E]"
                      />
                      <button onClick={() => removePoint(i)} className="text-[#9CA3AF] hover:text-red-400 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {inventoryItems.length > 0 && (
                      <div className="flex items-center gap-1.5 pl-8">
                        <Package size={12} className="text-[#9CA3AF] shrink-0" />
                        <select
                          value={p.inventoryItemId || ''}
                          onChange={e => {
                            const item = inventoryItems.find(it => it.id === e.target.value);
                            updatePointInventory(i, item?.id, item?.name, p.inventoryQuantity || 1);
                          }}
                          className="flex-1 text-[10px] bg-white border border-[#F5F2F0] rounded-lg px-2 py-1 outline-none text-[#5C544E]"
                        >
                          <option value="">Sem baixa de estoque</option>
                          {inventoryItems.map(item => (
                            <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>
                          ))}
                        </select>
                        {p.inventoryItemId && (
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={p.inventoryQuantity ?? 1}
                            onChange={e => updatePointInventory(i, p.inventoryItemId, p.inventoryItemName, parseFloat(e.target.value) || 0)}
                            className="w-14 text-[10px] bg-white border border-[#F5F2F0] rounded-lg px-2 py-1 outline-none text-[#5C544E]"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observações gerais (opcional)"
                rows={2}
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-3 text-xs outline-none focus:border-[#EADFD4]/30 transition-all mb-4 resize-none"
              />

              <button
                disabled={points.length === 0 || saving}
                onClick={handleSave}
                className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#DFCFBF] transition-all disabled:opacity-40"
              >
                {saving ? 'Salvando...' : 'Salvar no Histórico'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualização de mapa salvo */}
      {viewingSession && (
        <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[40px] shadow-2xl p-8 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="serif text-xl text-[#5C544E]">
                  Mapa de {new Date(viewingSession.date).toLocaleDateString('pt-BR')}
                </h4>
                <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest font-bold mt-1">
                  {new Date(viewingSession.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => setViewingSession(null)} className="text-[#9CA3AF] hover:text-[#5C544E]">
                <X size={22} />
              </button>
            </div>

            <div className="relative w-full max-w-[280px] mx-auto mb-6" style={{ aspectRatio: viewingSession.sex === 'F' ? '538/490' : '524/490' }}>
              <GenericFaceDiagram sex={viewingSession.sex} />
              {viewingSession.points.map((p, i) => (
                <div
                  key={i}
                  className="absolute w-6 h-6 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.color }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            <div className="space-y-2 mb-6">
              {viewingSession.points.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#FDFBF9]">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: p.color }}>
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <span className="text-xs text-[#5C544E] block">{p.label || '(sem descrição)'}</span>
                    {p.inventoryItemName && (
                      <span className="text-[10px] text-[#9CA3AF] flex items-center gap-1 mt-0.5">
                        <Package size={10} /> {p.inventoryQuantity} {p.inventoryItemName} baixado(s) do estoque
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {viewingSession.notes && (
              <p className="text-xs text-[#9CA3AF] font-light italic mb-6 p-4 bg-[#FDFBF9] rounded-2xl">{viewingSession.notes}</p>
            )}

            <button
              onClick={() => deleteSession(viewingSession.id)}
              className="w-full py-3 text-red-300 hover:text-red-500 font-bold text-[10px] uppercase tracking-widest transition-all"
            >
              Excluir este mapa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
