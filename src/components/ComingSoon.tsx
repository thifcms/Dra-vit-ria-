import React from 'react';
import { motion } from 'motion/react';
import { Calendar, User } from 'lucide-react';

// Página institucional mostrada na raiz do domínio
// (clinicadravitoriaoliveira.com.br, sem nada depois). O sistema em si fica em #app,
// livre pra clínica ir enriquecendo esse conteúdo com o tempo (fotos, sobre, serviços),
// sem afetar nada do resto do app.
export default function ComingSoon() {
  return (
    <div className="min-h-screen w-full flex flex-col bg-white">
      <div className="p-6 md:p-8 flex justify-end">
        <a
          href="#portal"
          className="flex items-center gap-2 px-5 py-3 bg-[#FDFBF9] text-[#4A433D] rounded-2xl text-[10px] font-bold uppercase tracking-widest border border-[#F5F2F0] hover:border-[#EADFD4] transition-all"
        >
          <User size={14} /> Portal do Paciente
        </a>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <motion.img
          src="/logo/logo-full-v2.png"
          alt="Dra. Vitória Oliveira — Estética Orofacial"
          className="h-28 w-auto object-contain mb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        <motion.a
          href="#agendar"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex items-center gap-2 px-8 py-4 bg-[#8BA888] text-white rounded-2xl text-xs font-bold uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all"
        >
          <Calendar size={16} /> Agende sua Consulta
        </motion.a>
      </div>
    </div>
  );
}
