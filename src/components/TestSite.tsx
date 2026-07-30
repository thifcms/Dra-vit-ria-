import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { lazy, Suspense } from 'react';

const InstitutionalSite = lazy(() => import('./InstitutionalSite'));

const TEST_PASSWORD = 'vitoria2026'; // Página de pré-visualização, não é uma senha de segurança de verdade — só afasta visitante casual até o site estar pronto pra valer
const SESSION_KEY = 'testSiteUnlocked';
const INTRO_SEEN_KEY = 'testSiteIntroSeen';

type Phase = 'password' | 'intro' | 'site';

export default function TestSite() {
  const [phase, setPhase] = useState<Phase>(() => {
    if (sessionStorage.getItem(SESSION_KEY) !== 'true') return 'password';
    // Já desbloqueou antes — se a animação já rodou nessa sessão (ex: veio de outra
    // página do próprio site, como o detalhe de um procedimento), pula direto pro
    // conteúdo, sem repetir a introdução toda vez que o hash muda.
    return sessionStorage.getItem(INTRO_SEEN_KEY) === 'true' ? 'site' : 'intro';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === TEST_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setPhase('intro');
    } else {
      setError(true);
      setPasswordInput('');
      setTimeout(() => setError(false), 1200);
    }
  };

  // Depois do logo (mesma animação de 5s da página "Site em Construção"), aguarda mais um
  // instante e troca pra tela do site — o fade de saída do logo e o fade de entrada do
  // site acontecem via AnimatePresence, não precisa coordenar timer nenhum aqui além do
  // tempo total de exibição do logo.
  useEffect(() => {
    if (phase !== 'intro') return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(INTRO_SEEN_KEY, 'true');
      setPhase('site');
    }, 5800);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <AnimatePresence mode="wait">
      {phase === 'password' && (
        <motion.div
          key="password"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#9CA3AF] mb-8">
            Pré-visualização — não é o site publicado ainda
          </p>
          <form onSubmit={handleUnlock} className="w-full max-w-xs">
            <motion.input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="Senha de acesso"
              autoFocus
              animate={error ? { x: [0, -8, 8, -8, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="w-full bg-white border border-[#EADFD4]/50 rounded-2xl p-4 text-center outline-none focus:border-[#EADFD4] transition-all font-light"
            />
            <button
              type="submit"
              className="w-full mt-4 py-4 bg-[#4A433D] text-[#FDFBF9] rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#5C544E] transition-all"
            >
              Entrar
            </button>
          </form>
        </motion.div>
      )}

      {phase === 'intro' && (
        <motion.div
          key="intro"
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          className="h-screen w-screen flex flex-col items-center justify-center bg-white p-6 text-center overflow-hidden"
        >
          <motion.img
            src="/logo/logo-full-v2.png"
            alt="Dra. Vitória Oliveira — Estética Orofacial"
            className="h-28 w-auto object-contain mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 5, ease: 'easeOut' }}
          />
        </motion.div>
      )}

      {phase === 'site' && (
        <motion.div
          key="site"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <Suspense fallback={<div className="h-screen w-screen bg-[#FDFBF9]" />}>
            <InstitutionalSite />
          </Suspense>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
