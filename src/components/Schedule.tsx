import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, doc, getDoc, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Appointment, Patient, ClinicSettings } from '../types';
import { slotId, checkinLink, cancelLink, intakeInviteLink, CLINIC_HOURS, EMAIL_SERVICE_URL, localDateStr, todayLocalStr, getClinicOwnerId } from '../lib/slots';
import { buildReminderMessage, whatsappLink, emailLink, openWhatsApp } from '../lib/reminders';
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
  CalendarDays,
  Users,
  MessageCircle,
  Mail,
  BellRing
} from 'lucide-react';
import { showToast } from '../lib/toast';

export default function Schedule({ user, onOpenPatient }: { user: FirebaseUser, onOpenPatient?: (patientId: string) => void }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [professionals, setProfessionals] = useState<{ id: string; name: string }[]>([]);
  const [professionalFilter, setProfessionalFilter] = useState<string | null>(null); // null = todos

  useEffect(() => {
    getDoc(doc(db, 'system', 'authorized_admins')).then(snap => {
      const emails: string[] = snap.exists() ? (snap.data().emails || []) : [];
      setIsAdminUser(!!user.email && emails.includes(user.email));
    }).catch(() => {});
    getDocs(collection(db, 'professionals')).then(snap => {
      setProfessionals(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });
  }, [user.email]);

  useEffect(() => {
    // Nome/endereço da clínica, usados na mensagem de lembrete — sempre lidos do UID fixo
    // "dono" da clínica, não de quem está logado (o mesmo documento vale pra qualquer
    // administrador que acessar)
    getClinicOwnerId(db).then(id => {
      setOwnerId(id);
      return getDoc(doc(db, 'settings', id));
    }).then(snap => {
      if (snap && snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
    }).catch(() => {});
  }, [user.uid]);

  useEffect(() => {
    // Sincronizar agendamentos
    const q = query(
      collection(db, 'appointments'), 
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
      collection(db, 'patients')
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

  const dateStr = localDateStr(selectedDate);
  const dayAppointments = useMemo(
    () => appointments.filter(a => a.date === dateStr && (!professionalFilter || a.professionalId === professionalFilter)),
    [appointments, dateStr, professionalFilter]
  );

  const waitingQueue = useMemo(() => {
    const filtered = dayAppointments
      .filter(a => a.checkedInAt && a.status !== 'completed' && a.status !== 'cancelled')
      .sort((a, b) => (a.checkedInAt! < b.checkedInAt! ? -1 : 1));
    // Proteção extra: garante que o mesmo agendamento nunca apareça duas vezes na fila,
    // não importa a causa (ex: uma atualização otimista sobrepondo brevemente o dado
    // antigo com o novo antes da confirmação do servidor)
    const seen = new Set<string>();
    return filtered.filter(a => {
      if (seen.has(a.id!)) return false;
      seen.add(a.id!);
      return true;
    });
  }, [dayAppointments]);

  const isViewingToday = dateStr === todayLocalStr();
  const todaysReminders = useMemo(
    () => isViewingToday
      ? dayAppointments
          .filter(a => !a.checkedInAt && a.status !== 'completed' && a.status !== 'cancelled')
          .sort((a, b) => a.time.localeCompare(b.time))
      : [],
    [dayAppointments, isViewingToday]
  );

  // Índice/total de uma sessão dentro de um pacote recorrente (mesmo seriesId), pra mostrar "Sessão X de Y"
  const seriesInfo = useMemo(() => {
    const map = new Map<string, { index: number, total: number }>();
    const bySeries = new Map<string, Appointment[]>();
    appointments.forEach(a => {
      if (!a.seriesId) return;
      if (!bySeries.has(a.seriesId)) bySeries.set(a.seriesId, []);
      bySeries.get(a.seriesId)!.push(a);
    });
    bySeries.forEach(list => {
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
      sorted.forEach((a, i) => map.set(a.id!, { index: i + 1, total: sorted.length }));
    });
    return map;
  }, [appointments]);

  const hours = Array.from({ length: 14 }, (_, i) => {
    const h = i + 8;
    return `${h < 10 ? '0' + h : h}:00`;
  });

  const handleSetStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status });

      const appt = appointments.find(a => a.id === id);

      // Cancelar libera o horário na fila pública de disponibilidade
      if (status === 'cancelled' && appt) {
        await deleteDoc(doc(db, 'busySlots', slotId(ownerId || user.uid, appt.professionalId || 'default', appt.date, appt.time))).catch(() => {});
      }

      // O lançamento financeiro automático ao concluir uma consulta (baseado no campo
      // "valor" do agendamento) foi removido — causava duplicação real: o Orçamento já
      // lança o valor certo ao confirmar o pagamento, e esse lançamento aqui, baseado no
      // valor solto do agendamento, entrava como uma SEGUNDA transação pro mesmo
      // atendimento. Financeiro agora só é alimentado pela confirmação do Orçamento.
      showToast('Status atualizado');
    } catch (err) {
      showToast('Erro ao atualizar status', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  const [linkingPatientAppt, setLinkingPatientAppt] = useState<Appointment | null>(null);

  const handleOpenPatient = (appt: Appointment) => {
    if (appt.patientId && onOpenPatient) {
      onOpenPatient(appt.patientId);
    } else {
      // Agendamento sem paciente vinculado (ex: veio da página pública) — pede pra
      // vincular a um cadastro existente ou criar um novo antes de abrir o prontuário
      setLinkingPatientAppt(appt);
    }
  };

  const handleCheckIn = async (id: string) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { checkedInAt: new Date().toISOString() });
      showToast('Check-in realizado');
      // Ao fazer check-in manual, reenvia a ficha inicial automaticamente — mesma coisa
      // que já acontece quando o próprio paciente faz check-in online
      const appt = appointments.find(a => a.id === id);
      if (appt) await handleSendIntakeForm(appt, true);
    } catch (err) {
      showToast('Erro ao fazer check-in', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  // Cria um convite pra Ficha Clínica de Harmonização Facial e abre o WhatsApp já com a
  // mensagem pronta — usado tanto no reenvio manual (menu de 3 pontos) quanto
  // automaticamente ao fazer check-in manual. silent=true pula o toast de sucesso (usado
  // quando é parte automática de outra ação, como o check-in, pra não empilhar avisos).
  const handleSendIntakeForm = async (appt: Appointment, silent = false) => {
    if (!appt.patientId) {
      if (!silent) showToast('Esse agendamento não tem paciente vinculado ainda', 'error');
      return;
    }
    const patient = patients.find(p => p.id === appt.patientId);
    const phone = patient?.phone || appt.guestPhone;
    if (!phone) {
      if (!silent) showToast('Este paciente não tem telefone cadastrado', 'error');
      return;
    }
    try {
      const inviteRef = doc(collection(db, 'intakeInvites'));
      await setDoc(inviteRef, {
        userId: user.uid,
        patientId: appt.patientId,
        patientName: appt.patientName,
        ownerId: ownerId || user.uid,
        createdAt: new Date().toISOString(),
      });
      const link = intakeInviteLink(inviteRef.id);
      const message = `Olá, ${appt.patientName}! Por favor, preencha a ficha clínica antes da sua consulta: ${link}`;
      openWhatsApp(phone, message);
      if (!silent) showToast('Ficha enviada por WhatsApp');
    } catch (err) {
      if (!silent) showToast('Erro ao enviar a ficha', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  const ensureCheckinToken = async (appt: Appointment): Promise<string> => {
    if (appt.checkinToken) return appt.checkinToken;
    const token = crypto.randomUUID();
    await updateDoc(doc(db, 'appointments', appt.id!), { checkinToken: token });
    return token;
  };

  const handleCopyCheckinLink = async (appt: Appointment) => {
    try {
      const token = await ensureCheckinToken(appt);
      const checkin = checkinLink(appt.id!, token, appt.date, appt.time);
      const cancel = cancelLink(appt.id!, token, appt.date, appt.time, user.uid);
      await navigator.clipboard.writeText(`Confirmar chegada: ${checkin}\nCancelar consulta: ${cancel}`);
      showToast('Links de check-in e cancelamento copiados — envie para o paciente');
    } catch (err) {
      showToast('Erro ao gerar link de check-in', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  const handleSendReminder = async (appt: Appointment, channel: 'whatsapp' | 'email') => {
    setOpenMenuId(null);
    const patient = patients.find(p => p.id === appt.patientId);
    const phone = patient?.phone || appt.guestPhone;
    const email = patient?.email;

    if (channel === 'whatsapp' && !phone) {
      showToast('Este paciente não tem telefone cadastrado', 'error');
      return;
    }
    if (channel === 'email' && !email) {
      showToast('Este paciente não tem e-mail cadastrado', 'error');
      return;
    }

    try {
      const token = await ensureCheckinToken(appt);
      const checkinUrl = checkinLink(appt.id!, token, appt.date, appt.time);
      const cancelUrl = cancelLink(appt.id!, token, appt.date, appt.time, user.uid);
      const dateLabel = new Date(appt.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
      const message = buildReminderMessage({
        patientName: appt.patientName,
        clinicName: clinicSettings?.clinicName || clinicSettings?.professionalName || 'Clínica',
        professionalName: clinicSettings?.professionalName,
        address: clinicSettings?.clinicAddress,
        dateLabel,
        time: appt.time,
        checkinUrl,
        cancelUrl,
      });
      const url = channel === 'whatsapp' ? whatsappLink(phone!, message) : emailLink(email!, clinicSettings?.clinicName || 'Clínica', message);
      window.open(url, '_blank');
    } catch (err) {
      showToast('Erro ao preparar lembrete', 'error');
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!window.confirm('Excluir este agendamento?')) return;
    const appt = appointments.find(a => a.id === id);
    try {
      await deleteDoc(doc(db, 'appointments', id));
      // Libera o horário correspondente na fila pública de disponibilidade
      if (appt) {
        await deleteDoc(doc(db, 'busySlots', slotId(ownerId || user.uid, appt.professionalId || 'default', appt.date, appt.time))).catch(() => {});
      }
      showToast('Agendamento excluído');
    } catch (err) {
      showToast('Erro ao excluir', 'error');
    } finally {
      setOpenMenuId(null);
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#EADFD4] border border-[#F5F2F0]">
            <CalendarDays size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-light text-[#4A433D] serif">Agenda Clínica</h1>
            <p className="text-[#9CA3AF] font-light text-xs uppercase tracking-widest mt-1">Gestão de Consultas & Disponibilidade</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#EADFD4] text-white px-8 py-4 rounded-2xl flex items-center gap-2 hover:bg-[#DFCFBF] transition-all shadow-md active:scale-95 font-medium"
        >
          <Plus size={20} />
          <span>Novo Agendamento</span>
        </button>
      </div>

      {isAdminUser && professionals.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setProfessionalFilter(null)}
            className={`px-5 py-3 rounded-2xl text-sm font-medium transition-all ${
              professionalFilter === null ? 'bg-[#4A433D] text-white' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
            }`}
          >
            Todos os profissionais
          </button>
          {professionals.map(prof => (
            <button
              key={prof.id}
              onClick={() => setProfessionalFilter(prof.id)}
              className={`px-5 py-3 rounded-2xl text-sm font-medium transition-all ${
                professionalFilter === prof.id ? 'bg-[#4A433D] text-white' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
              }`}
            >
              {prof.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Calendar Sidebar */}
        <div className="w-full lg:w-80 space-y-6">
          <div className="bg-white rounded-[32px] p-8 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-[#4A433D] serif">{selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
              <div className="flex gap-1">
                <button 
                  onClick={() => setSelectedDate(new Date())}
                  className="px-4 py-2 text-[10px] font-bold text-[#EADFD4] uppercase tracking-widest hover:bg-[#FDFBF9] rounded-xl transition-all mr-2"
                >
                  Hoje
                </button>
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d);
                  }} 
                  className="p-2 text-[#9CA3AF] hover:text-[#4A433D] hover:bg-[#FDFBF9] rounded-xl transition-all"
                >
                  <ChevronLeft size={20}/>
                </button>
                <button 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d);
                  }} 
                  className="p-2 text-[#9CA3AF] hover:text-[#4A433D] hover:bg-[#FDFBF9] rounded-xl transition-all"
                >
                  <ChevronRight size={20}/>
                </button>
              </div>
            </div>
            
            <div className="text-center py-6 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0]">
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-1">{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</p>
              <p className="text-4xl font-light text-[#4A433D] serif">{selectedDate.getDate()}</p>
            </div>
          </div>

          {/* Fila de Espera */}
          <div className="bg-white rounded-[32px] p-8 border border-[#F5F2F0] shadow-sm">
            <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Users size={14} className="text-[#EADFD4]" /> Fila de Espera
            </h4>
            {waitingQueue.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] font-light italic">Ninguém aguardando no momento.</p>
            ) : (
              <div className="space-y-3">
                {waitingQueue.map((appt, i) => (
                  <div key={appt.id} className="flex items-center gap-3 p-4 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0]">
                    <div className="w-8 h-8 rounded-full bg-[#EADFD4] text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#4A433D] truncate">{appt.patientName}</p>
                      <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-0.5">
                        Aguardando desde {new Date(appt.checkedInAt!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenPatient(appt)}
                      className="px-3 py-2 bg-[#8BA888] text-white rounded-xl text-[9px] font-bold uppercase tracking-widest shrink-0 hover:opacity-90 transition-all"
                    >
                      Atender
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lembretes de Hoje — só quando a data selecionada é hoje */}
          {isViewingToday && (
            <div className="bg-white rounded-[32px] p-8 border border-[#F5F2F0] shadow-sm">
              <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <BellRing size={14} className="text-[#EADFD4]" /> Lembretes de Hoje
              </h4>
              {todaysReminders.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] font-light italic">Nada pendente pra hoje.</p>
              ) : (
                <div className="space-y-3">
                  {todaysReminders.map(appt => (
                    <div key={appt.id} className="flex items-center gap-3 p-4 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0]">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#4A433D] truncate">{appt.time} — {appt.patientName}</p>
                      </div>
                      <button
                        onClick={() => handleSendReminder(appt, 'whatsapp')}
                        title="Lembrete por WhatsApp"
                        className="p-2 bg-[#8BA888] text-white rounded-xl shrink-0 hover:opacity-90 transition-all"
                      >
                        <MessageCircle size={14} />
                      </button>
                      <button
                        onClick={() => handleSendReminder(appt, 'email')}
                        title="Lembrete por E-mail"
                        className="p-2 bg-[#4A433D] text-white rounded-xl shrink-0 hover:opacity-90 transition-all"
                      >
                        <Mail size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-[#FDFBF9] rounded-[32px] p-8 border border-[#F5F2F0]">
            <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-6">Legenda de Status</h4>
            <div className="space-y-4">
              <LegendItem color="bg-[#EADFD4]" label="Confirmado" />
              <LegendItem color="bg-[#4A433D]" label="Agendado" />
              <LegendItem color="bg-red-400" label="Cancelado" />
              <LegendItem color="bg-[#F0F7F0]" label="Realizado" />
            </div>
          </div>
        </div>

        {/* Timeline View */}
        <div className="flex-1 bg-white rounded-[40px] border border-[#F5F2F0] shadow-sm overflow-hidden min-h-[600px]">
          <div className="p-8 border-b border-[#F5F2F0] bg-white flex items-center justify-between">
            <span className="text-sm font-semibold text-[#4A433D]">Linha do Tempo</span>
            <span className="text-xs text-[#9CA3AF] font-bold uppercase tracking-widest">{dayAppointments.length} atendimentos hoje</span>
          </div>
          
          <div className="p-8 space-y-2">
            {loading ? (
              <div className="py-20 text-center text-[#9CA3AF] font-light italic">Carregando agenda...</div>
            ) : (
              hours.map(hour => {
                const appt = dayAppointments.find(a => a.time === hour);
                return (
                  <div key={hour} className="flex gap-8 group">
                    <div className="w-16 py-4 text-xs font-bold text-[#9CA3AF] text-right tracking-widest">{hour}</div>
                    <div className="flex-1 border-l border-[#F5F2F0] pl-8 py-4 relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#F5F2F0] group-hover:bg-[#9CA3AF] transition-colors" />
                      
                      {appt ? (
                        <motion.div 
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`p-6 rounded-[24px] shadow-sm flex items-center justify-between group/card transition-all ${
                            appt.status === 'confirmed' ? 'bg-[#EADFD4]/10 border border-[#EADFD4]/20' :
                            appt.status === 'completed' ? 'bg-[#F0F7F0] border border-[#E5EFE5]' :
                            appt.status === 'cancelled' ? 'bg-red-50 border border-red-100' :
                            'bg-[#FDFBF9] border border-[#F5F2F0]'
                          }`}
                        >
                          <button
                            onClick={() => handleOpenPatient(appt)}
                            className="flex items-center gap-4 text-left hover:opacity-70 transition-opacity"
                            title={appt.patientId ? 'Abrir prontuário' : 'Vincular a um paciente cadastrado'}
                          >
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-[#9CA3AF] border border-[#F5F2F0] shadow-sm">
                              <User size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[#4A433D] flex items-center gap-2">
                                {appt.patientName}
                                {appt.checkedInAt && appt.status !== 'completed' && (
                                  <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Na fila</span>
                                )}
                                {!appt.patientId && (
                                  <span className="text-[8px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Sem cadastro</span>
                                )}
                              </p>
                              <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">
                                {appt.notes || 'Procedimento Estético'}
                                {appt.value ? ` • R$ ${appt.value.toFixed(2)}` : ''}
                                {seriesInfo.has(appt.id!) ? ` • Sessão ${seriesInfo.get(appt.id!)!.index} de ${seriesInfo.get(appt.id!)!.total}` : ''}
                              </p>
                            </div>
                          </button>
                          
                          <div className="flex items-center gap-4 relative">
                            <StatusBadge status={appt.status} />
                            <button
                              onClick={() => setOpenMenuId(openMenuId === appt.id ? null : appt.id!)}
                              className="p-2 text-[#9CA3AF] hover:text-[#4A433D] transition-colors"
                            >
                              <MoreHorizontal size={20} />
                            </button>
                            
                            <AnimatePresence>
                              {openMenuId === appt.id && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 10 }}
                                  className="absolute right-0 top-12 z-20 bg-white rounded-2xl border border-[#F5F2F0] shadow-xl py-3 w-52 overflow-hidden"
                                >
                                  <MenuOption onClick={() => { handleOpenPatient(appt); setOpenMenuId(null); }} label="Abrir Prontuário" color="text-[#EADFD4]" />
                                  <MenuOption onClick={() => { setEditingAppointment(appt); setOpenMenuId(null); }} label="Editar" color="text-[#4A433D]" />
                                  {!appt.checkedInAt && appt.status !== 'completed' && appt.status !== 'cancelled' && (
                                    <>
                                      <MenuOption onClick={() => handleCheckIn(appt.id!)} label="Fazer Check-in Manual" color="text-amber-500" />
                                      <MenuOption onClick={() => handleSendIntakeForm(appt)} label="Enviar Ficha via WhatsApp" color="text-[#8BA888]" />
                                      <MenuOption onClick={() => handleCopyCheckinLink(appt)} label="Copiar Link de Check-in" color="text-[#EADFD4]" />
                                      <MenuOption onClick={() => handleSendReminder(appt, 'whatsapp')} label="Lembrete por WhatsApp" color="text-[#8BA888]" />
                                      <MenuOption onClick={() => handleSendReminder(appt, 'email')} label="Lembrete por E-mail" color="text-[#8BA888]" />
                                    </>
                                  )}
                                  <MenuOption onClick={() => handleSetStatus(appt.id!, 'confirmed')} label="Confirmar" color="text-[#EADFD4]" />
                                  <MenuOption onClick={() => handleSetStatus(appt.id!, 'completed')} label="Marcar como realizado" color="text-[#8BA888]" />
                                  {appt.status === 'completed' && (
                                    <MenuOption onClick={() => handleSetStatus(appt.id!, 'confirmed')} label="Desfazer marcação de realizado" color="text-amber-500" />
                                  )}
                                  <MenuOption onClick={() => handleSetStatus(appt.id!, 'cancelled')} label="Cancelar" color="text-red-400" />
                                  <div className="h-px bg-[#F5F2F0] my-2" />
                                  <MenuOption onClick={() => handleDeleteAppointment(appt.id!)} label="Excluir agendamento" color="text-red-500" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="h-20 flex items-center px-6 rounded-2xl border border-dashed border-transparent hover:border-[#F5F2F0] hover:bg-[#FDFBF9] transition-all">
                          <button
                            onClick={() => { setPrefillTime(hour); setIsAdding(true); }}
                            className="text-[#F5F2F0] group-hover:text-[#9CA3AF] flex items-center gap-3 text-xs font-bold uppercase tracking-widest transition-all"
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
            ownerId={ownerId}
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
            ownerId={ownerId}
            onClose={() => setEditingAppointment(null)} 
            patients={patients}
            appointments={appointments}
            initialDate={editingAppointment.date}
            initialTime={editingAppointment.time}
            appointment={editingAppointment}
          />
        )}
        {linkingPatientAppt && (
          <LinkPatientModal
            user={user}
            appointment={linkingPatientAppt}
            patients={patients}
            onClose={() => setLinkingPatientAppt(null)}
            onLinked={(patientId) => {
              setLinkingPatientAppt(null);
              onOpenPatient?.(patientId);
            }}
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
      <span className="text-xs font-medium text-[#4A433D]">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: any = {
    confirmed: 'bg-[#EADFD4] text-white',
    completed: 'bg-[#F0F7F0] text-[#8BA888]',
    cancelled: 'bg-red-50 text-red-400 border border-red-100',
    scheduled: 'bg-[#FDFBF9] text-[#9CA3AF] border border-[#F5F2F0]'
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
    <button onClick={onClick} className={`w-full text-left px-5 py-2.5 text-xs font-medium hover:bg-[#FDFBF9] transition-colors ${color}`}>
      {label}
    </button>
  );
}

function AddAppointmentModal({ user, ownerId, onClose, patients, appointments, initialDate, initialTime, appointment }: any) {
  const [patientId, setPatientId] = useState(appointment?.patientId || '');
  const [date, setDate] = useState(appointment?.date || initialDate);
  const [time, setTime] = useState(appointment?.time || initialTime || '08:00');
  const [notes, setNotes] = useState(appointment?.notes || '');
  const [value, setValue] = useState(appointment?.value != null ? String(appointment.value) : '');
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none');
  const [occurrences, setOccurrences] = useState(4);
  const [saving, setSaving] = useState(false);
  const [professionals, setProfessionals] = useState<{ id: string; name: string }[]>([]);
  const [professionalId, setProfessionalId] = useState(appointment?.professionalId || '');

  useEffect(() => {
    getDocs(collection(db, 'professionals')).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
      setProfessionals(list);
      if (!professionalId && list.length > 0) setProfessionalId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addInterval = (base: Date, freq: string, n: number) => {
    const d = new Date(base);
    if (freq === 'weekly') d.setDate(d.getDate() + 7 * n);
    if (freq === 'biweekly') d.setDate(d.getDate() + 14 * n);
    if (freq === 'monthly') d.setMonth(d.getMonth() + n);
    return d;
  };

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
    const numericValue = value ? parseFloat(value) : undefined;
    const professionalName = professionals.find(p => p.id === professionalId)?.name || '';
    try {
      if (appointment?.id) {
        await updateDoc(doc(db, 'appointments', appointment.id), {
          patientId,
          patientName: patient?.name || appointment.patientName || 'Unknown',
          date,
          time,
          notes,
          value: numericValue,
          professionalId,
          professionalName,
        });
        // Se a data/hora mudou, libera o horário antigo e ocupa o novo na fila pública
        if (appointment.date !== date || appointment.time !== time) {
          await deleteDoc(doc(db, 'busySlots', slotId(ownerId || user.uid, appointment.professionalId || 'default', appointment.date, appointment.time))).catch(() => {});
          await setDoc(doc(db, 'busySlots', slotId(ownerId || user.uid, professionalId || 'default', date, time)), { clinicId: ownerId || user.uid, professionalId, date, time, apt: appointment.id }).catch(() => {});
        }
        showToast('Agendamento atualizado');
      } else if (recurrence === 'none') {
        const ref = await addDoc(collection(db, 'appointments'), {
          userId: user.uid,
          patientId,
          patientName: patient?.name || 'Unknown',
          date,
          time,
          notes,
          value: numericValue,
          status: 'scheduled',
          checkinToken: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          professionalId,
          professionalName,
        });
        await setDoc(doc(db, 'busySlots', slotId(ownerId || user.uid, professionalId || 'default', date, time)), { clinicId: ownerId || user.uid, professionalId, date, time, apt: ref.id }).catch(() => {});
        if (patient?.email) {
          fetch(`${EMAIL_SERVICE_URL}/api/send-confirmation-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appointmentId: ref.id }),
          }).catch(() => {});
        }
        showToast('Agendamento realizado');
      } else {
        // Agendamento recorrente: cria N ocorrências de uma vez, pulando horários já ocupados
        const seriesId = `series-${Date.now()}`;
        const [year, month, day] = date.split('-').map(Number);
        const baseDate = new Date(year, month - 1, day);
        let created = 0;
        let skipped = 0;
        for (let i = 0; i < occurrences; i++) {
          const occDate = addInterval(baseDate, recurrence, i);
          const occDateStr = localDateStr(occDate);
          const hasConflict = appointments.some((a: any) =>
            a.date === occDateStr && a.time === time && a.status !== 'cancelled'
          );
          if (hasConflict) { skipped++; continue; }
          const ref = await addDoc(collection(db, 'appointments'), {
            userId: user.uid,
            patientId,
            patientName: patient?.name || 'Unknown',
            date: occDateStr,
            time,
            notes,
            value: numericValue,
            status: 'scheduled',
            seriesId,
            checkinToken: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            professionalId,
            professionalName,
          });
          await setDoc(doc(db, 'busySlots', slotId(ownerId || user.uid, professionalId || 'default', occDateStr, time)), { clinicId: ownerId || user.uid, professionalId, date: occDateStr, time, apt: ref.id }).catch(() => {});
          created++;
        }
        showToast(skipped > 0 ? `${created} agendamentos criados, ${skipped} pulados por conflito` : `${created} agendamentos criados`);
      }
      onClose();
    } catch (err) {
      showToast(appointment?.id ? 'Erro ao atualizar agendamento' : 'Erro ao agendar', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="serif text-2xl text-[#4A433D] mb-8">{appointment ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Paciente</label>
            <select 
              required
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light appearance-none text-sm"
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
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Data</label>
              <input 
                type="date"
                required
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Horário</label>
              <select 
                required
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light appearance-none text-sm"
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
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Procedimento</label>
            <input 
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ex: Harmonização Facial, Botox..."
            />
          </div>

          {!appointment && (
            <div className="p-6 bg-[#FDFBF9] rounded-3xl border border-[#F5F2F0] space-y-4">
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest ml-1">Recorrência</label>
              <select
                className="w-full bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light appearance-none text-sm"
                value={recurrence}
                onChange={e => setRecurrence(e.target.value as any)}
              >
                <option value="none">Não repetir</option>
                <option value="weekly">Semanalmente</option>
                <option value="biweekly">A cada 2 semanas</option>
                <option value="monthly">Mensalmente</option>
              </select>
              {recurrence !== 'none' && (
                <div>
                  <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Número de sessões</label>
                  <input 
                    type="number"
                    min="2"
                    max="52"
                    className="w-full bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
                    value={occurrences}
                    onChange={e => setOccurrences(parseInt(e.target.value) || 2)}
                  />
                </div>
              )}
            </div>
          )}
          
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all"
            >
              {saving ? 'Salvando...' : appointment ? 'Salvar Alterações' : 'Confirmar Agenda'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// Vincula um agendamento sem paciente cadastrado (ex: veio da página pública de agendamento)
// a um paciente — escolhendo um já existente ou criando um novo a partir do nome/telefone
// que já foram informados. Depois de vincular, já abre o prontuário direto.
function LinkPatientModal({ user, appointment, patients, onClose, onLinked }: {
  user: FirebaseUser,
  appointment: Appointment,
  patients: Patient[],
  onClose: () => void,
  onLinked: (patientId: string) => void,
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (mode === 'existing' && !selectedPatientId) {
      showToast('Selecione um paciente', 'error');
      return;
    }
    setSaving(true);
    try {
      let patientId = selectedPatientId;
      if (mode === 'new') {
        const ref = await addDoc(collection(db, 'patients'), {
          userId: user.uid,
          name: appointment.patientName,
          phone: appointment.guestPhone || '',
          updatedAt: new Date().toISOString(),
        });
        patientId = ref.id;
      }
      await updateDoc(doc(db, 'appointments', appointment.id!), { patientId });
      showToast('Paciente vinculado');
      onLinked(patientId);
    } catch (err) {
      showToast('Erro ao vincular paciente', 'error');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl"
      >
        <h2 className="serif text-2xl text-[#4A433D] mb-2">Vincular Paciente</h2>
        <p className="text-xs text-[#9CA3AF] font-light mb-8">
          Este agendamento ainda não tem um prontuário — {appointment.patientName}
          {appointment.guestPhone ? ` • ${appointment.guestPhone}` : ''}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${
                mode === 'new' ? 'bg-[#EADFD4] text-white border-[#EADFD4]' : 'bg-white text-[#9CA3AF] border-[#F5F2F0]'
              }`}
            >
              Criar Novo Prontuário
            </button>
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${
                mode === 'existing' ? 'bg-[#EADFD4] text-white border-[#EADFD4]' : 'bg-white text-[#9CA3AF] border-[#F5F2F0]'
              }`}
            >
              Já é Paciente
            </button>
          </div>

          {mode === 'new' && (
            <p className="text-xs text-[#9CA3AF] font-light italic p-4 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0]">
              Cria um prontuário novo com o nome e telefone já informados no agendamento.
              Você completa o resto (anamnese, etc.) depois.
            </p>
          )}

          {mode === 'existing' && (
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Selecionar Paciente</label>
              <select
                required
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light appearance-none text-sm"
                value={selectedPatientId}
                onChange={e => setSelectedPatientId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all"
            >
              {saving ? 'Vinculando...' : 'Vincular e Abrir Prontuário'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
