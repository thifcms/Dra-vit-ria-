import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { X, ScanLine } from 'lucide-react';
import { parseGS1DataMatrix, ParsedGS1 } from '../lib/gs1DataMatrix';

// Modal de leitura de código de barras GS1 DataMatrix, usando a câmera do celular —
// aponta pro código na caixa do insumo e o lote/validade preenchem sozinhos, sem
// precisar digitar (e sem risco de erro de digitação). Fecha sozinho assim que
// consegue ler algo com sucesso.
export default function BarcodeScannerModal({ onScanned, onClose }: {
  onScanned: (data: ParsedGS1) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    const hints = new Map();
    // Restringe aos formatos relevantes — DataMatrix é o padrão GS1 usado em insumos
    // médicos, mas alguns fornecedores também usam QR ou Code128 com o mesmo
    // conteúdo GS1, então aceita os três pra cobrir mais casos
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
    ]);
    const codeReader = new BrowserMultiFormatReader(hints);
    let active = true;
    let controls: { stop: () => void } | undefined;

    codeReader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current!,
      (result, err) => {
        if (!active) return;
        if (result) {
          const parsed = parseGS1DataMatrix(result.getText());
          if (parsed.lotNumber || parsed.expiryDate) {
            active = false;
            setScanning(false);
            controls?.stop();
            onScanned(parsed);
          }
        }
        // NotFoundException dispara a cada frame sem código visível — é o
        // comportamento normal enquanto procura, não é um erro de verdade
      }
    ).then(c => { controls = c; }).catch(err => {
      setError(err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
        ? 'Permissão de câmera negada — autorize o acesso à câmera nas configurações do navegador.'
        : 'Não foi possível acessar a câmera neste dispositivo.');
    });

    return () => {
      active = false;
      controls?.stop();
    };
  }, [onScanned]);

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-6">
      <div className="bg-white/85 backdrop-blur-xl rounded-[32px] p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-[#4A433D] flex items-center gap-2">
            <ScanLine size={18} className="text-[#8BA888]" /> Escanear código do lote
          </p>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#4A433D]">
            <X size={20} />
          </button>
        </div>
        {error ? (
          <p className="text-xs text-red-400 py-8 text-center">{error}</p>
        ) : (
          <>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              <video ref={videoRef} className="w-full h-full object-cover" />
              <div className="absolute inset-8 border-2 border-[#8BA888] rounded-2xl pointer-events-none" />
            </div>
            <p className="text-[10px] text-[#9CA3AF] text-center mt-4">
              Aponte a câmera pro código GS1 DataMatrix (ou QR/Code128) na caixa do produto.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
