// Modelos de termo de consentimento padrão pra odontologia, adaptados dos modelos oficiais
// fornecidos pela clínica (TCLE, Autorização de Uso de Imagem/Dados, Recibo de Entrega de
// Documentos). Os campos entre colchetes são preenchidos automaticamente (ver fillTemplate
// em Patients.tsx) com os dados do paciente/clínica no momento da assinatura.
//
// Importante: os itens 1 a 8 do TCLE (tratamento proposto, riscos específicos etc.) vêm
// com texto genérico cobrindo procedimentos estéticos minimamente invasivos comuns. Pra
// procedimentos com perfil de risco bem diferente (cirurgia, por exemplo), o recomendado é
// duplicar esse modelo em Configurações e ajustar esses itens especificamente pra aquele
// procedimento, em vez de usar o mesmo texto genérico pra tudo.
export const DEFAULT_CONSENT_TEMPLATES: { title: string; content: string }[] = [
  {
    title: 'Termo de Consentimento Livre e Esclarecido (TCLE)',
    content: `PACIENTE: [NOME DO PACIENTE]
CPF: [CPF DO PACIENTE]
CLÍNICA: [NOME DA CLINICA]
CIRURGIÃO-DENTISTA: [NOME DO PROFISSIONAL]
DATA: [DATA DE HOJE]

Declaro, de forma voluntária, livre e esclarecida, por meio deste Termo de Consentimento, que recebi todas as informações e explicações sobre o meu caso clínico e sobre a minha condição de saúde atual, de forma compreensível e com linguagem não técnica, reconhecendo terem sido a mim esclarecidas as principais alternativas indicadas para o meu tratamento, bem como ter conversado com o profissional assistente sobre os aspectos importantes de cada uma destas possibilidades — pontos positivos, pontos negativos, limitações, riscos específicos, custos e etapas de cada procedimento ofertado.

Assumo o compromisso de comparecer às consultas/sessões agendadas, de seguir as recomendações e prescrições (pré e pós-procedimento), e de tomar os devidos cuidados com a região tratada.

Estou ciente de que o profissional não pode se comprometer com um resultado específico, mas que os procedimentos serão aplicados com zelo e eficiência, conforme as técnicas atualmente aceitas na prática odontológica/estética. Sei que os tempos de recuperação são estimados, podendo variar conforme resposta individual do meu organismo.

Especificamente sobre o tratamento planejado, estou ciente de que:

1. Tratamento proposto: o procedimento estético/odontológico indicado pelo profissional, conforme discutido na avaliação presencial, podendo incluir técnicas de harmonização facial, toxina botulínica, preenchimento, bioestimuladores ou procedimento cirúrgico específico, conforme meu caso.

2. Objetivos esperados: melhora da simetria, contorno ou qualidade da região tratada, com resultado que pode ser imediato ou progressivo (ao longo de semanas), conforme a técnica utilizada.

3. Aspectos positivos: procedimento realizado com técnica adequada ao meu caso, buscando resultado natural e harmônico, com acompanhamento profissional em todas as etapas.

4. Riscos e possíveis reações adversas: podem ocorrer, entre outros, dor local, edema (inchaço), equimose (hematoma/roxo), assimetria temporária, reação alérgica, infecção, ou resultado aquém do esperado. Riscos específicos adicionais, quando aplicáveis ao meu caso, foram detalhados verbalmente pelo profissional.

5. Procedimentos alternativos em caso de necessidade: o profissional poderá indicar ajuste de técnica, procedimento complementar ou encaminhamento, conforme evolução do meu caso.

6. Riscos de não realizar o tratamento: manutenção do quadro atual, sem a melhora esperada, e possível progressão natural do problema que motivou a busca pelo tratamento.

7. Limitações do caso: resultado sujeito à minha resposta biológica individual, hábitos, e eventuais condições de saúde pré-existentes por mim informadas.

8. Conduta em caso de insucesso: reavaliação do caso pelo profissional, com indicação de conduta corretiva quando aplicável.

Em manifestação autônoma de consentimento, de forma livre e esclarecida, firmo o presente, na forma da Lei 13.709/2018 (Lei Geral de Proteção de Dados).`,
  },
  {
    title: 'Autorização para Uso de Dados e Imagem',
    content: `Eu, [NOME DO PACIENTE], CPF [CPF DO PACIENTE], venho por meio deste termo, espontânea e livremente, AUTORIZAR o uso de dados do meu prontuário, de minhas imagens e vídeos, relativos ao tratamento a que me submeto com [NOME DO PROFISSIONAL] / [NOME DA CLINICA], para fins de divulgação de assuntos odontológicos/estéticos (redes sociais, site, materiais educativos), abdicando de qualquer direito ou remuneração pelo uso destes registros.

Fica o profissional/clínica obrigado a não mais usar os dados e, sendo aplicável e possível, a remover eventuais publicações já feitas, caso eu venha, a qualquer tempo, a revogar esta autorização.

Em manifestação autônoma de consentimento, de forma livre e esclarecida, firmo o presente, na forma da Lei 13.709/2018 (Lei Geral de Proteção de Dados).

Data: [DATA DE HOJE]`,
  },
  {
    title: 'Recibo de Entrega de Documentos e Exames',
    content: `Eu, [NOME DO PACIENTE], CPF [CPF DO PACIENTE], declaro ter recebido, nesta data, os documentos, exames e/ou modelos entregues pela clínica [NOME DA CLINICA], relativos ao meu tratamento — podendo incluir fotografias, radiografias, tomografias, modelos ou laudos de exames.

Manifesto ter recebido as devidas orientações e ter ciência de que estes são registros técnicos importantes da minha condição de saúde, fundamentais para diagnóstico, planejamento e acompanhamento do meu caso clínico, no presente ou em uso futuro.

Ao recebê-los, assumo ser de minha inteira responsabilidade a guarda destes documentos, em adequado acondicionamento, segurança e sigilo, isentando o profissional/clínica de qualquer responsabilidade relativa aos itens entregues.

Data: [DATA DE HOJE]`,
  },
];
