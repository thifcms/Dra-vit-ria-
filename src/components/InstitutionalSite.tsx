import React, { useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Instagram, MapPin, Phone as PhoneIcon, ArrowRight, ArrowUpRight } from 'lucide-react';

const PROCEDURES = [
  {
    name: 'Harmonização Facial',
    desc: 'Reequilíbrio dos contornos do rosto com técnicas combinadas, respeitando a anatomia individual de cada paciente.',
  },
  {
    name: 'Toxina Botulínica',
    desc: 'Suavização de linhas de expressão com resultado natural — sem congelamento, sem perda de movimento.',
  },
  {
    name: 'Bioestimuladores de Colágeno',
    desc: 'Estímulo à produção natural de colágeno pra firmeza e qualidade de pele a médio e longo prazo.',
  },
  {
    name: 'Preenchimento Facial',
    desc: 'Volume e definição em regiões específicas — malar, mandíbula, lábios — com ácido hialurônico.',
  },
  {
    name: 'Cirurgia Ortognática',
    desc: 'Correção cirúrgica de desproporções entre maxila e mandíbula, com impacto funcional e estético.',
  },
  {
    name: 'Rinoplastia',
    desc: 'Remodelação do nariz com foco em harmonia com o restante do rosto, preservando a função respiratória.',
  },
  {
    name: 'Cirurgia Buco-Maxilo-Facial',
    desc: 'Procedimentos cirúrgicos especializados na face, mandíbula e estruturas orais — a base técnica de tudo o que fazemos.',
  },
];

const DIFFERENTIALS = [
  {
    title: 'Formação cirúrgica',
    text: 'Antes de tratar estética, a Dra. Vitória se formou em cirurgia buco-maxilo-facial — a base de tudo é entendimento profundo da anatomia da face.',
  },
  {
    title: 'Avaliação individual',
    text: 'Nenhum protocolo é padrão. Cada plano de tratamento nasce de uma avaliação presencial, considerando estrutura óssea, pele e expectativa real.',
  },
  {
    title: 'Resultado gradual',
    text: 'Preferimos ajustes progressivos a mudanças bruscas — o objetivo é parecer descansada e bem, não "mexida".',
  },
];

function useRevealOnScroll() {
  return {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  };
}

export default function InstitutionalSite() {
  const reveal = useRevealOnScroll();

  return (
    <div className="bg-[#FDFBF9] text-[#4A433D]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ===== NAV ===== */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#FDFBF9]/85 backdrop-blur-md border-b border-[#EADFD4]/30">
        <div className="max-w-6xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
          <span className="serif italic text-lg tracking-tight">Dra. Vitória Oliveira</span>
          <nav className="hidden md:flex items-center gap-10 text-[11px] font-medium uppercase tracking-[0.15em] text-[#4A433D]/70">
            <a href="#procedimentos" className="hover:text-[#4A433D] transition-colors">Procedimentos</a>
            <a href="#sobre" className="hover:text-[#4A433D] transition-colors">Sobre</a>
            <a href="#contato" className="hover:text-[#4A433D] transition-colors">Contato</a>
          </nav>
          <a
            href="#agendar"
            className="text-[11px] font-bold uppercase tracking-[0.15em] bg-[#4A433D] text-[#FDFBF9] px-6 py-3 rounded-full hover:bg-[#5C544E] transition-colors"
          >
            Agendar
          </a>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden pt-20">
        <img
          src="/logo/logo-mark-v2.png"
          alt=""
          className="absolute right-[-4%] top-1/2 -translate-y-1/2 w-[46%] max-w-[420px] opacity-[0.14] pointer-events-none select-none"
        />
        <div className="max-w-6xl mx-auto px-6 md:px-10 relative z-10 w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-6">
            Cirurgia Buco-Maxilo-Facial &amp; Estética
          </p>
          <h1 className="serif text-[13vw] md:text-[5.2vw] leading-[1.02] font-normal max-w-4xl">
            Precisão cirúrgica.<br />
            <span className="italic">Delicadeza estética.</span>
          </h1>
          <p className="mt-8 max-w-md text-[#4A433D]/70 font-light leading-relaxed">
            Uma abordagem que une formação cirúrgica sólida à sensibilidade estética —
            cada procedimento pensado pra realçar, nunca transformar quem você é.
          </p>
          <a
            href="#agendar"
            className="mt-10 inline-flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.15em] border-b-2 border-[#4A433D] pb-2 hover:gap-4 transition-all"
          >
            Agendar Avaliação <ArrowRight size={14} />
          </a>
        </div>
      </section>

      {/* ===== PHILOSOPHY STRIP ===== */}
      <section className="border-y border-[#EADFD4]/40 py-16">
        <motion.p
          {...reveal}
          className="serif italic text-2xl md:text-3xl text-center max-w-3xl mx-auto px-6 leading-snug text-[#4A433D]"
        >
          "Estética que nasce da anatomia — não o contrário."
        </motion.p>
      </section>

      {/* ===== PROCEDIMENTOS ===== */}
      <section id="procedimentos" className="max-w-6xl mx-auto px-6 md:px-10 py-28">
        <motion.div {...reveal} className="mb-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-4">O que tratamos</p>
          <h2 className="serif text-4xl md:text-5xl">Procedimentos</h2>
        </motion.div>
        <div className="divide-y divide-[#EADFD4]/40 border-t border-b border-[#EADFD4]/40">
          {PROCEDURES.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.04 }}
              className="group grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-8 py-8 md:items-center"
            >
              <h3 className="md:col-span-4 serif text-2xl group-hover:italic transition-all">{p.name}</h3>
              <p className="md:col-span-7 text-sm text-[#4A433D]/60 font-light leading-relaxed">{p.desc}</p>
              <div className="md:col-span-1 flex md:justify-end">
                <ArrowUpRight size={18} className="text-[#EADFD4] group-hover:text-[#B8846E] transition-colors" />
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== SOBRE ===== */}
      <section id="sobre" className="bg-[#F5EFE8] py-28">
        <div className="max-w-6xl mx-auto px-6 md:px-10 grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
          <motion.div {...reveal} className="md:col-span-5">
            <div className="aspect-[4/5] rounded-[40px] overflow-hidden">
              <img src="/site/dra-vitoria.jpg" alt="Dra. Vitória Oliveira" className="w-full h-full object-cover" />
            </div>
          </motion.div>
          <motion.div {...reveal} className="md:col-span-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-4">Sobre</p>
            <h2 className="serif text-4xl md:text-5xl mb-8">Dra. Vitória Oliveira</h2>
            <p className="text-[#4A433D]/70 font-light leading-relaxed mb-5">
              Cirurgiã buco-maxilo-facial com atuação dedicada à estética orofacial —
              uma especialidade que combina o rigor técnico da cirurgia com o olhar
              refinado da harmonização facial.
            </p>
            <p className="text-[#4A433D]/70 font-light leading-relaxed">
              Cada consulta começa pela escuta: entender o que incomoda, o que se
              deseja preservar, e só então desenhar um plano de tratamento sob medida —
              cirúrgico ou não.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ===== DIFERENCIAIS ===== */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-28">
        <motion.div {...reveal} className="mb-16 max-w-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-4">Por que aqui</p>
          <h2 className="serif text-4xl md:text-5xl">O que muda no atendimento</h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {DIFFERENTIALS.map((d, i) => (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <h3 className="serif text-xl italic mb-3">{d.title}</h3>
              <p className="text-sm text-[#4A433D]/60 font-light leading-relaxed">{d.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== CONTATO / CTA ===== */}
      <section id="contato" className="bg-[#4A433D] text-[#FDFBF9] py-28">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <motion.div {...reveal}>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#EADFD4] mb-4">Vamos conversar</p>
            <h2 className="serif text-4xl md:text-6xl max-w-2xl mb-10 leading-tight">
              O primeiro passo é uma <span className="italic">avaliação</span>.
            </h2>
            <a
              href="#agendar"
              className="inline-flex items-center gap-3 bg-[#EADFD4] text-[#4A433D] text-[11px] font-bold uppercase tracking-[0.15em] px-8 py-4 rounded-full hover:bg-[#FDFBF9] transition-colors"
            >
              Agendar Avaliação <ArrowRight size={14} />
            </a>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20 pt-10 border-t border-[#FDFBF9]/15 text-sm font-light text-[#FDFBF9]/70">
            <div className="flex items-start gap-3">
              <MapPin size={16} className="mt-0.5 shrink-0 text-[#EADFD4]" />
              <span>Endereço do consultório<br />a definir</span>
            </div>
            <div className="flex items-start gap-3">
              <PhoneIcon size={16} className="mt-0.5 shrink-0 text-[#EADFD4]" />
              <span>WhatsApp<br />a definir</span>
            </div>
            <div className="flex items-start gap-3">
              <Instagram size={16} className="mt-0.5 shrink-0 text-[#EADFD4]" />
              <span>@ do Instagram<br />a definir</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-8 text-center text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF]">
        Dra. Vitória Oliveira — Cirurgia Buco-Maxilo-Facial &amp; Estética Orofacial
      </footer>
    </div>
  );
}
