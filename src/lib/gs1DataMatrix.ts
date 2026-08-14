// Interpreta o texto decodificado de um código GS1 DataMatrix, extraindo lote e
// validade — o padrão usado em caixas de insumos médicos/estéticos no Brasil (toxina,
// preenchedor, etc), conforme recomendado pela ANVISA/SNCM. O código carrega vários
// "Identificadores de Aplicação" (AI) grudados um no outro, cada um com um número de
// 2 dígitos + um tamanho de campo fixo ou variável:
//   (01) GTIN — 14 dígitos fixos
//   (10) Lote — até 20 caracteres, tamanho variável (terminado por separador ou fim da string)
//   (17) Validade — 6 dígitos fixos, formato AAMMDD
//   (21) Número de série — até 20 caracteres, tamanho variável
// O separador entre campos variáveis costuma ser o caractere GS (0x1D, invisível) —
// tratamos tanto esse caractere quanto o fim da string como fim de campo.
export interface ParsedGS1 {
  gtin?: string;
  lotNumber?: string;
  expiryDate?: string; // convertido pra AAAA-MM-DD, formato usado no resto do app
  serialNumber?: string;
}

const GS_SEPARATOR = String.fromCharCode(29); // caractere GS (Group Separator)

export function parseGS1DataMatrix(raw: string): ParsedGS1 {
  const result: ParsedGS1 = {};
  let text = raw;
  // Alguns leitores/impressoras prefixam com "]d2" (identificador de simbologia
  // DataMatrix) — remove se presente, não faz parte do conteúdo real
  if (text.startsWith(']d2')) text = text.slice(3);

  let i = 0;
  while (i < text.length) {
    const ai = text.slice(i, i + 2);
    if (ai === '01') {
      // GTIN — sempre 14 dígitos, tamanho fixo
      result.gtin = text.slice(i + 2, i + 16);
      i += 16;
    } else if (ai === '17') {
      // Validade — sempre 6 dígitos (AAMMDD), tamanho fixo
      const raw6 = text.slice(i + 2, i + 8);
      if (/^\d{6}$/.test(raw6)) {
        const yy = raw6.slice(0, 2);
        const mm = raw6.slice(2, 4);
        const dd = raw6.slice(4, 6);
        // GS1 usa regra de "janela" pra 2 dígitos de ano — assume-se 20XX aqui, já
        // que não faz sentido um insumo médico ter validade nos anos 1900
        result.expiryDate = `20${yy}-${mm}-${dd}`;
      }
      i += 8;
    } else if (ai === '10' || ai === '21') {
      // Lote e número de série — tamanho VARIÁVEL, vai até achar o separador GS ou o
      // fim da string
      const rest = text.slice(i + 2);
      const sepIdx = rest.indexOf(GS_SEPARATOR);
      const value = sepIdx >= 0 ? rest.slice(0, sepIdx) : rest;
      if (ai === '10') result.lotNumber = value;
      else result.serialNumber = value;
      i += 2 + value.length + (sepIdx >= 0 ? 1 : 0);
      if (sepIdx < 0) break; // campo variável sem separador — assume que é o último, encerra
    } else {
      // Identificador que não reconhecemos — não dá pra saber o tamanho do campo com
      // segurança, então para por aqui em vez de arriscar interpretar tudo errado
      break;
    }
  }
  return result;
}
