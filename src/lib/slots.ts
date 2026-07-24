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
