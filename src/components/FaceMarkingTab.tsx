import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, addDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getClinicOwnerId } from '../lib/slots';
import { Patient, FaceMarkingSession, FaceMarkingPoint, InventoryItem } from '../types';
import { User } from 'firebase/auth';
import { Plus, X, Trash2, Calendar, Package, DollarSign } from 'lucide-react';
import GenericFaceDiagram from './GenericFaceDiagram';
import { showToast } from '../lib/toast';

const MARK_COLORS = [
  { color: '#5B8DEF', label: 'Toxina' },
  { color: '#E0637A', label: 'Preenchedor' },
  { color: '#4CAF7D', label: 'Bioestimulador' },
  { color: '#D4A24C', label: 'Outro' },
];

// Nomenclatura anatômica padrão das regiões da face, usada como sugestão ao rotular
// cada ponto marcado — mesmos nomes/grafia de referências de harmonização facial.
// Estima o nome da região anatômica a partir de onde a pessoa tocou no rosto (x/y em
// porcentagem da imagem) — usa proporções aproximadas de um rosto de frente, baseadas na
// mesma referência anatômica usada no menu suspenso. Preenche o rótulo sozinho ao marcar
// o ponto; como é uma estimativa por posição, continua totalmente editável depois (o
// menu suspenso continua lá pra corrigir se a estimativa não bater certinho).
function guessRegionFromPosition(x: number, y: number): string {
  // Duas fontes combinadas: a ESCALA (em que altura cada coisa fica) vem do desenho real
  // usado no mapa (/diagrams/face-male.jpg e face-female.jpg), medido com grade de
  // porcentagem sobreposta — sobrancelhas ~35-40%, olhos ~42-58%, base do nariz ~62%,
  // boca ~62-80%, queixo termina ~88-90%. A LÓGICA ANATÔMICA (nariz é um triângulo que
  // alarga descendo; infraorbital fica abaixo do orbital, não do lado; zigomática vem
  // depois do infraorbital, não no lugar dele) vem da foto de referência enviada,
  // também medida com grade — as duas fotos têm enquadramentos diferentes, então usar a
  // escala de uma com a lógica da outra dava resultado errado.
  if (y < 32) return 'Região Frontal';

  if (y < 40) {
    const lateral = x < 25 || x > 75;
    if (lateral) return 'Região Temporal';
    if (x >= 44 && x <= 56) return 'Glabela';
    return 'Região Supraorbital';
  }

  if (y < 62) {
    // Triângulo do nariz alargando: estreito perto da glabela, mais largo perto da base
    const nasalHalfWidth = 6 + ((y - 40) / (62 - 40)) * 9;
    if (x >= 50 - nasalHalfWidth && x <= 50 + nasalHalfWidth) return 'Região Nasal';
    const lateral = x < 22 || x > 78;
    if (lateral) return y < 50 ? 'Região Temporal' : 'Região Zigomática';
    return y < 50 ? 'Região Orbital' : 'Região Infraorbital';
  }

  if (y < 80) {
    const lateral = x < 28 || x > 72;
    return lateral ? 'Região Geniana (bochecha)' : 'Região Oral';
  }

  if (y < 90) {
    const lateral = x < 30 || x > 70;
    return lateral ? 'Região Submandibular' : 'Região Mentual';
  }

  const lateral = x < 34 || x > 66;
  return lateral ? 'Região Submandibular' : 'Região Anterior do Pescoço';
}

const FACIAL_REGIONS = [
  'Glabela',
  'Região Frontal',
  'Região Temporal',
  'Fossa Temporal',
  'Região Supraorbital',
  'Região Orbital',
  'Região Nasal',
  'Região Infraorbital',
  'Região Zigomática',
  'Região Geniana (bochecha)',
  'Região Oral',
  'Região Mentual',
  'Região Anterior do Pescoço',
  'Região Submandibular',
  'Região Parotídea',
  'Sulco Nasogeniano',
  'Sulco Labiomentual',
];

export default function FaceMarkingTab({ patient, user }: { patient: Patient; user: User }) {
  const [editing, setEditing] = useState(false);
  const [viewingSession, setViewingSession] = useState<FaceMarkingSession | null>(null);
  const [points, setPoints] = useState<FaceMarkingPoint[]>([]);
  const [activeColor, setActiveColor] = useState(MARK_COLORS[0].color);
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [substances, setSubstances] = useState<{ id: string; name: string; unit: string }[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'inventory'),
      snap => setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)))
    );
    return unsub;
  }, [user.uid]);

  useEffect(() => {
    getClinicOwnerId(db).then(ownerId => getDoc(doc(db, 'settings', ownerId))).then(snap => {
      if (snap.exists()) setSubstances(snap.data().substances || []);
    }).catch(() => {});
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
    setPoints(prev => [...prev, { x, y, label: guessRegionFromPosition(x, y), color: activeColor }]);
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

  const updatePointSubstance = (idx: number, substanceId: string | undefined, substanceName: string | undefined, ml: number) => {
    setPoints(prev => prev.map((p, i) => (i === idx ? {
      ...p,
      substanceId: substanceId || undefined,
      substanceName: substanceId ? substanceName : undefined,
      substanceMlPerPoint: substanceId ? ml : undefined,
    } : p)));
  };

  // Soma quanto de cada substância foi usado em todos os pontos marcados até agora —
  // atualiza sozinho conforme os pontos vão sendo criados/editados. É só informativo
  // (quanto produto vai ser gasto no total), não entra no cálculo do orçamento — o valor
  // sempre vem do procedimento marcado na anamnese, nunca da substância.
  const substanceUsage: { substanceId: string; substanceName: string; totalMl: number; unit: string }[] = (() => {
    const totals: Record<string, number> = {};
    points.forEach(p => {
      if (p.substanceId && p.substanceMlPerPoint) {
        totals[p.substanceId] = (totals[p.substanceId] || 0) + p.substanceMlPerPoint;
      }
    });
    return Object.entries(totals).map(([substanceId, totalMl]) => {
      const sub = substances.find(s => s.id === substanceId);
      return {
        substanceId,
        substanceName: sub?.name || 'Substância removida',
        totalMl,
        unit: sub?.unit === 'unidade' ? 'UI' : (sub?.unit || 'ml'),
      };
    });
  })();

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
        substanceUsage: substanceUsage.length > 0 ? substanceUsage : undefined,
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
        <h3 className="serif text-2xl text-[#4A433D]">Mapa de Aplicação</h3>
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
              <p className="text-[11px] text-[#4A433D] mt-1">{session.points.length} ponto(s)</p>
            </button>
          ))}
        </div>
      )}

      {/* Editor de novo mapa */}
      {editing && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                <h4 className="serif text-xl text-[#4A433D]">Novo Mapa</h4>
                <button onClick={() => setEditing(false)} className="text-[#9CA3AF] hover:text-[#4A433D]">
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
                        placeholder="Ex: 4U"
                        className="flex-1 text-xs bg-transparent outline-none text-[#4A433D]"
                      />
                      <button onClick={() => removePoint(i)} className="text-[#9CA3AF] hover:text-red-400 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="pl-8">
                      <select
                        value=""
                        onChange={e => {
                          if (!e.target.value) return;
                          updatePointLabel(i, e.target.value);
                        }}
                        className="w-full text-[10px] bg-white border border-[#F5F2F0] rounded-lg px-2 py-1.5 outline-none text-[#9CA3AF]"
                      >
                        <option value="">Corrigir região marcada automaticamente...</option>
                        {FACIAL_REGIONS.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    {substances.length > 0 && (
                      <div className="flex items-center gap-1.5 pl-8 mt-1.5">
                        <DollarSign size={12} className="text-[#9CA3AF] shrink-0" />
                        <select
                          value={p.substanceId || ''}
                          onChange={e => {
                            const sub = substances.find(s => s.id === e.target.value);
                            updatePointSubstance(i, sub?.id, sub?.name, p.substanceMlPerPoint || 0.1);
                          }}
                          className="flex-1 text-[10px] bg-white border border-[#F5F2F0] rounded-lg px-2 py-1 outline-none text-[#4A433D]"
                        >
                          <option value="">Sem substância pro orçamento</option>
                          {substances.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                          ))}
                        </select>
                        {p.substanceId && (
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={p.substanceMlPerPoint ?? 0.1}
                            onChange={e => updatePointSubstance(i, p.substanceId, p.substanceName, parseFloat(e.target.value) || 0)}
                            className="w-14 text-[10px] bg-white border border-[#F5F2F0] rounded-lg px-2 py-1 outline-none text-[#4A433D]"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {substanceUsage.length > 0 && (
                <div className="mb-4 p-4 bg-[#F0F7F0] rounded-2xl border border-[#E5EFE5] space-y-2">
                  <p className="text-[10px] font-bold text-[#8BA888] uppercase tracking-widest mb-1">Total do Planejamento</p>
                  {substanceUsage.map(u => (
                    <div key={u.substanceId} className="flex items-center justify-between text-xs">
                      <span className="text-[#4A433D] font-medium">{u.substanceName}</span>
                      <span className="text-[#4A433D]">{u.totalMl.toFixed(2).replace('.', ',')} {u.unit}</span>
                    </div>
                  ))}
                </div>
              )}

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
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg max-h-[92vh] rounded-[40px] shadow-2xl p-8 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="serif text-xl text-[#4A433D]">
                  Mapa de {new Date(viewingSession.date).toLocaleDateString('pt-BR')}
                </h4>
                <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest font-bold mt-1">
                  {new Date(viewingSession.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => setViewingSession(null)} className="text-[#9CA3AF] hover:text-[#4A433D]">
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
                    <span className="text-xs text-[#4A433D] block">{p.label || '(sem descrição)'}</span>
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
