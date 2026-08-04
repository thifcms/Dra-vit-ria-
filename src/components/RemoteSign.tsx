import React, { useState, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';
import SignaturePad from 'react-signature-canvas';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { SignRequest } from '../types';

// Página pública de assinatura de termo — o paciente recebe esse link pelo WhatsApp e
// assina do próprio celular, sem precisar estar presente na clínica. O ID na URL É o
// segredo (não dá pra listar ou adivinhar pedidos de outros pacientes); a assinatura é
// guardada como imagem direto no próprio documento (não usa o Storage, que exigiria uma
// regra pública nova e mais arriscada só pra essa função).
export default function RemoteSign() {
  const requestId = window.location.hash.replace(/^#assinar\/?/, '');

  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<SignRequest | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const sigPad = useRef<any>(null);

  React.useEffect(() => {
    if (!requestId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'signRequests', requestId))
      .then(snap => {
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          const data = snap.data() as SignRequest;
          setRequest(data);
          if (data.status === 'signed') setDone(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handleSign = async () => {
    if (!sigPad.current || sigPad.current.isEmpty() || !request) return;
    setSigning(true);
    try {
      const signatureUrl = sigPad.current.toDataURL(); // base64 — guardado direto no documento
      await updateDoc(doc(db, 'signRequests', requestId), {
        status: 'signed',
        signedAt: new Date().toISOString(),
        signatureUrl,
      });
      setDone(true);
    } catch (err) {
      alert('Erro ao processar a assinatura. Tenta de novo em alguns instantes.');
    }
    setSigning(false);
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9]">
        <div className="w-8 h-8 border-2 border-[#EADFD4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !request) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6 text-center gap-4">
        <XCircle size={40} className="text-[#9CA3AF]" />
        <p className="text-[#4A433D] font-medium">Link inválido ou expirado.</p>
        <p className="text-sm text-[#9CA3AF] font-light">Entre em contato com a clínica pra receber um novo link.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6 text-center gap-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <CheckCircle2 size={48} className="text-[#8BA888]" />
        </motion.div>
        <p className="text-[#4A433D] font-medium text-lg">Documento assinado com sucesso!</p>
        <p className="text-sm text-[#9CA3AF] font-light max-w-xs">
          Já registramos sua assinatura. Pode fechar esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9]" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="text-center pt-10 pb-6 px-6">
        <img src="/logo/logo-full-v2.png" alt="" className="h-16 w-auto mx-auto object-contain" />
      </div>
      <div className="bg-[#EADFD4] py-3 px-6 text-center mb-8">
        <p className="text-white text-[10px] font-bold uppercase tracking-[0.2em]">{request.templateTitle}</p>
      </div>

      <div className="max-w-lg mx-auto px-6 pb-16">
        <p className="text-sm text-[#9CA3AF] font-light mb-6 text-center">Paciente: <span className="text-[#4A433D] font-medium">{request.patientName}</span></p>

        <div className="p-6 bg-white border border-[#F0EAE3] rounded-[20px] text-sm text-[#4A433D] leading-relaxed max-h-72 overflow-y-auto shadow-sm space-y-3 mb-8">
          {request.templateContent
            .split(/\n{2,}/)
            .flatMap(block => block.split(/(?<=\.)\s+(?=[A-ZÀ-Ú])/).map(s => s.trim()).filter(Boolean))
            .map((paragraph, i) => (
              <p key={i} className="italic">{paragraph}</p>
            ))}
        </div>

        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-3">Assine abaixo com o dedo</p>
        <div className="bg-white rounded-[28px] border-2 border-[#F5F2F0] shadow-sm overflow-hidden relative mb-4">
          <SignaturePad
            ref={sigPad}
            canvasProps={{ className: 'w-full h-48' }}
            backgroundColor="white"
          />
          <button
            onClick={() => sigPad.current?.clear()}
            className="absolute top-3 right-3 p-2 bg-[#FDFBF9] rounded-full text-[#9CA3AF] hover:text-[#4A433D] transition-all shadow-sm"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        <button
          onClick={handleSign}
          disabled={signing}
          className="w-full py-4 bg-[#4A433D] text-white rounded-2xl font-bold text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#5C544E] transition-all disabled:opacity-50"
        >
          {signing ? 'Enviando...' : 'Confirmar Assinatura'}
        </button>
      </div>
    </div>
  );
}
