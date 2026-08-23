// Modelo visual único pra todo documento que o paciente assina ou que é impresso —
// mesma aparência da Ficha Clínica de Harmonização Facial: logo centralizada no topo,
// faixa colorida de ponta a ponta com o título, conteúdo em blocos com bordas
// arredondadas, marca da clínica no rodapé.
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
  // Caminho absoluto pro logo — dentro da janela pop-up de impressão (aberta via
  // window.open('', '_blank') + document.write), um caminho relativo como
  // "/logo/..." às vezes não resolve corretamente contra o endereço certo do site
  // (a janela em branco pode não herdar a origem direito em todo navegador/celular),
  // o que fazia o logo aparecer quebrado. Caminho absoluto resolve isso de vez.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const logoUrl = `${origin}/logo/logo-full-v3.png`;
  // A marca d'água usa a versão SEM o texto "Dra. Vitória Oliveira" — só o símbolo —
  // já que ela aparece espalhada e repetida ao fundo do documento inteiro; o texto
  // repetido várias vezes ficaria poluído, o símbolo sozinho funciona melhor como
  // textura de fundo.
  const watermarkUrl = `${origin}/logo/logo-mark-v3.png`;

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
          margin: 0;
          padding: 0 0 60px;
          color: #4A433D;
          background: #FDFBF9;
          position: relative;
        }
        .print-btn {
          display: block;
          margin: 24px auto 0;
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
        .logo { display: block; max-width: 210px; margin: 24px auto 20px; }
        .title-bar {
          background: #EADFD4;
          color: #FFFFFF;
          text-align: center;
          padding: 12px 20px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-family: Arial, sans-serif;
          width: 100%;
        }
        .content {
          max-width: 720px;
          margin: 32px auto 0;
          padding: 0 24px;
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
        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 108%;
          max-width: 790px;
          opacity: 0.06;
          z-index: 5;
          pointer-events: none;
        }
        .logo, .content {
          position: relative;
          z-index: 1;
        }
        .title-bar {
          position: relative;
          z-index: 6;
        }
        @media print {
          .print-btn { display: none; }
          /* Repete o rodapé (dados da clínica) em toda folha impressa, não só na
             última — comum em documentos com mais de uma página de conteúdo */
          .print-footer-fixed {
            position: fixed;
            bottom: 10mm;
            left: 20mm;
            right: 20mm;
          }
          .content { padding-bottom: 25mm; }
        }
      </style>
    </head>
    <body>
      <button class="print-btn" onclick="window.print()">Imprimir</button>
      <img class="logo" src="${logoUrl}" alt="${clinicName}" />
      <div class="title-bar">${title}</div>
      <div class="content">
        ${bodyHtml}
      </div>
      <div class="print-footer-fixed">
        ${footerHtml || ''}
      </div>
      <img class="watermark" src="${watermarkUrl}" alt="" />
    </body>
    </html>
  `;
}
