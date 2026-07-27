import React from 'react';

// Página mostrada na raiz do domínio (clinicadravitoriaoliveira.com.br, sem nada depois)
// enquanto o site institucional da clínica não existe. O sistema em si fica em #app —
// isso deixa a raiz livre pro site de verdade, quando Thiago tiver o conteúdo pronto.
export default function ComingSoon() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-white p-6 text-center">
      <img
        src="/logo/logo-full-v2.png"
        alt="Dra. Vitória Oliveira — Estética Orofacial"
        className="h-28 w-auto object-contain mb-10"
      />
      <p className="text-[#9CA3AF] font-light text-sm uppercase tracking-[0.3em]">
        Site em construção
      </p>
    </div>
  );
}
