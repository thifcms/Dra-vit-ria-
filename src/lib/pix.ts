// Gera o "Pix Copia e Cola" (código EMV/BR Code) seguindo o padrão oficial do Banco
// Central — mesmo formato que qualquer banco/carteira digital lê. Isso é 100% gerado no
// próprio navegador, sem depender de nenhuma API paga de gateway de pagamento: como é um
// Pix "estático" com chave fixa, o dinheiro cai direto na conta cadastrada, sem
// intermediário.
//
// IMPORTANTE — limitação real: como não tem gateway de pagamento por trás, o app NÃO
// tem como saber sozinho se o Pix foi pago ou não. É preciso confirmar manualmente (ver
// o extrato do banco) e marcar o orçamento como pago no app, do jeito que já era feito
// antes pra outros métodos de pagamento.

function crc16(payload: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

// Remove acentos e caracteres fora do padrão aceito pelo Pix (só ASCII básico) — nome
// da clínica e cidade não podem ter "ã", "ç" etc, senão o código fica inválido
function sanitizePixText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim();
}

export interface PixParams {
  pixKey: string;
  merchantName: string; // até 25 caracteres
  merchantCity: string; // até 15 caracteres
  amount?: number; // se omitido, o Pix vem sem valor — quem paga digita quanto
  txid?: string; // identificador da cobrança, até 25 caracteres alfanuméricos
  description?: string; // até 40 caracteres
}

export function buildPixPayload(params: PixParams): string {
  const key = params.pixKey.trim();
  const name = sanitizePixText(params.merchantName).slice(0, 25) || 'CLINICA';
  const city = sanitizePixText(params.merchantCity).slice(0, 15) || 'BRASIL';
  const txid = (params.txid || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';

  const merchantAccountInfo = [
    tlv('00', 'br.gov.bcb.pix'),
    tlv('01', key),
    ...(params.description ? [tlv('02', sanitizePixText(params.description).slice(0, 40))] : []),
  ].join('');

  const additionalData = tlv('05', txid);

  const parts = [
    tlv('00', '01'), // Payload Format Indicator
    tlv('26', merchantAccountInfo), // Merchant Account Information — Pix
    tlv('52', '0000'), // Merchant Category Code
    tlv('53', '986'), // Moeda — Real (BRL)
    ...(params.amount && params.amount > 0 ? [tlv('54', params.amount.toFixed(2))] : []),
    tlv('58', 'BR'), // País
    tlv('59', name), // Nome do recebedor
    tlv('60', city), // Cidade do recebedor
    tlv('62', additionalData), // Dados adicionais (txid)
  ].join('');

  const withCrcPlaceholder = `${parts}6304`;
  const crc = crc16(withCrcPlaceholder);
  return `${withCrcPlaceholder}${crc}`;
}

// Valida minimamente se uma chave Pix parece válida (CPF, CNPJ, e-mail, telefone ou
// chave aleatória) — não garante que a chave existe de verdade, só que tem um formato
// aceitável, pra evitar erros óbvios de digitação antes de gerar o código
export function isValidPixKeyFormat(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  const cpfCnpj = /^\d{11}$|^\d{14}$/;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phone = /^\+?\d{10,13}$/;
  const randomKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return cpfCnpj.test(trimmed.replace(/\D/g, '')) || email.test(trimmed) || phone.test(trimmed.replace(/[\s()-]/g, '')) || randomKey.test(trimmed);
}
