// Monta o link de WhatsApp (wa.me) e o link de e-mail (mailto:) pra lembrar o paciente
// da consulta, com o link de check-in e instruções básicas. Não envia nada sozinho — abre
// o WhatsApp/e-mail do dispositivo já com a mensagem pronta, pra quem estiver operando a
// agenda mandar com um clique.

// Normaliza telefone brasileiro pro formato que o wa.me exige (só dígitos, com código do país)
export function normalizePhoneForWhatsapp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function buildReminderMessage(params: {
  patientName: string;
  clinicName: string;
  professionalName?: string;
  address?: string;
  dateLabel: string;
  time: string;
  checkinUrl: string;
  cancelUrl?: string;
}): string {
  const { patientName, clinicName, professionalName, address, dateLabel, time, checkinUrl, cancelUrl } = params;
  const lines = [
    `Olá, ${patientName}! Este é um lembrete da sua consulta na ${clinicName}${professionalName ? ` com ${professionalName}` : ''}.`,
    '',
    `📅 ${dateLabel} às ${time}`,
    address ? `📍 ${address}` : '',
    '',
    'Chegue com 10 minutos de antecedência e leve um documento com foto.',
    '',
    `Ao chegar, confirme sua chegada por este link: ${checkinUrl}`,
    cancelUrl ? '' : '',
    cancelUrl ? `Não vai poder vir? Cancele por aqui, sem precisar ligar: ${cancelUrl}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhoneForWhatsapp(phone)}?text=${encodeURIComponent(message)}`;
}

export function emailLink(email: string, clinicName: string, message: string): string {
  const subject = `Lembrete de consulta — ${clinicName}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
