import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, addDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { slotId, checkinLink, CLINIC_HOURS } from '../lib/slots';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Phone, User as UserIcon, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import type { PublicBookingConfig, BusySlot } from '../types';

// Página pública de agendamento — acessada via link (ex: no Instagram/site), sem exigir login.
// Mostra só os horários realmente livres (a coleção 'busySlots' é pública mas só tem
// data/hora, nenhum dado de paciente) e cria o agendamento direto, sem precisar de
// confirmação manual da clínica.
export default function PublicBooking() {
  const [config, setConfig] = useState<PublicBookingConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState(false);

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [busySlotsToday, setBusySlotsToday] = useState<Set<string>>(new Set());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [procedureInterest, setProcedureInterest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [checkinUrl, setCheckinUrl] = useState('');
  const [step, setStep] = useState<'calendar' | 'details'>('calendar');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'publicConfig', 'booking'))
      .then(snap => {
        if (snap.exists()) setConfig(snap.data() as PublicBookingConfig);
        else setConfigError(true);
      })
      .catch(() => setConfigError(true))
      .finally(() => setLoadingConfig(false));
  }, []);

  useEffect(() => {
    if (!config) return;
    const q = query(
      collection(db, 'busySlots'),
      where('clinicId', '==', config.ownerId),
      where('date', '==', selectedDate)
    );
    const unsub = onSnapshot(q, snap => {
      setBusySlotsToday(new Set(snap.docs.map(d => (d.data() as BusySlot).time)));
    });
    return unsub;
  }, [config, selectedDate]);

  const isToday = selectedDate === new Date().toISOString().split('T')[0];
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const availableTimes = useMemo(() => {
    return CLINIC_HOURS.filter(t => {
      if (busySlotsToday.has(t)) return false;
      if (isToday) {
        const [h, m] = t.split(':').map(Number);
        if (h * 60 + m <= nowMinutes) return false;
      }
      return true;
    });
  }, [busySlotsToday, isToday, nowMinutes]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  const changeDay = (delta: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const todayStr = new Date().toISOString().split('T')[0];
    const newStr = d.toISOString().split('T')[0];
    if (newStr < todayStr) return; // não deixa voltar antes de hoje
    setSelectedDate(newStr);
    setSelectedTime(null);
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
    setStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !config || !selectedTime) return;
    setSubmitting(true);

    const id = slotId(config.ownerId, selectedDate, selectedTime);
    try {
      // Tenta "reservar" o horário criando o busySlot — se alguém acabou de pegar esse
      // horário, essa escrita vira um "update" sobre um documento já existente, e a
      // regra de segurança nega automaticamente (impede reserva duplicada).
      await setDoc(doc(db, 'busySlots', id), {
        clinicId: config.ownerId,
        date: selectedDate,
        time: selectedTime,
      });
    } catch (err) {
      showError('Esse horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.');
      setStep('calendar');
      setSelectedTime(null);
      setSubmitting(false);
      return;
    }

    try {
      const token = crypto.randomUUID();
      const payload: any = {
        userId: config.ownerId,
        patientName: name,
        guestPhone: phone,
        date: selectedDate,
        time: selectedTime,
        status: 'scheduled',
        bookedOnline: true,
        checkinToken: token,
        createdAt: new Date().toISOString(),
      };
      if (procedureInterest) payload.notes = procedureInterest;
      const ref = await addDoc(collection(db, 'appointments'), payload);
      setCheckinUrl(checkinLink(ref.id, token, selectedDate, selectedTime));
      setSubmitted(true);
    } catch (err) {
      // Se o agendamento falhar depois de reservado o horário, libera o horário de volta
      await deleteDoc(doc(db, 'busySlots', id)).catch(() => {});
      showError('Não foi possível confirmar seu agendamento agora. Tente novamente.');
    }
    setSubmitting(false);
  };

  if (loadingConfig) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9]">
        <div className="w-8 h-8 border-2 border-[#EADFD4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9] p-6 text-center">
        <p className="text-[#9CA3AF] font-light">
          Não foi possível carregar a página de agendamento no momento. Tente novamente mais tarde.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FDFBF9] p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-10 rounded-[32px] shadow-sm border border-[#F5F2F0] text-center"
        >
          <div className="w-20 h-20 bg-[#F0F7F0] rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="text-[#8BA888] w-10 h-10" />
          </div>
          <h1 className="text-2xl font-light text-[#5C544E] mb-3 serif">Agendamento confirmado!</h1>
          <p className="text-[#9CA3AF] font-light">
            {name}, seu horário na {config.clinicName}{config.professionalName ? ` com ${config.professionalName}` : ''} está marcado para{' '}
            <span className="text-[#5C544E] font-medium">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {selectedTime}
            </span>. Até lá!
          </p>
          {checkinUrl && (
            <div className="mt-8 p-5 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0] text-left">
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2">
                Salve este link — use-o pra confirmar sua chegada no dia
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={checkinUrl}
                  className="flex-1 bg-white border border-[#F5F2F0] rounded-xl px-3 py-2 text-[10px] text-[#9CA3AF] font-light truncate"
                  onFocus={e => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(checkinUrl); }}
                  className="px-4 py-2 bg-[#EADFD4] text-white rounded-xl text-[9px] font-bold uppercase tracking-widest shrink-0"
                >
                  Copiar
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#FDFBF9] p-6 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white p-10 rounded-[32px] shadow-sm border border-[#F5F2F0]"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#EADFD4]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Calendar className="text-[#EADFD4] w-8 h-8" />
          </div>
          <h1 className="text-2xl font-light text-[#5C544E] serif">{config.clinicName}</h1>
          {config.professionalName && (
            <p className="text-[#EADFD4] font-medium text-sm mt-1">{config.professionalName}</p>
          )}
          <p className="text-[#9CA3AF] mt-2 font-light">Agende seu horário</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-500 font-medium text-center">
            {errorMsg}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'calendar' ? (
            <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-6">
                <button
                  type="button"
                  onClick={() => changeDay(-1)}
                  className="p-2 text-[#9CA3AF] hover:text-[#5C544E] hover:bg-[#FDFBF9] rounded-xl transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <p className="text-sm font-semibold text-[#5C544E] capitalize">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <button
                  type="button"
                  onClick={() => changeDay(1)}
                  className="p-2 text-[#9CA3AF] hover:text-[#5C544E] hover:bg-[#FDFBF9] rounded-xl transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {availableTimes.length === 0 ? (
                <p className="text-center text-sm text-[#9CA3AF] font-light italic py-10">
                  Nenhum horário livre neste dia. Tente o próximo.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {availableTimes.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectTime(t)}
                      className="py-3 rounded-xl border border-[#F5F2F0] bg-[#FDFBF9] text-sm font-semibold text-[#5C544E] hover:bg-[#EADFD4] hover:text-white hover:border-[#EADFD4] transition-all"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button
                type="button"
                onClick={() => { setStep('calendar'); setSelectedTime(null); }}
                className="flex items-center gap-2 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-6 hover:text-[#5C544E] transition-all"
              >
                <ChevronLeft size={14} /> Trocar horário
              </button>

              <div className="mb-6 p-4 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0] text-center">
                <p className="text-sm font-semibold text-[#5C544E] capitalize">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="text-2xl font-light text-[#EADFD4] serif mt-1">{selectedTime}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Seu nome</label>
                  <div className="relative">
                    <UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      required
                      className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">WhatsApp / Telefone</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      required
                      type="tel"
                      className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Procedimento de interesse (opcional)</label>
                  <input
                    className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                    value={procedureInterest}
                    onChange={e => setProcedureInterest(e.target.value)}
                    placeholder="ex: Harmonização Facial, Botox..."
                  />
                </div>

                <button
                  disabled={submitting}
                  type="submit"
                  className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? 'Confirmando...' : 'Confirmar Agendamento'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
