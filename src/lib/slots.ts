import { getDoc, doc, Firestore, runTransaction } from 'firebase/firestore';

// Horário de atendimento padrão (usado só se a clínica ainda não configurou nada em
// Configurações → Horário de Atendimento)
export const CLINIC_HOURS = Array.from({ length: 14 }, (_, i) => {
  const h = i + 8;
  return `${h < 10 ? '0' + h : h}:00`;
});

// Gera a lista de horários disponíveis a partir da configuração real da clínica
// (início, fim, intervalo entre atendimentos) — usado pela página pública de agendamento.
export function generateTimeSlots(start: string, end: string, intervalMinutes: number): string[] {
  const slots: string[] = [];
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let current = startH * 60 + startM;
  const endTotal = endH * 60 + endM;
  while (current < endTotal) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    current += intervalMinutes;
  }
  return slots;
}

// ID determinístico do documento em busySlots — usado pra "reservar" um horário de forma
// atômica: se o slot já existir, a escrita cai na regra de update (sempre negada), então
// duas pessoas nunca conseguem ocupar o mesmo horário ao mesmo tempo.
export function slotId(clinicId: string, professionalId: string, date: string, time: string): string {
  return `${clinicId}_${professionalId}_${date}_${time.replace(':', '')}`;
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
export function cancelLink(appointmentId: string, token: string, date: string, time: string, clinicId: string, professionalId?: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#cancelar?apt=${appointmentId}&token=${token}&date=${date}&time=${time}&clinic=${clinicId}${professionalId ? `&prof=${professionalId}` : ''}`;
}

// Link de assinatura remota de termo, pelo próprio paciente, sem login — o token (que é
// o próprio ID do documento signRequests) é o "segredo": só quem tem o link consegue ler
// e assinar aquele pedido específico.
export function remoteSignLink(requestId: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#assinar/${requestId}`;
}

// Link do convite pra Ficha Clínica de Harmonização Facial — independente de
// agendamento, usado no cadastro manual e no reenvio pelo menu de check-in.
export function intakeInviteLink(token: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#ficha/${token}`;
}

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

// Normaliza CPF (só dígitos, sem pontos/traço) — usado como base do ID determinístico
// no índice CPF → paciente (patientCpfIndex). CPF é o identificador principal do
// paciente agora (não o telefone), justamente porque não muda quando a pessoa troca de
// número ou de e-mail — evita abrir um segundo prontuário pra quem já é paciente.
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function isValidCpfFormat(cpf: string): boolean {
  return normalizeCpf(cpf).length === 11;
}

export function cpfIndexKey(clinicId: string, cpf: string): string {
  return `${clinicId}_${normalizeCpf(cpf)}`;
}

// UID canônico "dono" da clínica — usado como identificador fixo em tudo que precisa
// ser compartilhado entre os administradores (configurações, horários bloqueados,
// índices de busca), em vez do UID de quem está logado no momento. Sem isso, o segundo
// administrador (com um UID diferente do primeiro) veria configurações vazias e poderia
// até criar horários "bloqueados" duplicados que não colidem com os do primeiro.
// Financeiro (aba, gráficos de receita, tudo relacionado a dinheiro da clínica) é visível
// só pra esses dois e-mails especificamente — não é o mesmo critério de "administrador"
// (que pode incluir outras pessoas no futuro sem necessariamente dar acesso financeiro).
const FINANCE_AUTHORIZED_EMAILS = ['contato.dravitoriaoliveira@gmail.com', 'thifcms@gmail.com'];
export function hasFinanceAccess(email: string | null | undefined): boolean {
  return !!email && FINANCE_AUTHORIZED_EMAILS.includes(email.toLowerCase());
}

export async function getClinicOwnerId(db: Firestore): Promise<string> {
  const snap = await getDoc(doc(db, 'publicConfig', 'booking'));
  const ownerId = snap.exists() ? snap.data().ownerId : null;
  if (!ownerId) throw new Error('Não foi possível determinar o dono da clínica (publicConfig/booking sem ownerId)');
  return ownerId;
}

// URL do serviço independente de e-mail de confirmação (clinica-email-service).
// Atualize este valor depois de publicar o serviço no Render (ou onde for hospedado).
// Enquanto estiver com o valor de exemplo abaixo, o envio automático de e-mail fica
// silenciosamente desativado (falha graciosamente, sem quebrar o agendamento).
export const EMAIL_SERVICE_URL = 'https://clinica-email-service.vercel.app';

// Converte um valor em reais digitado livremente pra número, aceitando tanto o padrão
// brasileiro (vírgula decimal, ponto de milhar: "1.234,56") quanto alguém digitando com
// ponto decimal por hábito de teclado numérico ("350.50") — sem isso, "350.50" acabava
// sendo lido como "35050" (interpretando o ponto como separador de milhar por engano).
// Regra: se tem vírgula, ela é o separador decimal e qualquer ponto antes dela é milhar.
// Se não tem vírgula, o último ponto (se só um) é tratado como decimal.
export function parseCurrencyInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  let normalized: string;
  if (trimmed.includes(',')) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else {
    const dotCount = (trimmed.match(/\./g) || []).length;
    normalized = dotCount > 1 ? trimmed.replace(/\./g, '') : trimmed;
  }
  const value = parseFloat(normalized);
  return isNaN(value) ? 0 : value;
}

// Número sequencial de orçamento — cresce sempre, nunca repete, mesmo com duas pessoas
// confirmando orçamentos ao mesmo tempo em dispositivos diferentes. Usa uma transação
// atômica do Firestore: lê o último número usado e grava o próximo numa operação só,
// que o próprio Firestore garante não se sobrepor entre execuções simultâneas.
export async function getNextBudgetNumber(db: Firestore): Promise<number> {
  const counterRef = doc(db, 'system', 'budgetCounter');
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const next = (snap.exists() ? snap.data().lastNumber : 0) + 1;
    transaction.set(counterRef, { lastNumber: next }, { merge: true });
    return next;
  });
}
