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

// Data de hoje (ou de qualquer Date) no formato AAAA-MM-DD, no FUSO HORÁRIO LOCAL do
// navegador — nunca use `.toISOString().split('T')[0]` pra isso, porque toISOString()
// sempre converte pra UTC/Greenwich. No Brasil (3h atrás de Greenwich), isso fazia o
// sistema achar que já era "amanhã" a partir das 21h, gerando agendamentos com a data
// errada e a agenda não batendo com o que o usuário via no relógio.
export function localDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayLocalStr(): string {
  return localDateStr(new Date());
}

export function phoneIndexKey(clinicId: string, phone: string): string {
  return `${clinicId}_${normalizePhone(phone)}`;
}

// URL do serviço independente de e-mail de confirmação (clinica-email-service).
// Atualize este valor depois de publicar o serviço no Render (ou onde for hospedado).
// Enquanto estiver com o valor de exemplo abaixo, o envio automático de e-mail fica
// silenciosamente desativado (falha graciosamente, sem quebrar o agendamento).
export const EMAIL_SERVICE_URL = 'https://clinica-email-service.vercel.app';
