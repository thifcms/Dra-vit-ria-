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

// wa.me sempre abre a versão web primeiro no navegador, mesmo com o WhatsApp Desktop já
// instalado no computador — o protocolo whatsapp:// é o que o próprio app registra no
// sistema operacional pra abrir direto nele. Tenta o protocolo do app primeiro (troca a
// própria aba de lugar, o que só funciona se algo "pegar" o link); se depois de um
// tempinho a aba ainda estiver na mesma página (sinal de que nada capturou o protocolo,
// ou seja, o app não está instalado), cai pro wa.me numa aba nova como já era antes.
export function openWhatsApp(phone: string, message: string): void {
  const appUrl = `whatsapp://send?phone=${normalizePhoneForWhatsapp(phone)}&text=${encodeURIComponent(message)}`;
  const webUrl = whatsappLink(phone, message);
  let handedOff = false;
  const onBlur = () => { handedOff = true; };
  window.addEventListener('blur', onBlur);
  window.location.href = appUrl;
  setTimeout(() => {
    window.removeEventListener('blur', onBlur);
    if (!handedOff && !document.hidden) {
      window.open(webUrl, '_blank');
    }
  }, 1200);
}

export function emailLink(email: string, clinicName: string, message: string): string {
  const subject = `Lembrete de consulta — ${clinicName}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

// Versão genérica, com assunto customizável — usada pra enviar links de assinatura
// remota (termo, anamnese, orçamento), que não são lembretes de consulta.
export function genericEmailLink(email: string, subject: string, message: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

// Mensagem de repescagem — enviada quando um paciente falta, sugerindo remarcar. Tom
// acolhedor, sem cobrança, pra não soar como reprimenda e reduzir a chance de a pessoa
// simplesmente não responder por vergonha de ter faltado.
export function buildNoShowFollowUpMessage(params: {
  patientName: string;
  clinicName: string;
  bookingUrl?: string;
}): string {
  const { patientName, clinicName, bookingUrl } = params;
  const lines = [
    `Olá, ${patientName}! Sentimos sua falta hoje na ${clinicName} 💛`,
    '',
    'Sabemos que imprevistos acontecem — sem problema nenhum! Quando quiser, é só nos chamar aqui que já remarcamos um novo horário pra você.',
    bookingUrl ? '' : '',
    bookingUrl ? `Ou, se preferir, agende direto por aqui: ${bookingUrl}` : '',
  ].filter(l => l !== undefined);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
