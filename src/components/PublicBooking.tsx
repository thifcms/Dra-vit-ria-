import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { slotId, checkinLink, cancelLink, CLINIC_HOURS, phoneIndexKey, EMAIL_SERVICE_URL } from '../lib/slots';
import { buildReminderMessage, whatsappLink } from '../lib/reminders';
import { PRIVACY_POLICY_TEXT } from '../lib/privacyPolicy';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Phone, User as UserIcon, Mail, IdCard, ChevronLeft, ChevronRight, CheckCircle2, MessageSquare, X } from 'lucide-react';
import type { PublicBookingConfig, BusySlot } from '../types';

const PROCEDURE_OPTIONS = [
  'Botox',
  'Harmonização Facial',
  'Bioestimulador',
  'Preenchimento Labial',
  'Revitalização Labial',
  'Tecnologias',
  'Cirurgia',
  'Avaliação',
];

// Seleção do procedimento de interesse — caixas fixas + "Outros" abrindo um campo de texto
function ProcedurePicker({
  value, onChange, showOtherDialog, setShowOtherDialog, otherDraft, setOtherDraft,
}: {
  value: string;
  onChange: (v: string) => void;
  showOtherDialog: boolean;
  setShowOtherDialog: (v: boolean) => void;
  otherDraft: string;
  setOtherDraft: (v: string) => void;
}) {
  const isCustom = value !== '' && !PROCEDURE_OPTIONS.includes(value);

  return (
    <div>
      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Procedimento de interesse (opcional)</label>
      <div className="flex flex-wrap gap-2">
        {PROCEDURE_OPTIONS.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition-all ${
              value === opt
                ? 'bg-[#EADFD4] text-white border-[#EADFD4]'
                : 'bg-[#FDFBF9] text-[#5C544E] border-[#F5F2F0] hover:border-[#EADFD4]'
            }`}
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setOtherDraft(isCustom ? value : ''); setShowOtherDialog(true); }}
          className={`px-4 py-2.5 rounded-xl text-xs font-medium border transition-all ${
            isCustom
              ? 'bg-[#EADFD4] text-white border-[#EADFD4]'
              : 'bg-[#FDFBF9] text-[#5C544E] border-[#F5F2F0] hover:border-[#EADFD4]'
          }`}
        >
          {isCustom ? value : 'Outros'}
        </button>
      </div>

      {showOtherDialog && (
        <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowOtherDialog(false)}>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
          >
            <h3 className="serif text-lg text-[#5C544E] mb-4">Qual procedimento?</h3>
            <input
              autoFocus
              value={otherDraft}
              onChange={e => setOtherDraft(e.target.value)}
              placeholder="Digite aqui..."
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm mb-6"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowOtherDialog(false)}
                className="flex-1 py-3 text-[#9CA3AF] font-bold text-[10px] uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { onChange(otherDraft.trim()); setShowOtherDialog(false); }}
                className="flex-1 py-3 bg-[#EADFD4] text-white rounded-xl font-bold text-[10px] uppercase"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

type Step = 'calendar' | 'phone' | 'register' | 'confirm';

// Checkbox de consentimento com a Política de Privacidade, com botão "Leia mais" que
// abre o texto completo. Sem marcar, o agendamento não pode ser confirmado.
function PrivacyConsent({ accepted, onChange, onReadMore }: {
  accepted: boolean;
  onChange: (v: boolean) => void;
  onReadMore: () => void;
}) {
  return (
    <label className="flex items-start gap-3 p-4 bg-[#FDFBF9] rounded-2xl border border-[#F1F3F5] cursor-pointer">
      <input
        type="checkbox"
        checked={accepted}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#EADFD4] shrink-0"
      />
      <span className="text-xs text-[#9CA3AF] font-light leading-relaxed">
        Li e concordo com a{' '}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onReadMore(); }}
          className="text-[#5C544E] font-medium underline underline-offset-2"
        >
          Política de Privacidade
        </button>
        {' '}(leia mais) pra que meus dados sejam usados no agendamento e atendimento.
      </span>
    </label>
  );
}

// Página pública de agendamento — acessada via link (ex: no Instagram/site), sem exigir login.
// Mostra só os horários realmente livres e cria o agendamento direto, sem precisar de
// confirmação manual da clínica. Reconhece pacientes que já agendaram antes pelo telefone,
// evitando pedir os dados de novo, e cria o cadastro completo automaticamente pra quem é novo.
export default function PublicBooking() {
  const [config, setConfig] = useState<PublicBookingConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState(false);

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [busySlotsToday, setBusySlotsToday] = useState<Set<string>>(new Set());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('calendar');
  const [phone, setPhone] = useState('');
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [existingPatientId, setExistingPatientId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [procedureInterest, setProcedureInterest] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showOtherDialog, setShowOtherDialog] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [checkinUrl, setCheckinUrl] = useState('');
  const [cancelUrl, setCancelUrl] = useState('');
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
    if (newStr < todayStr) return;
    setSelectedDate(newStr);
    setSelectedTime(null);
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
    setStep('phone');
  };

  // Verifica se esse telefone já pertence a um paciente cadastrado desta clínica.
  // Se sim, pula direto pra confirmação (sem pedir os dados de novo). Se não, pede cadastro completo.
  const handleCheckPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config || checkingPhone) return;
    setCheckingPhone(true);
    try {
      const key = phoneIndexKey(config.ownerId, phone);
      const snap = await getDoc(doc(db, 'patientPhoneIndex', key));
      if (snap.exists()) {
        const data = snap.data();
        setExistingPatientId(data.patientId);
        setName(data.name);
        setStep('confirm');
      } else {
        setExistingPatientId(null);
        setStep('register');
      }
    } catch (err) {
      showError('Não foi possível verificar o telefone agora. Tente novamente.');
    }
    setCheckingPhone(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !config || !selectedTime) return;
    if (!acceptedPrivacy) {
      showError('É preciso aceitar a Política de Privacidade pra confirmar o agendamento.');
      return;
    }
    setSubmitting(true);

    // Gera o ID do agendamento antes de criar qualquer coisa, pra poder vincular o horário
    // ocupado (busySlot) a ele — é isso que permite liberar o horário com segurança quando
    // o paciente cancela pelo link, sem precisar de login.
    const apptRef = doc(collection(db, 'appointments'));
    const slotDocId = slotId(config.ownerId, selectedDate, selectedTime);
    try {
      await setDoc(doc(db, 'busySlots', slotDocId), {
        clinicId: config.ownerId,
        date: selectedDate,
        time: selectedTime,
        apt: apptRef.id,
      });
    } catch (err) {
      showError('Esse horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.');
      setStep('calendar');
      setSelectedTime(null);
      setSubmitting(false);
      return;
    }

    try {
      let patientId = existingPatientId;
      const consentTimestamp = new Date().toISOString();

      if (!patientId) {
        const patientRef = await addDoc(collection(db, 'patients'), {
          userId: config.ownerId,
          name,
          phone,
          email: email || undefined,
          cpf: cpf || undefined,
          birthDate: birthDate || undefined,
          privacyConsentAt: consentTimestamp,
          updatedAt: new Date().toISOString(),
        });
        patientId = patientRef.id;
        await setDoc(doc(db, 'patientPhoneIndex', phoneIndexKey(config.ownerId, phone)), {
          clinicId: config.ownerId,
          patientId,
          name,
        }).catch(() => {});
      } else {
        // Paciente que já existe: registra o novo aceite também (renova a comprovação a
        // cada agendamento, em vez de confiar só no consentimento da primeira vez)
        await updateDoc(doc(db, 'patients', patientId), { privacyConsentAt: consentTimestamp }).catch(() => {});
      }

      const token = crypto.randomUUID();
      const payload: any = {
        userId: config.ownerId,
        patientId,
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
      await setDoc(apptRef, payload);
      setCheckinUrl(checkinLink(apptRef.id, token, selectedDate, selectedTime));
      setCancelUrl(cancelLink(apptRef.id, token, selectedDate, selectedTime, config.ownerId));
      setSubmitted(true);

      // Dispara o e-mail de confirmação automático (serviço independente do app principal).
      // Best-effort: se o serviço estiver fora do ar, ou o paciente não tiver e-mail, o
      // agendamento em si já está confirmado de qualquer forma — isso nunca deve travar
      // nem mostrar erro pro paciente.
      fetch(`${EMAIL_SERVICE_URL}/api/send-confirmation-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: apptRef.id }),
      }).catch(() => {});
    } catch (err: any) {
      await deleteDoc(doc(db, 'busySlots', slotDocId)).catch(() => {});
      const detail = err?.code || err?.message || 'erro desconhecido';
      showError(`Não foi possível confirmar seu agendamento agora. (${detail})`);
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
          <p className="text-[#9CA3AF] font-light mb-8">
            {name}, seu horário na {config.clinicName}{config.professionalName ? ` com ${config.professionalName}` : ''} está marcado para{' '}
            <span className="text-[#5C544E] font-medium">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {selectedTime}
            </span>. Até lá!
          </p>

          <button
            onClick={() => {
              const msg = buildReminderMessage({
                patientName: name,
                clinicName: config.clinicName,
                professionalName: config.professionalName,
                dateLabel: new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }),
                time: selectedTime!,
                checkinUrl: checkinUrl,
                cancelUrl: cancelUrl,
              });
              window.open(whatsappLink(phone, msg), '_blank');
            }}
            className="w-full py-4 bg-[#25D366] text-white rounded-2xl font-medium flex items-center justify-center gap-3 hover:bg-[#20bd5c] transition-all shadow-sm"
          >
            <MessageSquare size={20} />
            Salvar Confirmação no Meu WhatsApp
          </button>
          <p className="text-[10px] text-[#9CA3AF] font-light text-center mt-3 mb-8 leading-relaxed">
            Isso abre uma conversa com você mesmo no seu WhatsApp, só pra guardar salvos os detalhes da consulta — incluindo o link de confirmação de chegada e o link de cancelamento (caso precise desmarcar). Não é enviado pra ninguém.
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

          {cancelUrl && (
            <div className="mt-4 p-5 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0] text-left">
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2">
                Não vai poder vir? Cancele por este link, sem precisar ligar
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={cancelUrl}
                  className="flex-1 bg-white border border-[#F5F2F0] rounded-xl px-3 py-2 text-[10px] text-[#9CA3AF] font-light truncate"
                  onFocus={e => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(cancelUrl); }}
                  className="px-4 py-2 bg-white border border-[#F5F2F0] text-[#9CA3AF] rounded-xl text-[9px] font-bold uppercase tracking-widest shrink-0"
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
          {step === 'calendar' && (
            <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-6">
                <button type="button" onClick={() => changeDay(-1)} className="p-2 text-[#9CA3AF] hover:text-[#5C544E] hover:bg-[#FDFBF9] rounded-xl transition-all">
                  <ChevronLeft size={20} />
                </button>
                <p className="text-sm font-semibold text-[#5C544E] capitalize">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <button type="button" onClick={() => changeDay(1)} className="p-2 text-[#9CA3AF] hover:text-[#5C544E] hover:bg-[#FDFBF9] rounded-xl transition-all">
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
          )}

          {step === 'phone' && (
            <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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

              <form onSubmit={handleCheckPhone} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Seu WhatsApp / Telefone</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      required
                      type="tel"
                      autoFocus
                      className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <p className="text-[10px] text-[#9CA3AF] font-light mt-2 ml-1">
                    Se você já é paciente, isso evita ter que preencher seus dados de novo.
                  </p>
                </div>
                <button
                  disabled={checkingPhone}
                  type="submit"
                  className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {checkingPhone ? 'Verificando...' : 'Continuar'}
                </button>
              </form>
            </motion.div>
          )}

          {step === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button
                type="button"
                onClick={() => { setStep('phone'); setExistingPatientId(null); setName(''); }}
                className="flex items-center gap-2 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-6 hover:text-[#5C544E] transition-all"
              >
                <ChevronLeft size={14} /> Não sou eu / trocar telefone
              </button>

              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-[#F0F7F0] rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="text-[#8BA888] w-8 h-8" />
                </div>
                <p className="text-lg font-medium text-[#5C544E]">Bem-vindo(a) de volta, {name.split(' ')[0]}!</p>
                <p className="text-xs text-[#9CA3AF] font-light mt-1">Já reconhecemos seu cadastro — não precisa preencher tudo de novo.</p>
              </div>

              <div className="mb-6 p-4 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0] text-center">
                <p className="text-sm font-semibold text-[#5C544E] capitalize">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="text-2xl font-light text-[#EADFD4] serif mt-1">{selectedTime}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <ProcedurePicker
                  value={procedureInterest}
                  onChange={setProcedureInterest}
                  showOtherDialog={showOtherDialog}
                  setShowOtherDialog={setShowOtherDialog}
                  otherDraft={otherDraft}
                  setOtherDraft={setOtherDraft}
                />
                <PrivacyConsent
                  accepted={acceptedPrivacy}
                  onChange={setAcceptedPrivacy}
                  onReadMore={() => setShowPrivacyModal(true)}
                />
                <button
                  disabled={submitting || !acceptedPrivacy}
                  type="submit"
                  className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? 'Confirmando...' : 'Confirmar Agendamento'}
                </button>
              </form>
            </motion.div>
          )}

          {step === 'register' && (
            <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="flex items-center gap-2 text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-6 hover:text-[#5C544E] transition-all"
              >
                <ChevronLeft size={14} /> Voltar
              </button>

              <p className="text-xs text-[#9CA3AF] font-light mb-6 text-center">
                Primeira vez por aqui — vamos criar seu cadastro
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Nome completo</label>
                  <div className="relative">
                    <UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      required
                      autoFocus
                      className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">CPF</label>
                    <div className="relative">
                      <IdCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                      <input
                        required
                        className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                        value={cpf}
                        onChange={e => setCpf(e.target.value)}
                        placeholder="000.000.000-00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Nascimento (opcional)</label>
                    <input
                      type="date"
                      className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                      value={birthDate}
                      onChange={e => setBirthDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">E-mail</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      required
                      type="email"
                      className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>

                <ProcedurePicker
                  value={procedureInterest}
                  onChange={setProcedureInterest}
                  showOtherDialog={showOtherDialog}
                  setShowOtherDialog={setShowOtherDialog}
                  otherDraft={otherDraft}
                  setOtherDraft={setOtherDraft}
                />

                <PrivacyConsent
                  accepted={acceptedPrivacy}
                  onChange={setAcceptedPrivacy}
                  onReadMore={() => setShowPrivacyModal(true)}
                />
                <button
                  disabled={submitting || !acceptedPrivacy}
                  type="submit"
                  className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {submitting ? 'Confirmando...' : 'Criar Cadastro e Confirmar'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {showPrivacyModal && (
        <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowPrivacyModal(false)}>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-lg rounded-[32px] p-8 shadow-2xl max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="serif text-xl text-[#5C544E]">Política de Privacidade</h3>
              <button onClick={() => setShowPrivacyModal(false)} className="p-2 text-[#9CA3AF] hover:text-[#5C544E]">
                <X size={22} />
              </button>
            </div>
            <div className="text-xs text-[#9CA3AF] font-light leading-relaxed whitespace-pre-line">
              {PRIVACY_POLICY_TEXT}
            </div>
            <button
              onClick={() => { setAcceptedPrivacy(true); setShowPrivacyModal(false); }}
              className="w-full mt-6 py-4 bg-[#EADFD4] text-white rounded-2xl font-medium hover:bg-[#DFCFBF] transition-all shadow-sm"
            >
              Li e Concordo
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
