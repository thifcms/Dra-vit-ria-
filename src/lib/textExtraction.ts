// Extrai texto de um PDF ou de uma foto (OCR) — usado na aba de Exames pra já colar o
// conteúdo direto no prontuário, sem precisar digitar tudo de novo. Tudo roda no próprio
// navegador (nenhum arquivo é enviado pra nenhum serviço externo de OCR).

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  // O worker é servido pelo próprio app (copiado de node_modules/pdfjs-dist/build/ pra
  // public/ no momento do build) em vez de depender de um CDN externo — mais confiável e
  // não depende da disponibilidade de terceiros.
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  return fullText.trim();
}

// tesseract.js causava um erro grave em todo o app quando instalado via npm/bundler nesse
// projeto ("Cannot read properties of undefined (reading 'exports')", em toda tela, não só
// quando usado) — confirmado por teste isolado. Carregando pela build UMD publicada no CDN
// oficial (via <script>), em vez de importar como módulo, evita esse conflito por completo.
declare global {
  interface Window {
    Tesseract?: any;
  }
}

function loadTesseractScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error('Tesseract não carregou corretamente'));
    };
    script.onerror = () => reject(new Error('Falha ao carregar o motor de OCR'));
    document.head.appendChild(script);
  });
}

export async function extractTextFromImage(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const Tesseract = await loadTesseractScript();
  const result = await Tesseract.recognize(file, 'por', {
    logger: (m: any) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  return result.data.text.trim();
}
