import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Instagram, MapPin, Phone as PhoneIcon, ArrowRight, ArrowUpRight, ArrowLeft } from 'lucide-react';

const PROCEDURES = [
  {
    slug: 'harmonizacao-facial',
    name: 'Harmonização Facial',
    desc: 'Reequilíbrio dos contornos do rosto com técnicas combinadas, respeitando a anatomia individual de cada paciente.',
    indicated: 'Indicado pra quem busca simetria e equilíbrio entre as regiões do rosto, sem depender de um procedimento isolado.',
    long: [
      'Harmonização facial não é um procedimento único — é um plano que combina diferentes técnicas (toxina, preenchimento, bioestimuladores, entre outras) na medida certa pra cada rosto, sempre a partir de uma leitura cuidadosa da anatomia da pessoa.',
      'A ideia central é proporção: nenhuma região do rosto é tratada isoladamente, porque uma mudança num ponto afeta a leitura visual do conjunto. Por isso a avaliação inicial é tão detalhada quanto o procedimento em si.',
      'Os ajustes costumam ser feitos em etapas, com retornos entre elas — isso permite calibrar o resultado aos poucos, em vez de tentar acertar tudo de uma vez.',
    ],
    recovery: 'Varia por técnica combinada, mas a maioria dos procedimentos usados na harmonização tem recuperação rápida, sem afastamento das atividades.',
  },
  {
    slug: 'toxina-botulinica',
    name: 'Toxina Botulínica',
    desc: 'Suavização de linhas de expressão com resultado natural — sem congelamento, sem perda de movimento.',
    indicated: 'Testa e sorriso natural (marcas de expressão na testa, glabela e ao redor dos olhos), enxaqueca tensional e bruxismo.',
    long: [
      'A toxina botulínica relaxa temporariamente a musculatura responsável pelas linhas de expressão mais marcadas — testa, entre as sobrancelhas e ao redor dos olhos — sem eliminar o movimento natural do rosto.',
      'A dose e os pontos de aplicação são definidos individualmente: o objetivo é suavizar, nunca imobilizar. Um rosto que ainda se movimenta e expressa emoção continua parecendo natural depois do procedimento.',
      'Também é usada com fins terapêuticos, como no alívio de dores relacionadas a bruxismo e enxaqueca tensional, quando indicado.',
    ],
    recovery: 'Sem tempo de afastamento. O resultado começa a aparecer em poucos dias e se estabiliza em cerca de duas semanas.',
  },
  {
    slug: 'bioestimuladores-colageno',
    name: 'Bioestimuladores de Colágeno',
    desc: 'Estímulo à produção natural de colágeno pra firmeza e qualidade de pele a médio e longo prazo.',
    indicated: 'Flacidez inicial, perda de firmeza e prevenção do envelhecimento — resultado que aparece aos poucos, ao longo de semanas.',
    long: [
      'Diferente de um preenchimento, o bioestimulador não entrega volume na hora — ele estimula o próprio corpo a produzir mais colágeno ao longo do tempo, o que resulta em pele mais firme e com melhor qualidade.',
      'É uma abordagem pensada pra quem quer prevenir ou tratar sinais iniciais de flacidez, com um resultado que evolui de forma gradual e discreta, sem uma mudança abrupta perceptível de uma consulta pra outra.',
      'Costuma ser aplicado em sessões espaçadas, conforme protocolo individualizado.',
    ],
    recovery: 'Recuperação rápida, com possível vermelhidão ou pequenos inchaços nos primeiros dias.',
  },
  {
    slug: 'preenchimento-facial',
    name: 'Preenchimento Facial',
    desc: 'Volume e definição em regiões específicas — malar, mandíbula, lábios — com ácido hialurônico.',
    indicated: 'Perda de volume na região malar, contorno mandibular pouco definido, lábios que perderam projeção com o tempo.',
    long: [
      'O preenchimento com ácido hialurônico devolve volume a regiões específicas do rosto — maçãs do rosto, mandíbula, lábios — que perderam projeção com o tempo ou nunca tiveram a definição desejada.',
      'Por ser uma substância biocompatível e reabsorvível, o resultado tem prazo de validade natural, o que permite reavaliar e ajustar a abordagem nas sessões seguintes, conforme a resposta de cada pessoa.',
      'A técnica de aplicação varia bastante conforme a região e o objetivo — desde reposição sutil de volume até definição mais marcada de contorno.',
    ],
    recovery: 'Pode haver inchaço leve nas primeiras 48 horas. A maioria das pessoas retoma a rotina normalmente no mesmo dia.',
  },
  {
    slug: 'cirurgia-ortognatica',
    name: 'Cirurgia Ortognática',
    desc: 'Correção cirúrgica de desproporções entre maxila e mandíbula, com impacto funcional e estético.',
    indicated: 'Dificuldade de mastigação, desvio de mordida, desproporção visível entre o terço médio e inferior do rosto.',
    long: [
      'A cirurgia ortognática corrige o posicionamento dos ossos da maxila e da mandíbula quando existe uma desproporção que afeta tanto a função (mastigação, respiração, fala) quanto a harmonia do rosto.',
      'É um procedimento que costuma envolver planejamento conjunto com ortodontia, já que o alinhamento dentário e o posicionamento ósseo caminham juntos na maioria dos casos.',
      'Por ser cirúrgico, exige avaliação de imagem detalhada, planejamento cuidadoso da técnica e acompanhamento próximo no pós-operatório.',
    ],
    recovery: 'Recuperação cirúrgica, com tempo de afastamento que varia por caso — discutido em detalhe durante a avaliação e o planejamento.',
  },
  {
    slug: 'rinoplastia',
    name: 'Rinoplastia',
    desc: 'Remodelação do nariz com foco em harmonia com o restante do rosto, preservando a função respiratória.',
    indicated: 'Desvios de septo com impacto respiratório, giba nasal, ponta nasal pouco definida — sempre olhando a função junto da estética.',
    long: [
      'A rinoplastia trata tanto a forma quanto a função do nariz — muitas vezes as duas coisas estão relacionadas, como em casos de desvio de septo que afetam a respiração além da aparência.',
      'O planejamento leva em conta o rosto como um todo, não o nariz isolado: o objetivo é uma proporção que combine com as demais estruturas faciais, evitando um resultado "genérico".',
      'É um procedimento cirúrgico, com técnica escolhida conforme a anatomia e o objetivo de cada pessoa.',
    ],
    recovery: 'Recuperação cirúrgica, com inchaço e possíveis hematomas nas primeiras semanas — o resultado final leva alguns meses pra se estabilizar completamente.',
  },
  {
    slug: 'cirurgia-buco-maxilo-facial',
    name: 'Cirurgia Buco-Maxilo-Facial',
    desc: 'Procedimentos cirúrgicos especializados na face, mandíbula e estruturas orais — a base técnica de tudo o que fazemos.',
    indicated: 'Extrações complexas, cistos e lesões orais, traumas faciais, disfunções da ATM (articulação temporomandibular).',
    long: [
      'Essa é a especialidade cirúrgica de base — cuida de extrações complexas (como dentes inclusos), cistos e lesões da boca, traumas faciais e disfunções da articulação temporomandibular (ATM).',
      'É o alicerce técnico que sustenta também os procedimentos estéticos: entender a estrutura óssea e muscular da face em profundidade é o que permite planejar harmonização, preenchimento ou cirurgia com segurança.',
      'Cada caso é avaliado individualmente, com exames de imagem quando necessário, antes de qualquer indicação de conduta.',
    ],
    recovery: 'Varia bastante conforme o procedimento específico — de recuperação simples (algumas extrações) a mais prolongada (cirurgias maiores).',
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
  {
    title: 'Visão funcional e estética juntas',
    text: 'Formação cirúrgica significa olhar pra mastigação, respiração e articulação — não só pro que se vê no espelho.',
  },
];

const PROCESS_STEPS = [
  {
    title: 'Avaliação Presencial',
    text: 'Conversa sobre histórico, expectativas e uma análise detalhada da anatomia facial — sem pressa, sem protocolo padrão.',
  },
  {
    title: 'Plano de Tratamento',
    text: 'Um plano sob medida, explicando o porquê de cada indicação — o que é essencial, o que é opcional, e em que ordem faz sentido.',
  },
  {
    title: 'Procedimento',
    text: 'Execução com técnica e materiais adequados a cada caso, sempre priorizando segurança e resultado natural.',
  },
  {
    title: 'Acompanhamento',
    text: 'Retorno pra avaliar a evolução e ajustar o que for necessário — o cuidado não termina na saída do consultório.',
  },
];

const FAQ = [
  {
    q: 'Preciso fazer cirurgia pra ter resultado?',
    a: 'Não necessariamente. Boa parte das demandas estéticas é resolvida com procedimentos não-cirúrgicos (toxina, preenchimento, bioestimuladores). A cirurgia entra quando há uma questão estrutural ou funcional que só ela resolve.',
  },
  {
    q: 'Os procedimentos doem?',
    a: 'A maioria é feita com anestesia local e é bem tolerada. Qualquer desconforto esperado é explicado antes, sem surpresas durante o atendimento.',
  },
  {
    q: 'Quanto tempo dura o resultado?',
    a: 'Varia por procedimento — toxina costuma durar de 4 a 6 meses, preenchimentos de 12 a 18 meses, bioestimuladores têm efeito mais duradouro e progressivo. Isso é discutido caso a caso na avaliação.',
  },
  {
    q: 'Tem tempo de recuperação?',
    a: 'Procedimentos não-cirúrgicos costumam ter recuperação mínima, muitas vezes sem afastamento. Procedimentos cirúrgicos têm um tempo próprio de recuperação, sempre explicado com clareza antes de qualquer decisão.',
  },
  {
    q: 'Como sei qual procedimento é indicado pro meu caso?',
    a: 'Só numa avaliação presencial — cada rosto tem uma anatomia diferente, e muitas vezes o que resolve uma queixa é a combinação de mais de uma técnica, não um procedimento isolado escolhido antes de examinar.',
  },
  {
    q: 'Qual a diferença entre um procedimento estético e uma cirurgia buco-maxilo-facial?',
    a: 'Procedimentos estéticos (toxina, preenchimento, bioestimuladores) ajustam volume, contorno e qualidade de pele, sem alterar a estrutura óssea. Já a cirurgia buco-maxilo-facial trata questões estruturais — como posição da maxila/mandíbula ou lesões — que têm impacto funcional além do estético.',
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

// Extrai o "sub-caminho" depois de #teste — usado pra decidir se mostra a página inicial
// do site ou o detalhe de um procedimento específico (ex: #teste/procedimento/rinoplastia)
function useSiteSubRoute() {
  const [subRoute, setSubRoute] = useState(() => window.location.hash.replace(/^#teste\/?/, ''));
  useEffect(() => {
    const onHashChange = () => setSubRoute(window.location.hash.replace(/^#teste\/?/, ''));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return subRoute;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

function NavLink({ id, label }: { id: string; label: string }) {
  return (
    <button
      onClick={() => scrollToSection(id)}
      className="hover:text-[#4A433D] transition-colors uppercase"
    >
      {label}
    </button>
  );
}

// Diagrama simples e original (perfil de rosto em linha) com a região do procedimento
// destacada — evita usar fotos de terceiros (direitos autorais) e mantém a identidade
// visual do site.
const PROCEDURE_ZONES: Record<string, { cx: number; cy: number; rx: number; ry: number }[]> = {
  'harmonizacao-facial': [
    { cx: 195, cy: 175, rx: 55, ry: 65 }, // rosto inteiro, sutil
  ],
  'toxina-botulinica': [
    { cx: 175, cy: 95, rx: 42, ry: 22 }, // testa
    { cx: 195, cy: 130, rx: 18, ry: 12 }, // ao redor dos olhos
  ],
  'bioestimuladores-colageno': [
    { cx: 205, cy: 190, rx: 38, ry: 45 }, // bochecha
  ],
  'preenchimento-facial': [
    { cx: 210, cy: 175, rx: 30, ry: 30 }, // malar
    { cx: 218, cy: 250, rx: 20, ry: 12 }, // lábios
  ],
  'cirurgia-ortognatica': [
    { cx: 215, cy: 270, rx: 45, ry: 30 }, // mandíbula
  ],
  'rinoplastia': [
    { cx: 150, cy: 180, rx: 18, ry: 40 }, // nariz
  ],
  'cirurgia-buco-maxilo-facial': [
    { cx: 190, cy: 250, rx: 55, ry: 40 }, // boca/mandíbula
  ],
};

function ProcedureIllustration({ slug }: { slug: string }) {
  const zones = PROCEDURE_ZONES[slug] || [];
  return (
    <div className="w-full aspect-[4/3] bg-[#F5EFE8] rounded-[32px] flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 400 340" className="w-3/4 h-3/4">
        {zones.map((z, i) => (
          <ellipse
            key={i}
            cx={z.cx}
            cy={z.cy}
            rx={z.rx}
            ry={z.ry}
            fill="#B8846E"
            opacity={0.18}
          />
        ))}
        {/* Perfil de rosto — traço simples e original */}
        <path
          d="M 130 60
             C 100 60 80 100 82 150
             C 84 190 95 210 90 225
             C 87 233 78 235 78 245
             C 78 253 90 253 98 250
             C 102 270 115 290 140 305
             C 165 320 195 325 215 320
             C 245 313 265 295 272 270
             C 275 258 273 248 278 240
             C 283 232 290 228 290 218
             C 290 208 282 205 278 198
             C 285 180 288 160 285 140
             C 280 100 250 65 210 55
             C 185 49 155 51 130 60 Z"
          fill="none"
          stroke="#4A433D"
          strokeWidth="2.5"
          strokeLinejoin="round"
          opacity={0.55}
        />
        {/* Linha do nariz */}
        <path d="M 155 145 C 148 165 145 180 152 192 C 156 197 165 198 172 195" fill="none" stroke="#4A433D" strokeWidth="2" opacity={0.4} />
        {/* Olho */}
        <ellipse cx="190" cy="128" rx="10" ry="5" fill="none" stroke="#4A433D" strokeWidth="1.5" opacity={0.4} />
        {/* Sobrancelha */}
        <path d="M 172 112 C 182 106 198 106 208 112" fill="none" stroke="#4A433D" strokeWidth="1.5" opacity={0.4} />
        {/* Boca */}
        <path d="M 205 248 C 213 253 225 253 233 248" fill="none" stroke="#4A433D" strokeWidth="1.5" opacity={0.4} />
      </svg>
    </div>
  );
}

function ProcedureDetailPage({ slug }: { slug: string }) {
  const procedure = PROCEDURES.find(p => p.slug === slug);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!procedure) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6 text-center">
        <p className="text-[#4A433D] mb-6">Procedimento não encontrado.</p>
        <a href="#teste" className="text-[11px] font-bold uppercase tracking-widest border-b-2 border-[#4A433D] pb-1">Voltar ao início</a>
      </div>
    );
  }

  return (
    <div className="bg-[#FDFBF9] text-[#4A433D] min-h-screen" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#FDFBF9]/85 backdrop-blur-md border-b border-[#EADFD4]/30">
        <div className="max-w-3xl mx-auto px-6 md:px-10 h-20 flex items-center">
          <img src="/logo/logo-mark-v2.png" alt="" className="h-9 w-auto" />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 md:px-10 pt-36 pb-28">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-4">Procedimento</p>
          <h1 className="serif text-4xl md:text-5xl mb-8">{procedure.name}</h1>
          <p className="text-lg text-[#4A433D]/70 font-light leading-relaxed mb-10 italic">{procedure.desc}</p>

          <div className="mb-12">
            <ProcedureIllustration slug={procedure.slug} />
            <p className="text-[10px] text-[#9CA3AF] text-center mt-3 uppercase tracking-widest">Região de atuação (ilustrativo)</p>
          </div>

          <div className="space-y-6 mb-12">
            {procedure.long.map((paragraph, i) => (
              <p key={i} className="text-[#4A433D]/80 font-light leading-relaxed">{paragraph}</p>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14">
            <div className="p-6 bg-white border border-[#F5F2F0] rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#B8846E] mb-2">Indicado para</p>
              <p className="text-sm text-[#4A433D]/70 font-light leading-relaxed">{procedure.indicated}</p>
            </div>
            <div className="p-6 bg-white border border-[#F5F2F0] rounded-3xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#B8846E] mb-2">Recuperação</p>
              <p className="text-sm text-[#4A433D]/70 font-light leading-relaxed">{procedure.recovery}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#agendar"
              className="inline-flex items-center justify-center gap-3 bg-[#4A433D] text-white text-[11px] font-bold uppercase tracking-[0.15em] px-8 py-4 rounded-full hover:bg-[#5C544E] transition-colors"
            >
              Agendar Avaliação <ArrowRight size={14} />
            </a>
            <a
              href="#teste"
              className="inline-flex items-center justify-center gap-3 border border-[#F5F2F0] text-[#4A433D] text-[11px] font-bold uppercase tracking-[0.15em] px-8 py-4 rounded-full hover:bg-[#FDFBF9] transition-colors"
            >
              <ArrowLeft size={14} /> Voltar
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function HomePage() {
  const reveal = useRevealOnScroll();

  return (
    <div className="bg-[#FDFBF9] text-[#4A433D]" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* ===== NAV ===== */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#FDFBF9]/85 backdrop-blur-md border-b border-[#EADFD4]/30">
        <div className="max-w-6xl mx-auto px-6 md:px-10 h-20 flex items-center justify-end gap-10">
          <nav className="hidden md:flex items-center gap-10 text-[11px] font-medium uppercase tracking-[0.15em] text-[#4A433D]/70">
            <NavLink id="procedimentos" label="Procedimentos" />
            <NavLink id="sobre" label="Sobre" />
            <NavLink id="contato" label="Contato" />
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
      <section className="relative md:min-h-[85vh] flex items-center overflow-hidden pt-28 pb-16">
        {/* Marca d'água — símbolo da harmonização orofacial, sutil, atrás do texto */}
        <img
          src="/logo/logo-mark-v2.png"
          alt=""
          aria-hidden="true"
          className="hidden md:block absolute right-[2%] top-1/2 -translate-y-1/2 w-[32%] max-w-[380px] opacity-[0.07] pointer-events-none select-none"
        />

        <div className="max-w-6xl mx-auto px-6 md:px-10 relative z-10 w-full grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Foto — bordas esmaecidas, se confundindo com o fundo da página */}
          <div className="md:col-span-5 flex justify-center order-2 md:order-1">
            <img
              src="/site/dra-vitoria-hero.png"
              alt="Dra. Vitória Oliveira"
              className="w-full max-w-[340px] md:max-w-none h-auto object-contain"
              style={{
                maskImage: 'radial-gradient(ellipse 75% 90% at center, black 55%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 75% 90% at center, black 55%, transparent 100%)',
              }}
            />
          </div>

          <div className="md:col-span-7 text-center md:text-left order-1 md:order-2">
            <img src="/logo/logo-full-v2.png" alt="Dra. Vitória Oliveira" className="h-24 md:h-32 w-auto object-contain mb-10 mx-auto md:mx-0" />
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-6">
              Cirurgia Buco-Maxilo-Facial &amp; Estética
            </p>
            <h1 className="serif text-[13vw] md:text-6xl leading-[1.05] font-normal">
              Precisão cirúrgica.<br />
              <span className="italic">Delicadeza estética.</span>
            </h1>
            <p className="mt-8 max-w-md mx-auto md:mx-0 text-[#4A433D]/70 font-light leading-relaxed">
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
        </div>
      </section>

      {/* ===== PHILOSOPHY STRIP ===== */}
      <section className="border-y border-[#EADFD4]/40 py-16 space-y-10">
        <motion.div {...reveal} className="max-w-3xl mx-auto px-6 text-center">
          <p className="serif italic text-2xl md:text-3xl leading-snug text-[#4A433D]">
            "Estética que nasce da anatomia — não o contrário."
          </p>
        </motion.div>
        <motion.div {...reveal} className="max-w-3xl mx-auto px-6 text-center">
          <p className="serif italic text-2xl md:text-3xl leading-snug text-[#4A433D]">
            "A beleza é a melhor carta de recomendação."
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B8846E] mt-4">— Aristóteles</p>
        </motion.div>
        <motion.div {...reveal} className="max-w-3xl mx-auto px-6 text-center">
          <p className="serif italic text-2xl md:text-3xl leading-snug text-[#4A433D]">
            "A proporção não está só nos números — está em tudo o que a natureza cria."
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B8846E] mt-4">— Leonardo da Vinci</p>
        </motion.div>
      </section>

      {/* ===== PROCEDIMENTOS ===== */}
      <section id="procedimentos" className="max-w-6xl mx-auto px-6 md:px-10 py-28">
        <motion.div {...reveal} className="mb-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-4">O que tratamos</p>
          <h2 className="serif text-4xl md:text-5xl">Procedimentos</h2>
        </motion.div>
        <div className="divide-y divide-[#EADFD4]/40 border-t border-b border-[#EADFD4]/40">
          {PROCEDURES.map((p, i) => (
            <motion.a
              href={`#teste/procedimento/${p.slug}`}
              key={p.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.04 }}
              className="group grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-8 py-8 md:items-start cursor-pointer"
            >
              <h3 className="md:col-span-4 serif text-2xl group-hover:italic transition-all">{p.name}</h3>
              <div className="md:col-span-7 space-y-2">
                <p className="text-sm text-[#4A433D]/60 font-light leading-relaxed">{p.desc}</p>
                <p className="text-xs text-[#B8846E]/80 font-light leading-relaxed">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-[#B8846E]">Indicado para </span>
                  {p.indicated}
                </p>
              </div>
              <div className="md:col-span-1 flex md:justify-end">
                <ArrowUpRight size={18} className="text-[#EADFD4] group-hover:text-[#B8846E] transition-colors" />
              </div>
            </motion.a>
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

      {/* ===== COMO FUNCIONA ===== */}
      <section className="bg-[#F5EFE8] py-28">
        <div className="max-w-6xl mx-auto px-6 md:px-10">
          <motion.div {...reveal} className="mb-16 max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-4">O processo</p>
            <h2 className="serif text-4xl md:text-5xl">Como funciona o atendimento</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            {PROCESS_STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <span className="serif italic text-3xl text-[#EADFD4]">0{i + 1}</span>
                <h3 className="serif text-lg mt-3 mb-2">{step.title}</h3>
                <p className="text-sm text-[#4A433D]/60 font-light leading-relaxed">{step.text}</p>
              </motion.div>
            ))}
          </div>
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

      {/* ===== PERGUNTAS FREQUENTES ===== */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 py-28">
        <motion.div {...reveal} className="mb-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#B8846E] mb-4">Dúvidas comuns</p>
          <h2 className="serif text-4xl md:text-5xl">Perguntas Frequentes</h2>
        </motion.div>
        <div className="divide-y divide-[#EADFD4]/40 border-t border-b border-[#EADFD4]/40">
          {FAQ.map((item, i) => (
            <motion.details
              key={item.q}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group py-7"
            >
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4">
                <span className="serif text-lg md:text-xl">{item.q}</span>
                <ArrowUpRight size={18} className="shrink-0 text-[#EADFD4] group-open:rotate-45 transition-transform" />
              </summary>
              <p className="text-sm text-[#4A433D]/60 font-light leading-relaxed mt-4 max-w-2xl">{item.a}</p>
            </motion.details>
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
              <a href="https://instagram.com/dravitoriaoliveira" target="_blank" rel="noreferrer" className="hover:text-[#FDFBF9] transition-colors">
                Instagram<br />@dravitoriaoliveira
              </a>
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

export default function InstitutionalSite() {
  const subRoute = useSiteSubRoute();
  const procedureMatch = subRoute.match(/^procedimento\/(.+)$/);

  if (procedureMatch) {
    return <ProcedureDetailPage slug={procedureMatch[1]} />;
  }

  return <HomePage />;
}
