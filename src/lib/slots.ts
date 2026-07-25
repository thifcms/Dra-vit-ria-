// Horário de atendimento padrão usado tanto na agenda interna quanto na página pública
export const CLINIC_HOURS = Array.from({ length: 14 }, (_, i) => {
  const h = i + 8;
  return `${h < 10 ? '0' + h : h}:00`;
});

// ID determinístico do documento em busySlots — usado pra "reservar" um horário de forma
// atômica: se o slot já existir, a escrita cai na regra de update (sempre negada), então
// duas pessoas nunca conseguem ocupar o mesmo horário ao mesmo tempo.
export function slotId(clinicId: string, date: string, time: string): string {
  return `${clinicId}_${date}_${time.replace(':', '')}`;
}

// Link de check-in do próprio paciente. O token é o "segredo": só quem tem o link
// consegue confirmar a chegada daquele agendamento específico — ninguém consegue listar
// ou acessar dados de outros pacientes a partir dele. date/time vêm só pra exibição
// (não têm função de segurança, evitam precisar ler o agendamento pra mostrar o horário).
export function checkinLink(appointmentId: string, token: string, date: string, time: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#checkin?apt=${appointmentId}&token=${token}&date=${date}&time=${time}`;
}

// Link de cancelamento do próprio paciente — mesma lógica de segurança do check-in
// (token secreto), mas também carrega o clinicId, necessário pra liberar o horário
// (busySlot) correspondente depois de cancelar.
export function cancelLink(appointmentId: string, token: string, date: string, time: string, clinicId: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#cancelar?apt=${appointmentId}&token=${token}&date=${date}&time=${time}&clinic=${clinicId}`;
}

// Normaliza telefone (só dígitos, com DDI 55 se não tiver) — usado como base do ID
// determinístico no índice telefone → paciente (patientPhoneIndex).
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function phoneIndexKey(clinicId: string, phone: string): string {
  return `${clinicId}_${normalizePhone(phone)}`;
}

// URL do serviço independente de e-mail de confirmação (clinica-email-service).
// Atualize este valor depois de publicar o serviço no Render (ou onde for hospedado).
// Enquanto estiver com o valor de exemplo abaixo, o envio automático de e-mail fica
// silenciosamente desativado (falha graciosamente, sem quebrar o agendamento).
export const EMAIL_SERVICE_URL = 'https://clinica-email-service.onrender.com';
