import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { Professional } from '../types';
import { Clock, Lock, Plus, X, Trash2 } from 'lucide-react';
import { showToast } from '../lib/toast';

function ToggleButton({ active, onClick, label, icon }: { active?: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-5 rounded-2xl border transition-all ${
        active ? 'bg-red-50 border-red-200 text-red-500' : 'bg-[#FDFBF9] border-[#F5F2F0] text-[#9CA3AF] hover:border-[#EADFD4]/40'
      }`}
    >
      {icon}
      <span className="text-sm font-medium flex-1 text-left">{label}</span>
      <div className={`w-11 h-6 rounded-full transition-all relative ${active ? 'bg-red-400' : 'bg-[#F5F2F0]'}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${active ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
    </button>
  );
}

// Agenda própria por profissional — dias/horários de atendimento e bloqueios, cada um
// independente dos demais. O bloqueio (agenda inteira ou dias/períodos específicos) só
// aparece pra administrador — usuário comum vê os horários mas não mexe neles.
export default function ProfessionalScheduleManager({ user, isAdminUser }: { user: User; isAdminUser: boolean }) {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newProfName, setNewProfName] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  const loadProfessionals = async () => {
    const snap = await getDocs(collection(db, 'professionals'));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Professional));
    setProfessionals(list);
    if (list.length > 0 && !selectedId) setSelectedId(list[0].id!);
    setLoading(false);
  };

  useEffect(() => {
    loadProfessionals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = professionals.find(p => p.id === selectedId) || null;

  const persistSelected = async (updates: Partial<Professional>) => {
    if (!selected?.id) return;
    const next = { ...selected, ...updates };
    setProfessionals(prev => prev.map(p => (p.id === selected.id ? next : p)));
    await updateDoc(doc(db, 'professionals', selected.id), updates).catch(() => {
      showToast('Erro ao salvar — só administrador pode alterar a agenda', 'error');
    });
  };

  const handleAddProfessional = async () => {
    if (!newProfName.trim()) return;
    const docRef = await addDoc(collection(db, 'professionals'), {
      name: newProfName.trim(),
      workingDays: [1, 2, 3, 4, 5],
      workingHoursStart: '08:00',
      workingHoursEnd: '18:00',
      appointmentInterval: 60,
      agendaBlocked: false,
      blockedDates: [],
    });
    setNewProfName('');
    setAddingNew(false);
    await loadProfessionals();
    setSelectedId(docRef.id);
    showToast('Profissional adicionado');
  };

  const handleDeleteProfessional = async (id: string) => {
    const target = professionals.find(p => p.id === id);
    if (target?.email === 'contato.dravitoriaoliveira@gmail.com') {
      showToast('A Dra. Vitória é sempre a profissional de atendimento — não pode ser removida', 'error');
      return;
    }
    if (professionals.length <= 1) {
      showToast('Precisa deixar pelo menos um profissional', 'error');
      return;
    }
    if (!window.confirm('Excluir este profissional? A agenda dele será removida.')) return;
    await deleteDoc(doc(db, 'professionals', id));
    const remaining = professionals.filter(p => p.id !== id);
    setProfessionals(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id || null);
    showToast('Profissional removido');
  };

  if (loading) return null;

  return (
    <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4]">
          <Clock size={20} />
        </div>
        <div>
          <h2 className="text-lg font-medium text-[#4A433D] serif">Agenda por Profissional</h2>
          <p className="text-xs text-[#9CA3AF] font-light">Cada profissional tem horários e disponibilidade próprios, independentes</p>
        </div>
      </div>

      {/* Seletor de profissional */}
      <div className="flex flex-wrap gap-2 mb-8">
        {professionals.map(prof => (
          <button
            key={prof.id}
            onClick={() => setSelectedId(prof.id!)}
            className={`px-5 py-3 rounded-2xl text-sm font-medium transition-all flex items-center gap-2 ${
              selectedId === prof.id ? 'bg-[#4A433D] text-white' : 'bg-[#FDFBF9] text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
            }`}
          >
            {prof.name}
          </button>
        ))}
        {isAdminUser && !addingNew && (
          <button
            onClick={() => setAddingNew(true)}
            className="px-5 py-3 rounded-2xl text-sm font-medium border border-dashed border-[#F5F2F0] text-[#9CA3AF] hover:border-[#EADFD4]/40 transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Novo Profissional
          </button>
        )}
      </div>

      {addingNew && (
        <div className="flex gap-3 mb-8 p-4 bg-[#FDFBF9] rounded-2xl">
          <input
            value={newProfName}
            onChange={e => setNewProfName(e.target.value)}
            placeholder="Nome do profissional"
            className="flex-1 bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
          />
          <button onClick={handleAddProfessional} className="px-6 bg-[#EADFD4] text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#DFCFBF] transition-all">
            Adicionar
          </button>
          <button onClick={() => { setAddingNew(false); setNewProfName(''); }} className="px-4 text-[#9CA3AF] text-[10px] font-bold uppercase">
            Cancelar
          </button>
        </div>
      )}

      {!selected && (
        <p className="text-xs text-[#9CA3AF] italic text-center py-10">
          Nenhum profissional cadastrado ainda. {isAdminUser ? 'Use "Novo Profissional" acima pra começar.' : 'Peça pra um administrador cadastrar.'}
        </p>
      )}

      {selected && (
        <div className="space-y-8">
          {isAdminUser && selected.email !== 'contato.dravitoriaoliveira@gmail.com' && (
            <div className="flex justify-end -mt-2">
              <button onClick={() => handleDeleteProfessional(selected.id!)} className="text-[10px] text-red-300 hover:text-red-500 flex items-center gap-1 font-bold uppercase tracking-widest">
                <Trash2 size={12} /> Excluir {selected.name}
              </button>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3 ml-1">Dias de Atendimento</label>
            <div className="flex flex-wrap gap-2">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label, i) => {
                const active = (selected.workingDays || []).includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const current = selected.workingDays || [];
                      const next = active ? current.filter(d => d !== i) : [...current, i].sort();
                      persistSelected({ workingDays: next });
                    }}
                    className={`w-14 h-14 rounded-2xl border text-xs font-bold transition-all ${
                      active ? 'bg-[#EADFD4] text-white border-[#EADFD4]' : 'bg-[#FDFBF9] text-[#9CA3AF] border-[#F5F2F0] hover:border-[#EADFD4]/40'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Início</label>
              <input
                type="time"
                value={selected.workingHoursStart || '08:00'}
                onChange={e => persistSelected({ workingHoursStart: e.target.value })}
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Fim</label>
              <input
                type="time"
                value={selected.workingHoursEnd || '18:00'}
                onChange={e => persistSelected({ workingHoursEnd: e.target.value })}
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Duração de cada consulta</label>
              <select
                value={selected.appointmentInterval || 60}
                onChange={e => persistSelected({ appointmentInterval: Number(e.target.value) })}
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light appearance-none"
              >
                <option value={15}>15 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos</option>
                <option value={90}>90 minutos</option>
                <option value={120}>120 minutos</option>
              </select>
            </div>
          </div>

          {isAdminUser ? (
            <>
              <div className="pt-6 border-t border-[#F5F2F0]">
                <ToggleButton
                  active={selected.agendaBlocked}
                  onClick={() => persistSelected({ agendaBlocked: !selected.agendaBlocked })}
                  label={`Bloquear agenda de ${selected.name} inteira (fecha pra novos agendamentos online)`}
                  icon={<Lock size={18} />}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3 ml-1">
                  Bloquear dias específicos de {selected.name} (feriado, viagem, etc.)
                </label>
                <div className="flex gap-3 mb-4">
                  <input
                    type="date"
                    id="profBlockDateInput"
                    className="flex-1 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('profBlockDateInput') as HTMLInputElement;
                      if (!input.value) return;
                      const current = selected.blockedDates || [];
                      if (!current.includes(input.value)) {
                        persistSelected({ blockedDates: [...current, input.value].sort() });
                      }
                      input.value = '';
                    }}
                    className="px-6 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#DFCFBF] transition-all"
                  >
                    Bloquear
                  </button>
                </div>
                {(selected.blockedDates || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(selected.blockedDates || []).map(date => (
                      <span key={date} className="flex items-center gap-2 px-4 py-2 bg-[#FDFBF9] border border-[#F5F2F0] rounded-xl text-xs text-[#4A433D]">
                        {new Date(date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        <button
                          type="button"
                          onClick={() => persistSelected({ blockedDates: (selected.blockedDates || []).filter(d => d !== date) })}
                          className="text-[#9CA3AF] hover:text-red-400"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-[#F5F2F0]">
                <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3 ml-1">
                  Bloquear um período de {selected.name} (ex: férias — de tal dia a tal dia)
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input type="date" id="profBlockRangeStart" className="flex-1 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light" />
                  <input type="date" id="profBlockRangeEnd" className="flex-1 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light" />
                  <button
                    type="button"
                    onClick={() => {
                      const startInput = document.getElementById('profBlockRangeStart') as HTMLInputElement;
                      const endInput = document.getElementById('profBlockRangeEnd') as HTMLInputElement;
                      if (!startInput.value || !endInput.value) {
                        showToast('Preencha as duas datas do período', 'error');
                        return;
                      }
                      if (endInput.value < startInput.value) {
                        showToast('A data final precisa ser depois da inicial', 'error');
                        return;
                      }
                      const current = new Set<string>(selected.blockedDates || []);
                      let d = new Date(startInput.value + 'T00:00:00');
                      const end = new Date(endInput.value + 'T00:00:00');
                      while (d <= end) {
                        current.add(d.toISOString().split('T')[0]);
                        d.setDate(d.getDate() + 1);
                      }
                      persistSelected({ blockedDates: Array.from(current).sort() });
                      startInput.value = '';
                      endInput.value = '';
                      showToast('Período bloqueado');
                    }}
                    className="px-6 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#DFCFBF] transition-all whitespace-nowrap"
                  >
                    Bloquear Período
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-[#9CA3AF] italic pt-4 border-t border-[#F5F2F0]">
              Bloqueio de agenda é uma função só de administrador.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
