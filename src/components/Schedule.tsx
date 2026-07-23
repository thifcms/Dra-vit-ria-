import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Appointment, Patient } from '../types';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  User, 
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays
} from 'lucide-react';
import { showToast } from '../lib/toast';

export default function Schedule({ user }: { user: FirebaseUser }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sincronizar agendamentos
    const q = query(
      collection(db, 'appointments'), 
      where('userId', '==', user.uid),
      orderBy('time', 'asc')
    );
    const unsubscribeAppts = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(list);
      setLoading(false);
    }, (err) => {
      console.error("Erro no listener de appointments:", err);
      showToast('Erro ao carregar agenda', 'error');
    });

    // Sincronizar pacientes para o modal
    const pQ = query(
      collection(db, 'patients'),
      where('userId', '==', user.uid)
    );
    const unsubscribePatients = onSnapshot(pQ, (snapshot) => {
      const pList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      setPatients(pList);
    });

    return () => {
      unsubscribeAppts();
      unsubscribePatients();
    };
  }, [user.uid]);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);

  const dateStr = selectedDate.toISOString().split('T')[0];
  const dayAppointments = useMemo(
    () => appointments.filter(a => a.date === dateStr),
    [appointments, dateStr]
  );

  const hours = Array.from({ length: 14 }, (_, i) => {
    const h = i + 8;
    return `${h < 10 ? '0' + h : h}:00`;
  });

  const handleSetStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status });
      showToast('Status atualizado');
    } catch (err) {
      showToast('Erro ao atualizar status', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!window.confirm('Excluir este agendamento?')) return;
    try {
      await deleteDoc(doc(db, 'appointments', id));
      showToast('Agendamento excluído');
    } catch (err) {
      showToast('Erro ao excluir', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#FAF7F2] rounded-2xl text-[#D1C7BD] border border-[#F2EEE9]">
            <CalendarDays size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-light text-[#4A4644] serif">Agenda Clínica</h1>
            <p className="text-[#B4A08C] font-light text-xs uppercase tracking-widest mt-1">Gestão de Consultas & Disponibilidade</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#D1C7BD] text-white px-8 py-4 rounded-2xl flex items-center gap-2 hover:bg-[#D1C7BD]/90 transition-all shadow-md active:scale-95 font-medium"
        >
          <Plus size={20} />
          <span>Novo Agendamento</span>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Calendar Sidebar */}
        <div className="w-full lg:w-80 space-y-6">
          <div className="bg-white rounded-[32px] p-8 border border-[#F2EEE9] shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-[#4A4644] serif">{selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
              <div className="flex gap-1">
                <button 
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 py-2 text-[10px] font-bold text-[#D1C7BD] uppercase tracking-widest hover:bg-[#FAF7F2] rounded-xl transition-all mr-2"
                >
                  Hoje
                </button>
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d);
                  }} 
                  className="p-2 text-[#B4A08C] hover:text-[#4A4644] hover:bg-[#FAF7F2] rounded-xl transition-all"
                >
                  <ChevronLeft size={20}/>
                </button>
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d);
                  }} 
                  className="p-2 text-[#B4A08C] hover:text-[#4A4644] hover:bg-[#FAF7F2] rounded-xl transition-all"
                >
                  <ChevronRight size={20}/>
                </button>
              </div>
            </div>
            
            <div className="text-center py-6 bg-[#FAF7F2] rounded-2xl border border-[#F2EEE9]">
              <p className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] mb-1">{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</p>
              <p className="text-4xl font-light text-[#4A4644] serif">{selectedDate.getDate()}</p>
            </div>
          </div>

          <div className="bg-[#FAF7F2] rounded-[32px] p-8 border border-[#EBE3DB]">
            <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] mb-6">Legenda de Status</h4>
            <div className="space-y-4">
              <LegendItem color="bg-[#D1C7BD]" label="Confirmado" />
              <LegendItem color="bg-[#4A4644]" label="Agendado" />
              <LegendItem color="bg-[#8D6B6B]" label="Cancelado" />
              <LegendItem color="bg-[#D4E2D4]" label="Realizado" />
            </div>
          </div>
        </div>

        {/* Timeline View */}
        <div className="flex-1 bg-white rounded-[40px] border border-[#F2EEE9] shadow-sm overflow-hidden min-h-[600px]">
          <div className="p-8 border-b border-[#F2EEE9] bg-[#FDFBF9] flex items-center justify-between">
            <span className="text-sm font-semibold text-[#4A4644]">Linha do Tempo</span>
            <span className="text-xs text-[#B4A08C] font-bold uppercase tracking-widest">{dayAppointments.length} atendimentos hoje</span>
          </div>
          
          <div className="p-8 space-y-2">
            {loading ? (
              <div className="py-20 text-center text-[#B4A08C] font-light italic">Carregando agenda...</div>
            ) : (
              hours.map(hour => {
                const appt = dayAppointments.find(a => a.time === hour);
                return (
                  <div key={hour} className="flex gap-8 group">
                    <div className="w-16 py-4 text-xs font-bold text-[#B4A08C] text-right tracking-widest">{hour}</div>
                    <div className="flex-1 border-l border-[#F2EEE9] pl-8 py-4 relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#EBE3DB] group-hover:bg-[#B4A08C] transition-colors" />
                      
                      {appt ? (
                        <motion.div 
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`p-6 rounded-[24px] shadow-sm flex items-center justify-between group/card transition-all ${
                            appt.status === 'confirmed' ? 'bg-[#D1C7BD]/10 border border-[#D1C7BD]/20' :
                            appt.status === 'completed' ? 'bg-[#D4E2D4]/20 border border-[#D4E2D4]/30' :
                            appt.status === 'cancelled' ? 'bg-[#F5E6E8]/40 border border-[#E8D3D3]' :
                            'bg-[#FAF7F2] border border-[#EBE3DB]'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-[#B4A08C] border border-[#F2EEE9] shadow-sm">
                              <User size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[#4A4644]">{appt.patientName}</p>
                              <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest mt-1">{appt.notes || 'Procedimento Estético'}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 relative">
                            <StatusBadge status={appt.status} />
                            <button
                              onClick={() => setOpenMenuId(openMenuId === appt.id ? null : appt.id!)}
                              className="p-2 text-[#B4A08C] hover:text-[#4A4644] transition-colors"
                            >
                              <MoreHorizontal size={20} />
                            </button>
                            
                            <AnimatePresence>
                              {openMenuId === appt.id && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 10 }}
                                  className="absolute right-0 top-12 z-20 bg-white rounded-2xl border border-[#F2EEE9] shadow-xl py-3 w-52 overflow-hidden"
                                >
                                  <MenuOption onClick={() => { setEditingAppointment(appt); setOpenMenuId(null); }} label="Editar" color="text-[#4A4644]" />
                                  <MenuOption onClick={() => handleSetStatus(appt.id!, 'confirmed')} label="Confirmar" color="text-[#D1C7BD]" />
                                  <MenuOption onClick={() => handleSetStatus(appt.id!, 'completed')} label="Marcar como realizado" color="text-[#4F634F]" />
                                  <MenuOption onClick={() => handleSetStatus(appt.id!, 'cancelled')} label="Cancelar" color="text-[#8D6B6B]" />
                                  <div className="h-px bg-[#F2EEE9] my-2" />
                                  <MenuOption onClick={() => handleDeleteAppointment(appt.id!)} label="Excluir agendamento" color="text-red-500" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="h-20 flex items-center px-6 rounded-2xl border border-dashed border-transparent hover:border-[#EBE3DB] hover:bg-[#FDFBF9] transition-all">
                          <button
                            onClick={() => { setPrefillTime(hour); setIsAdding(true); }}
                            className="text-[#EBE3DB] group-hover:text-[#B4A08C] flex items-center gap-3 text-xs font-bold uppercase tracking-widest transition-all"
                          >
                            <Plus size={18} />
                            <span>Horário Livre</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <AddAppointmentModal 
            user={user}
            onClose={() => { setIsAdding(false); setPrefillTime(null); }} 
            patients={patients}
            appointments={appointments}
            initialDate={dateStr}
            initialTime={prefillTime || '08:00'}
          />
        )}
        {editingAppointment && (
          <AddAppointmentModal 
            user={user}
            onClose={() => setEditingAppointment(null)} 
            patients={patients}
            appointments={appointments}
            initialDate={editingAppointment.date}
            initialTime={editingAppointment.time}
            appointment={editingAppointment}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LegendItem({ color, label }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-xs font-medium text-[#4A4644]">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: any = {
    confirmed: 'bg-[#D1C7BD] text-white',
    completed: 'bg-[#D4E2D4] text-[#4F634F]',
    cancelled: 'bg-[#F5E6E8] text-[#8D6B6B]',
    scheduled: 'bg-[#FAF7F2] text-[#B4A08C] border border-[#EBE3DB]'
  };
  const labels: any = {
    confirmed: 'Confirmado',
    completed: 'Realizado',
    cancelled: 'Cancelado',
    scheduled: 'Agendado'
  };
  return (
    <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${styles[status] || styles.scheduled}`}>
      {labels[status] || 'Agendado'}
    </span>
  );
}

function MenuOption({ onClick, label, color }: any) {
  return (
    <button onClick={onClick} className={`w-full text-left px-5 py-2.5 text-xs font-medium hover:bg-[#FAF7F2] transition-colors ${color}`}>
      {label}
    </button>
  );
}

function AddAppointmentModal({ user, onClose, patients, appointments, initialDate, initialTime, appointment }: any) {
  const [patientId, setPatientId] = useState(appointment?.patientId || '');
  const [date, setDate] = useState(appointment?.date || initialDate);
  const [time, setTime] = useState(appointment?.time || initialTime || '08:00');
  const [notes, setNotes] = useState(appointment?.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // Bloqueio de conflito (ignora o próprio agendamento ao editar)
    const conflict = appointments.find((a: any) =>
      a.date === date && a.time === time && a.status !== 'cancelled' && a.id !== appointment?.id
    );
    if (conflict) {
      showToast('Este horário já está ocupado!', 'error');
      return;
    }

    setSaving(true);
    const patient = patients.find((p: any) => p.id === patientId);
    try {
      if (appointment?.id) {
        await updateDoc(doc(db, 'appointments', appointment.id), {
          patientId,
          patientName: patient?.name || appointment.patientName || 'Unknown',
          date,
          time,
          notes,
        });
        showToast('Agendamento atualizado');
      } else {
        await addDoc(collection(db, 'appointments'), {
          userId: user.uid,
          patientId,
          patientName: patient?.name || 'Unknown',
          date,
          time,
          notes,
          status: 'scheduled',
          createdAt: new Date().toISOString()
        });
        showToast('Agendamento realizado');
      }
      onClose();
    } catch (err) {
      showToast(appointment?.id ? 'Erro ao atualizar agendamento' : 'Erro ao agendar', 'error');
    } finally {
      setSaving(false);
    }
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
        <h2 className="serif text-2xl text-[#4A4644] mb-8">{appointment ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Paciente</label>
            <select 
              required
              className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light appearance-none text-sm"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
            >
              <option value="">Selecione um paciente...</option>
              {patients.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Data</label>
              <input 
                type="date"
                required
                className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light text-sm"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Horário</label>
              <select 
                required
                className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light appearance-none text-sm"
                value={time}
                onChange={e => setTime(e.target.value)}
              >
                {Array.from({ length: 14 }, (_, i) => {
                  const h = i + 8;
                  const timeStr = `${h < 10 ? '0' + h : h}:00`;
                  return <option key={timeStr} value={timeStr}>{timeStr}</option>;
                })}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Procedimento</label>
            <input 
              className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light text-sm"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ex: Harmonização Facial, Botox..."
            />
          </div>
          
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#B4A08C] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#D1C7BD]/90 transition-all"
            >
              {saving ? 'Salvando...' : appointment ? 'Salvar Alterações' : 'Confirmar Agenda'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
