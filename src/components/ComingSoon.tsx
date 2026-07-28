import React from 'react';
import { motion } from 'motion/react';

// Página mostrada na raiz do domínio (clinicadravitoriaoliveira.com.br, sem nada depois)
// enquanto o site institucional da clínica não existe. O sistema em si fica em #app —
// isso deixa a raiz livre pro site de verdade, quando Thiago tiver o conteúdo pronto.
export default function ComingSoon() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white p-6 text-center overflow-hidden">
      <motion.img
        src="/logo/logo-full-v2.png"
        alt="Dra. Vitória Oliveira — Estética Orofacial"
        className="h-28 w-auto object-contain mb-10"
        initial={{ opacity: 0, scale: 0.15, rotate: 300, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, rotate: 0, filter: 'blur(0px)' }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.p
        className="text-[#9CA3AF] font-light text-sm uppercase tracking-[0.3em]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.15 }}
      >
        Site em construção
      </motion.p>
    </div>
  );
}
