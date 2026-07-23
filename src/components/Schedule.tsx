import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, where, orderBy } from 'firebase/firestore';
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
  AlertCircle
} from 'lucide-react';

export default function Schedule({ user }: { user: FirebaseUser }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    const q = query(
      collection(db, 'appointments'), 
      where('userId', '==', user.uid),
      orderBy('time', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(list);
    });

    const pQ = query(
      collection(db, 'patients'),
      where('userId', '==', user.uid)
    );
    onSnapshot(pQ, (snapshot) => {
      const pList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      setPatients(pList);
    });

    return unsubscribe;
  }, [user.uid]);

  const dateStr = selectedDate.toISOString().split('T')[0];
  const dayAppointments = appointments.filter(a => a.date === dateStr);

  const hours = Array.from({ length: 14 }, (_, i) => `${i + 8}:00`);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extralight text-[#4A4644]">Agenda</h1>
          <p className="text-[#B4A08C] font-light mt-1">Gerencie horários e atendimentos.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#D1C7BD] text-white px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-[#D1C7BD]/90 transition-all shadow-md active:scale-95"
        >
          <Plus size={20} />
          <span className="font-light">Novo Horário</span>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Calendar Picker */}
        <div className="w-full lg:w-80 space-y-6">
          <div className="bg-white rounded-[32px] p-6 border border-[#F2EEE9] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-[#4A4644]">{selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
              <div className="flex gap-2">
                <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() - 1)))} className="p-1 text-[#B4A08C] hover:text-[#4A4644]"><ChevronLeft size={20}/></button>
                <button onClick={() => setSelectedDate(new Date(selectedDate.setDate(selectedDate.getDate() + 1)))} className="p-1 text-[#B4A08C] hover:text-[#4A4644]"><ChevronRight size={20}/></button>
              </div>
            </div>
            {/* Simple Calendar Grid would go here */}
            <div className="text-center py-4 text-sm text-[#B4A08C] font-light border-t border-[#F2EEE9]">
              {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })}
            </div>
          </div>

          <div className="bg-[#FAF7F2] rounded-[32px] p-6 border border-[#EBE3DB]">
            <h4 className="text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-4">Legenda</h4>
            <div className="space-y-3">
              <LegendItem color="bg-[#D1C7BD]" label="Confirmado" />
              <LegendItem color="bg-[#B4A08C]" label="Agendado" />
              <LegendItem color="bg-[#8D6B6B]" label="Cancelado" />
            </div>
          </div>
        </div>

        {/* Daily View */}
        <div className="flex-1 bg-white rounded-[32px] border border-[#F2EEE9] shadow-sm overflow-hidden">
          <div className="p-6 border-b border-[#F2EEE9] bg-[#FDFBF9] flex items-center justify-between">
            <span className="text-sm font-medium text-[#4A4644]">Cronograma do Dia</span>
            <span className="text-xs text-[#B4A08C] font-light italic">{dayAppointments.length} atendimentos</span>
          </div>
          
          <div className="p-4 space-y-1">
            {hours.map(hour => {
              const appt = dayAppointments.find(a => a.time === hour);
              return (
                <div key={hour} className="flex gap-4 group">
                  <div className="w-16 py-4 text-xs font-medium text-[#B4A08C] text-right">{hour}</div>
                  <div className="flex-1 border-l border-[#F2EEE9] pl-6 py-2">
                    {appt ? (
                      <motion.div 
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`p-4 rounded-[20px] shadow-sm flex items-center justify-between ${
                          appt.status === 'confirmed' ? 'bg-[#D1C7BD]/20 border border-[#D1C7BD]/30' :
                          appt.status === 'cancelled' ? 'bg-[#F5E6E8] border border-[#E8D3D3]' :
                          'bg-[#FAF7F2] border border-[#EBE3DB]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#B4A08C]">
                            <User size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#4A4644]">{appt.patientName}</p>
                            <p className="text-xs text-[#B4A08C] font-light">{appt.notes || 'Consulta Geral'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusIcon status={appt.status} />
                          <button className="p-2 text-[#B4A08C] hover:text-[#4A4644] transition-colors"><MoreHorizontal size={18} /></button>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="h-16 flex items-center group-hover:bg-[#FDFBF9] rounded-2xl px-4 transition-colors">
                        <button className="text-[#F2EEE9] group-hover:text-[#B4A08C] flex items-center gap-2 text-sm font-light transition-colors">
                          <Plus size={16} />
                          <span>Disponível</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <AddAppointmentModal 
            user={user}
            onClose={() => setIsAdding(false)} 
            patients={patients}
            initialDate={dateStr}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LegendItem({ color, label }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-xs font-light text-[#4A4644]">{label}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'confirmed') return <CheckCircle2 size={18} className="text-[#D1C7BD]" />;
  if (status === 'cancelled') return <XCircle size={18} className="text-[#8D6B6B]" />;
  return <Clock size={18} className="text-[#B4A08C]" />;
}

function AddAppointmentModal({ user, onClose, patients, initialDate }: any) {
  const [patientId, setPatientId] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState('08:00');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const patient = patients.find((p: any) => p.id === patientId);
    try {
      await addDoc(collection(db, 'appointments'), {
        userId: user.uid,
        patientId,
        patientName: patient?.name || 'Unknown',
        date,
        time,
        notes,
        status: 'scheduled'
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
        className="bg-white w-full max-w-lg rounded-[32px] p-10 shadow-2xl"
      >
        <h2 className="text-2xl font-light mb-8 text-[#4A4644]">Novo Agendamento</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Paciente</label>
            <select 
              required
              className="w-full bg-[#FDFCFB] border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light appearance-none"
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
              <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Data</label>
              <input 
                type="date"
                required
                className="w-full bg-[#FDFCFB] border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Horário</label>
              <select 
                required
                className="w-full bg-[#FDFCFB] border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light appearance-none"
                value={time}
                onChange={e => setTime(e.target.value)}
              >
                {Array.from({ length: 14 }, (_, i) => `${i + 8}:00`).map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Procedimento / Notas</label>
            <input 
              className="w-full bg-[#FDFCFB] border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ex: Botox, Preenchimento..."
            />
          </div>
          
          <div className="flex gap-4 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-4 border border-[#EBE3DB] text-[#B4A08C] rounded-2xl font-light hover:bg-[#FAF7F2] transition-all"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-light hover:bg-[#D1C7BD]/90 transition-all shadow-md"
            >
              Agendar
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
