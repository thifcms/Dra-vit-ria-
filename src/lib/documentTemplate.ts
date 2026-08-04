// Modelo visual único pra todo documento que o paciente assina ou que é impresso —
// mesma aparência da Ficha Clínica de Harmonização Facial: logo centralizada no topo,
// faixa colorida com o título, conteúdo em blocos com bordas arredondadas, marca da
// clínica no rodapé.
export function buildLetterheadHtml({
  title,
  clinicName,
  bodyHtml,
  footerHtml,
  documentLabel,
}: {
  title: string;
  clinicName: string;
  bodyHtml: string;
  footerHtml?: string;
  documentLabel?: string; // usado no <title> da aba do navegador
}): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${documentLabel || title} — ${clinicName}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Georgia', serif;
          max-width: 720px;
          margin: 40px auto;
          padding: 0 24px 60px;
          color: #4A433D;
          background: #FDFBF9;
        }
        .logo { display: block; max-width: 210px; margin: 0 auto 24px; }
        .title-bar {
          background: #EADFD4;
          color: #FFFFFF;
          text-align: center;
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          margin-bottom: 32px;
          font-family: Arial, sans-serif;
        }
        .box {
          background: #FFFFFF;
          border: 1px solid #F0EAE3;
          border-radius: 20px;
          padding: 22px 26px;
          margin-bottom: 20px;
        }
        .box p { margin: 0 0 8px; font-size: 14px; line-height: 1.7; }
        .box p:last-child { margin-bottom: 0; }
        .box-label {
          font-family: Arial, sans-serif;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: #9CA3AF;
          margin-bottom: 10px;
        }
        .footer-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 40px;
          font-family: Arial, sans-serif;
          font-size: 12px;
          color: #4A433D;
        }
        .footer-mark { width: 34px; opacity: 0.5; }
        .print-btn {
          display: block;
          margin: 0 auto 28px;
          padding: 12px 28px;
          background: #4A433D;
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 12px;
          font-family: Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          cursor: pointer;
        }
        @media print {
          .print-btn { display: none; }
          body { margin: 10px auto; background: white; }
        }
      </style>
    </head>
    <body>
      <button class="print-btn" onclick="window.print()">Imprimir</button>
      <img class="logo" src="/logo/logo-full-v2.png" alt="${clinicName}" />
      <div class="title-bar">${title}</div>
      ${bodyHtml}
      ${footerHtml || ''}
    </body>
    </html>
  `;
}
