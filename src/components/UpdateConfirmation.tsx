import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';

// Mostrado uma vez, logo após o app recarregar sozinho por causa de uma atualização —
// confirma visualmente que a atualização de fato aconteceu (sem isso, o reload troca a
// página inteira e não sobra nenhum sinal de que algo mudou).
export default function UpdateConfirmation() {
  const [show, setShow] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const savedNote = localStorage.getItem('appJustUpdated');
    if (savedNote) {
      localStorage.removeItem('appJustUpdated');
      setNote(savedNote);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 6000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-[#4A433D] text-white px-6 py-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-sm mx-4"
        >
          <CheckCircle2 size={20} className="text-[#8BA888] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">App atualizado</p>
            {note && note !== 'true' && (
              <p className="text-xs text-white/70 font-light mt-1 leading-relaxed">{note}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
