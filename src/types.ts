// Ficha Clínica preenchida pelo paciente após o check-in, sem login — o token do próprio
// check-in autoriza esse envio (mesma pessoa que confirmou a chegada). Fica pendente até
// o profissional abrir o prontuário desse paciente, quando é mesclada automaticamente:
// dados de cadastro e questionário de saúde vão pra anamnese, as duas autorizações vão
// pra aba de Termos, exatamente como pedido.
// Convite pra Ficha Clínica, enviado por WhatsApp — link público e independente de um
// agendamento específico (diferente do fluxo original, que só aparecia depois do
// check-in). Usado tanto no cadastro manual de um paciente novo quanto pra reenviar a
// ficha manualmente. O ID do documento é o próprio token secreto — só expõe o mínimo
// necessário (nome, id do paciente, dono da clínica), nunca o prontuário inteiro.
export interface IntakeInvite {
  id?: string;
  userId: string;
  patientId: string;
  patientName: string;
  ownerId: string;
  createdAt: string;
}

export interface IntakeSubmission {
  id?: string; // igual ao ID do agendamento (appointmentId) — 1 ficha por check-in
  patientId: string;
  patientName: string;
  ownerId: string;
  submittedAt: string;
  mergedIntoRecord?: boolean;

  // Dados de cadastro complementares
  birthDate?: string;
  address?: string;
  email?: string;
  profession?: string;
  maritalStatus?: string;
  howHeardAboutClinic?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;

  // Questionário de saúde
  usedToxinBefore: boolean;
  lastToxinDate: string;
  toxinTimes: string;
  usedPMMA: boolean;
  hadPastComplications: boolean; // nódulo, edema tardio intermitente persistente (ETIPE)
  pastComplicationsDetail: string;
  hasFoodAllergy: boolean;
  foodAllergyDetail: string;
  hasInsectAllergy: boolean;
  insectAllergyDetail: string;
  hadFillerBefore: boolean;
  fillerProduct: string;
  isPregnant: boolean;
  isBreastfeeding: boolean;
  hasCoagulationDisease: boolean;
  coagulationDiseaseDetail: string;
  bleedsEasily: boolean;
  hadHemorrhageOrHerpes: boolean;
  hemorrhageOrHerpesDetail: string;
  hasAnemia: boolean;
  hasMedicationAllergy: boolean;
  medicationAllergyDetail: string;
  usesContinuousMedication: boolean;
  continuousMedicationDetail: string;

  // Condições médicas — só pergunta uma vez "tem alguma condição médica?" e, se sim,
  // mostra a lista completa (mesma da anamnese, exceto anticoncepcional)
  hasMedicalConditions: boolean;
  medicalConditions: {
    diabetes: boolean;
    hypertension: boolean;
    heartProblems: boolean;
    autoimmune: boolean;
    cancerHistory: boolean;
    keloid: boolean;
    herpes: boolean;
    epilepsy: boolean;
    hivHepatitis: boolean;
    pacemaker: boolean;
    anticoagulant: boolean;
    isotretinoin: boolean;
  };

  // Estilo de vida — mesmos campos já usados na anamnese
  lifestyle: {
    smoking: boolean;
    alcohol: boolean;
    exercise: boolean;
    sunExposure: boolean;
    sunscreen: boolean;
  };

  mainComplaint: string;

  // As duas autorizações — texto fixo (mesmo da ficha impressa) guardado junto pra
  // manter o registro completo do que foi assinado, mesmo se o texto padrão mudar depois
  photoDocumentationConsent: boolean;
  imageDisclosureConsent: boolean;

  signatureUrl: string; // base64, mesmo padrão já usado no link de assinatura remota
}

export interface SignRequest {
  id?: string;
  userId: string;
  patientId: string;
  patientName: string;
  patientCpf?: string;
  templateId: string;
  templateTitle: string;
  templateContent: string; // já preenchido, pronto pra exibir — a página pública não
                            // precisa ler o paciente nem o modelo de termo diretamente
  status: 'pending' | 'signed';
  createdAt: string;
  createdBy: string; // e-mail de quem gerou o link
  ownerId: string; // dono canônico da clínica — usado só pra organização/auditoria
  signedAt?: string;
  signatureUrl?: string;
  mergedIntoRecord?: boolean; // marca que já foi puxado pro prontuário do paciente
  // Qual tipo de documento esse pedido representa — decide pra onde a assinatura vai
  // quando mesclada no prontuário. Ausente = 'consent' (pedidos antigos, antes desse campo existir).
  docType?: 'consent' | 'anamnesis' | 'budget';
  // Prova de que foi o próprio paciente que assinou: pra qual contato (dele, já
  // cadastrado) o link foi enviado — mostrado ao lado da assinatura no prontuário.
  sentVia?: 'whatsapp' | 'email';
  sentTo?: string;
}

export interface Patient {
  id?: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  address?: string;
  cpf?: string;
  rg?: string;
  profession?: string;
  maritalStatus?: string;
  howHeardAboutClinic?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  sex?: 'F' | 'M' | 'N'; // N = "prefiro não informar" — usado pra mostrar o diagrama/rosto genérico correto na Anamnese (usa um padrão neutro quando N)
  faceMarkings?: FaceMarkingSession[]; // histórico de mapas de pontos de aplicação

  privacyConsentAt?: string; // data/hora em que o paciente aceitou a Política de Privacidade — comprovação exigida pela LGPD
  anamnesis?: {
    // Dados Pessoais & Queixas
    mainComplaint: string;
    expectations: string;
    
    // Histórico Médico (Condições Fixas)
    conditions: {
      diabetes: boolean;
      hypertension: boolean;
      heartProblems: boolean;
      autoimmune: boolean;
      cancerHistory: boolean;
      keloid: boolean;
      herpes: boolean;
      epilepsy: boolean;
      hivHepatitis: boolean;
      pacemaker: boolean;
      pregnant: boolean;
      breastfeeding: boolean;
      anticoagulant: boolean;
      isotretinoin: boolean;
      contraceptive: boolean;
    };
    otherConditions: string;
    
    // Alergias e Medicações (Estruturadas)
    hasAllergies: boolean;
    allergiesDetails: string;
    hasContinuousMedication: boolean;
    medicationsDetails: string;
    
    familyHistory: string;
    
    // Hábitos
    habits: {
      smoking: boolean;
      alcohol: boolean;
      exercise: boolean;
      sunExposure: boolean;
      sunscreen: boolean;
      diet: string;
    };
    
    // Avaliação Clínica
    fitzpatrickType: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | '';
    skinEvaluation: string;
    faceEvaluation: string;

    // Conduta — o que foi decidido fazer, e quais procedimentos do catálogo estão
    // planejados (usado depois pra puxar sozinho no lançamento financeiro)
    conduct?: string;
    plannedProcedures?: string[];
    // Quando um procedimento tem mais de uma substância vinculada, guarda aqui qual foi
    // escolhida pra esse paciente especificamente (nome do procedimento -> nome da substância)
    plannedSubstances?: Record<string, string>;
    // Quantas vezes cada procedimento marcado será realizado — multiplica o valor
    // lançado no financeiro e no orçamento (padrão 1 se não especificado)
    plannedProcedureQuantities?: Record<string, number>;
    // Controla quais procedimentos já geraram lançamento no financeiro — evita duplicar
    // se o botão "Lançar no Financeiro" for clicado de novo por engano
    launchedProcedures?: string[];
    // ID da transação criada automaticamente pra cada procedimento lançado — permite
    // remover o lançamento sozinho se o procedimento for desmarcado depois
    launchedProcedureTransactionIds?: Record<string, string>;

    // Questionário de saúde específico da Ficha Clínica — preenchido pelo próprio
    // paciente após o check-in. Guarda um retrato completo do que foi respondido (pra
    // sempre dar pra ver exatamente o que o paciente disse), além de também refletir
    // condições médicas e estilo de vida direto nos campos de sempre da anamnese
    // (conditions/habits) — dá pra ver dos dois jeitos.
    intakeQuestionnaire?: {
      usedToxinBefore: boolean;
      lastToxinDate: string;
      toxinTimes: string;
      usedPMMA: boolean;
      hadPastComplications: boolean;
      pastComplicationsDetail: string;
      hasFoodAllergy: boolean;
      foodAllergyDetail: string;
      hasInsectAllergy: boolean;
      insectAllergyDetail: string;
      hadFillerBefore: boolean;
      fillerProduct: string;
      hasCoagulationDisease: boolean;
      coagulationDiseaseDetail: string;
      bleedsEasily: boolean;
      hadHemorrhageOrHerpes: boolean;
      hemorrhageOrHerpesDetail: string;
      hasAnemia: boolean;
      hasMedicalConditions: boolean;
      medicalConditions?: {
        diabetes: boolean; hypertension: boolean; heartProblems: boolean; autoimmune: boolean;
        cancerHistory: boolean; keloid: boolean; herpes: boolean; epilepsy: boolean;
        hivHepatitis: boolean; pacemaker: boolean; anticoagulant: boolean; isotretinoin: boolean;
      };
      lifestyle?: {
        smoking: boolean; alcohol: boolean; exercise: boolean; sunExposure: boolean; sunscreen: boolean;
      };
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      howHeardAboutClinic?: string;
      submittedAt?: string; // quando o paciente enviou esse questionário
    };
  };
  // Uma anamnese "liberada" trava pra sempre — nem administrador consegue mais editar
  // depois disso. Enquanto não for liberada, é só um rascunho, editável à vontade.
  anamnesisReleased?: boolean;
  anamnesisReleasedAt?: string;
  anamnesisReleasedBy?: string; // e-mail de quem liberou
  // Cada anamnese liberada vira uma entrada permanente aqui — histórico completo,
  // nunca apagado nem editado depois de gravado.
  anamnesisHistory?: {
    snapshot: Patient['anamnesis'];
    releasedAt: string;
    releasedBy: string; // quem liberou — nome do profissional (presencial) ou "Paciente"
                         // quando liberado por assinatura remota
    // Preenchidos só quando liberado via assinatura remota (paciente assinou do próprio
    // celular) — prova de que foi ele, mostrando pra qual contato dele o link foi enviado.
    signatureUrl?: string;
    sentVia?: 'whatsapp' | 'email';
    sentTo?: string;
  }[];
  // Orçamentos assinados pelo paciente — o Orçamento em si não persiste nada por padrão
  // (é só um documento gerado), mas quando enviado pra assinatura remota e assinado,
  // fica guardado aqui permanentemente, sem apagar orçamentos assinados anteriormente.
  // Orçamentos salvos que ainda não foram pagos — o paciente recebeu/viu o orçamento
  // mas não aceitou/pagou na hora. Fica guardado aqui com prazo de validade de 15 dias,
  // sem entrar no financeiro nem debitar estoque até alguém marcar como pago
  // explicitamente (handleMarkBudgetPaid). Diferente de budgetHistory, que é
  // especificamente pra orçamentos assinados remotamente pelo paciente.
  pendingBudgets?: {
    id: string;
    date: string; // quando foi salvo
    validUntil: string; // date + 15 dias — depois disso mostra como vencido
    items: { description: string; value: string; procedureId?: string; insumoKit?: { itemId: string; itemName: string; quantity: number }[] }[];
    total: number;
    notes?: string;
    status: 'pending' | 'paid';
    paidAt?: string;
  }[];
  // Registro de qual lote de cada substância o paciente recebeu — preenchido
  // automaticamente ao aceitar um orçamento com insumo vinculado. Rastreabilidade em
  // caso de reação adversa ou recall de um lote específico.
  medicationLog?: {
    id: string;
    date: string;
    itemName: string;
    procedureNames: string[];
    lotNumber?: string;
    expiryDate?: string;
    quantity: number;
  }[];
  budgetHistory?: {
    id: string;
    // Número sequencial do orçamento — cresce sempre, nunca repete, gerado por
    // transação atômica na hora da assinatura (system/budgetCounter)
    budgetNumber?: number;
    date: string;
    items: { description: string; value: string }[];
    total: number;
    validityDays: string;
    notes?: string;
    signedAt: string;
    signatureUrl: string;
    sentVia?: 'whatsapp' | 'email';
    sentTo?: string;
  }[];
  photoHistory?: string[];
  files?: {
    name: string;
    url: string;
    type: string;
    date: string;
  }[];
  // Aba dedicada de Exames — mais estruturada que o anexo genérico acima: guarda o tipo
  // do exame e a data em que foi REALIZADO (não a data de upload), além de observações
  // sobre o resultado.
  exams?: {
    examType: string;
    examDate: string;
    notes?: string;
    fileUrl?: string;
    fileName?: string;
  }[];
  // Notas fiscais emitidas em site externo (o app não emite nota fiscal de verdade —
  // isso exige integração com prefeitura/certificado digital — só guarda o PDF já
  // emitido, anexado aqui pra ficar organizado por paciente)
  invoices?: {
    id: string;
    date: string; // data em que foi anexada
    value?: number;
    notes?: string;
    fileUrl: string;
    fileName: string;
  }[];
  // Atestados & Declarações — sem rascunho intermediário (o texto final é gerado a
  // partir de vários campos que não são reeditáveis depois, então não fazia sentido ter
  // uma etapa de "salvar rascunho"): libera direto, trava pra sempre no histórico
  atestadosHistory?: {
    id: string;
    date: string;
    docType: string;
    documentTitle: string;
    bodyText: string;
    releasedAt: string;
    releasedBy: string;
  }[];
  evolution?: {
    date: string;
    procedure: string;
    notes: string;
    bucoMaxiloNotes?: string;
    numericValue?: number;
    professionalId?: string;
  }[]; // só rascunhos — editáveis à vontade, ainda não liberados
  // Registros de evolução liberados — travados pra sempre, nunca editados/removidos
  // depois de gravados aqui (nem por administrador)
  evolutionHistory?: {
    date: string;
    procedure: string;
    notes: string;
    bucoMaxiloNotes?: string;
    numericValue?: number;
    professionalId?: string;
    releasedAt: string;
    releasedBy: string;
  }[];
  consentTerms?: {
    templateId: string;
    templateTitle: string;
    content?: string; // texto completo assinado — sem isso, dava pra ver só o título e a assinatura, nunca o termo por inteiro
    signedAt: string;
    signatureUrl: string; // Base64 or URL
    // Prova de autenticidade quando assinado remotamente — pra qual contato do próprio
    // paciente (já cadastrado, não digitado na hora) o link foi enviado. Ausente =
    // assinado presencialmente no app, sem envio remoto.
    sentVia?: 'whatsapp' | 'email';
    sentTo?: string;
  }[];
  prescriptions?: {
    id: string;
    date: string;
    content: string;
    medicines: { name: string, dosage: string, instructions: string }[];
    signatureUrl?: string;
  }[];
  updatedAt?: string;
}

// Modelo de receita pronto, cadastrado uma vez em Configurações e reaproveitado toda
// vez que a mesma combinação de medicamentos é prescrita com frequência (ex: protocolo
// pós-procedimento padrão) — evita digitar tudo de novo cada vez.
export interface PrescriptionTemplate {
  id?: string;
  name: string;
  medicines: { name: string, dosage: string, instructions: string }[];
  notes?: string;
}

export interface Appointment {
  id?: string;
  userId?: string;
  patientId?: string; // opcional: agendamentos feitos pelo paciente direto na página pública não têm patientId
  patientName: string;
  guestPhone?: string; // telefone informado pelo paciente na página pública (quando não há cadastro ainda)
  date: string;
  time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  notes?: string; // usado como descrição do procedimento
  value?: number;
  financeGenerated?: boolean; // evita duplicar lançamento financeiro ao concluir
  seriesId?: string; // agrupa ocorrências de um agendamento recorrente (pacote de sessões)
  checkedInAt?: string; // horário de chegada na recepção (fila de espera)
  checkinToken?: string; // token secreto usado no link de check-in do próprio paciente
  bookedOnline?: boolean; // true quando o próprio paciente agendou pela página pública
  professionalId?: string; // com qual profissional é esse agendamento — cada um tem agenda própria
  professionalName?: string; // nome guardado junto, pra continuar legível mesmo se o profissional for renomeado/removido depois
  createdAt?: string;
}

// Cada compra de um item vira um lote separado — permite ter mais de uma validade ao
// mesmo tempo pro mesmo insumo (ex: comprou toxina em janeiro com validade X, comprou
// mais em março com validade Y). O consumo sempre desconta primeiro do lote que vence
// mais cedo (FEFO — First Expire, First Out), prática padrão pra insumos injetáveis.
export interface InventoryBatch {
  id: string;
  lotNumber?: string;
  quantity: number; // quanto ainda resta desse lote específico
  expiryDate?: string;
  purchaseDate: string;
  unitCost?: number; // custo desse lote específico — pode variar de compra pra compra
  // Foto da caixa/rótulo do produto — confirma visualmente lote e validade sem
  // precisar digitar tudo certo, e serve de comprovante em caso de dúvida depois
  photoUrl?: string;
}

export interface InventoryItem {
  id?: string;
  userId?: string;
  code?: string;
  name: string;
  category: string;
  quantity: number; // sempre em unidades — mesmo quando comprado por caixa, o controle de
                     // estoque conta e mostra sempre em unidades, já que o uso é sempre
                     // unitário
  // Lotes individuais — a soma de quantity de todos os lotes deve sempre bater com o
  // campo "quantity" acima (mantido por compatibilidade com o resto do app, que ainda
  // lê só o total). Opcional: itens cadastrados antes dessa funcionalidade não têm
  // lotes, e continuam funcionando normalmente sem informação de validade.
  batches?: InventoryBatch[];
  // Algumas substâncias vêm num frasco/ampola que rende pra mais de um paciente no
  // mesmo dia (ex: toxina botulínica diluída, dividida entre vários atendimentos) —
  // marcado, o mesmo lote pode ser vinculado a vários pacientes diferentes sem soar
  // como erro de duplicação. Desmarcado (padrão), assume que 1 lote = 1 paciente.
  sharedAcrossPatients?: boolean;
  minThreshold: number; // sempre guardado em unidades, mesmo que a pessoa tenha
                         // preenchido em caixas no cadastro (convertido na hora de salvar)
  unit: string;
  supplier?: string;
  lastRestockDate?: string;
  expiryDate?: string;
  // Se marcado, a compra desse item é feita em caixas fechadas — usado só na hora de
  // comprar/repor (pergunta quantas caixas, converte pra unidades automaticamente).
  // O consumo em si continua sempre por unidade, nunca por caixa.
  purchasedByBox?: boolean;
  unitsPerBox?: number; // quantas unidades vêm em cada caixa — só relevante se purchasedByBox
  // Quantos ml/UI vêm em 1 ampola/frasco — campo legado, mantido só pra não quebrar a
  // leitura de itens antigos cadastrados como "Ampolas" antes dessa opção ser removida do
  // formulário de cadastro. Itens novos não usam mais isso.
  ampouleSize?: number;
  // Custo por unidade, calculado a partir da última compra com valor informado (valor
  // gasto ÷ quantidade comprada, sempre em unidades). Atualizado toda vez que um valor é
  // informado no cadastro ou na reposição — usado pra calcular o lucro por procedimento.
  lastUnitCost?: number;
}

// Histórico de consumo/reposição de estoque (feature adicionada depois, direto no AI Studio)
export interface InventoryMovement {
  id?: string;
  userId?: string;
  itemId: string;
  itemName: string;
  category?: string;
  quantity: number;
  type: 'consumption' | 'restock';
  date: string;
}

// Gerado automaticamente quando um orçamento é aceito e o estoque não é suficiente pra
// cobrir os insumos/substância do procedimento — o orçamento segue em frente mesmo assim
// (não trava o atendimento), mas fica visível pro administrador que precisa comprar.
export interface StockAlert {
  id?: string;
  userId?: string;
  itemId: string;
  itemName: string;
  quantityNeeded: number; // quanto faltou pra cobrir o débito
  patientName: string;
  patientId?: string;
  date: string;
  resolved: boolean;
}

// Um registro por procedimento efetivamente pago (Confirmar Lançamento no Orçamento) —
// diferente de "transactions", que soma o orçamento inteiro numa linha só, aqui cada
// procedimento vira uma linha própria, com o custo de insumos já calculado no momento
// (usando o custo por unidade mais recente de cada item do kit). Usado só pra montar a
// aba "Lucro por Procedimento" em Financeiro — não substitui nem duplica transactions.
export interface ProcedureRevenueEntry {
  id?: string;
  userId?: string;
  procedureId?: string;
  procedureName: string;
  value: number; // valor pago por esse procedimento específico
  insumoCost: number; // custo dos insumos do kit, calculado na hora da confirmação
  date: string;
  patientId?: string;
  patientName?: string;
}

export interface ConsentTemplate {
  id?: string;
  title: string;
  content: string;
  category: 'cirurgico' | 'estetico' | 'geral';
}

export interface Transaction {
  id?: string;
  userId?: string;
  amount: number;
  type: 'income' | 'expense';
  date: any; // Firestore Timestamp
  category: string;
  description: string;
  patientId?: string;
  seriesId?: string; // agrupa lançamentos gerados por recorrência
  autoGenerated?: boolean; // criado automaticamente (ex: ao concluir consulta)
}

// Custos fixos mensais da clínica (aluguel, telefone, funcionário, etc) — só
// administradores veem/gerenciam essa aba. O total ativo é somado como saída junto
// com as transações normais, sem precisar lançar manualmente todo mês.
export interface FixedCost {
  id?: string;
  userId?: string;
  description: string;
  amount: number;
  active: boolean;
  // Fixo: soma automaticamente todo mês, sem precisar lançar de novo (aluguel,
  // telefone). Variável: só entra no cálculo quando lançado manualmente naquele mês
  // específico (ex: um gasto que muda de valor mês a mês) — existente aqui só como
  // "template" reaproveitável, sem repetir sozinho.
  costType: 'fixed' | 'variable';
  lastLaunchedMonth?: string; // formato "AAAA-MM" — só usado pra custos variáveis
}

export interface ClinicSettings {
  professionalName: string;
  registrationNumber: string;
  // Assinatura do profissional, cadastrada uma vez (foto ou desenhada) — usada
  // automaticamente sempre que um documento é liberado, sem precisar assinar com o
  // mouse toda vez (ex: Receituário).
  professionalSignatureUrl?: string;
  clinicName: string;
  clinicAddress: string;
  contactEmail?: string;
  consentTemplates?: ConsentTemplate[];
  biometricEnabled?: boolean;
  pinHash?: string; // hash SHA-256 do PIN de 6 dígitos — nunca guardamos o PIN em texto puro
  webauthnCredentialId?: string; // id da credencial de biometria (Face ID/Touch ID/digital) — nenhum dado biométrico é guardado, só esse identificador
  cloudBackupEnabled?: boolean;
  whatsappNumber?: string;
  // Horário de atendimento — controla quais dias/horários aparecem como disponíveis na
  // página pública de agendamento (#agendar)
  workingDays?: number[]; // 0=domingo, 1=segunda ... 6=sábado
  workingHoursStart?: string; // "08:00"
  workingHoursEnd?: string; // "18:00"
  appointmentInterval?: number; // minutos entre um horário e outro: 15, 20, 30, 45, 60
  agendaBlocked?: boolean; // fecha a agenda inteira temporariamente, sem precisar mexer em cada dia
  blockedDates?: string[]; // datas específicas bloqueadas (AAAA-MM-DD) — feriado, viagem, período de férias, etc.
  // Procedimentos e substâncias, separados — um procedimento pode ser feito com mais de
  // uma substância possível (ex: "Preenchimento Labial" pode usar diferentes marcas de
  // ácido hialurônico, cada uma com preço próprio por ml).
  procedures?: {
    id: string;
    name: string;
    price: number; // valor cobrado do procedimento em si
    // Insumos e substância usados por sessão (agulha, luva, gaze, e também a substância
    // já cadastrada no estoque, como a toxina/preenchedor) — cada vez que esse
    // procedimento é aceito num orçamento, essa quantidade de cada item é debitada do
    // estoque automaticamente, formando um "pacote" fechado pra esse procedimento.
    insumoKit?: { itemId: string; itemName: string; quantity: number }[];
    // Se esse procedimento pode ter desconto no Orçamento, e o teto máximo permitido —
    // controla o balão de desconto que aparece ao lado do item no Orçamento.
    allowDiscount?: boolean;
    maxDiscountPercent?: number;
  }[];
  substances?: {
    id: string;
    name: string;
    unit: 'ml' | 'unidade';
    procedureIds?: string[]; // legado — não vincula mais nada, o Kit de Insumos do
                              // procedimento é quem define isso agora. Mantido opcional
                              // só pra não quebrar leitura de dados antigos.
    // pricePerUnit/ampouleSize removidos — o valor é sempre do procedimento agora, a
    // substância não entra no cálculo do orçamento. Mantidos como opcionais só pra não
    // quebrar leitura de dados antigos que ainda tenham esses campos gravados.
    pricePerUnit?: number;
    ampouleSize?: number;
  }[];
  prescriptionTemplates?: PrescriptionTemplate[];
  // Link do site/plataforma que a clínica usa pra emitir nota fiscal — configurável
  // porque o app em si não emite (isso exige integração com prefeitura/certificado
  // digital); só abre esse link e depois guarda o PDF já emitido no prontuário.
  invoiceEmissionLink?: string;
  // Margem de lucro mínima aceitável (%) — usada pra validar o preço de um procedimento
  // contra o custo do seu Kit de Insumos, impedindo salvar um valor que dê menos que
  // esse percentual de lucro.
  minProfitMarginPercent?: number;
  // Client ID OAuth do Google, criado pelo próprio administrador no Google Cloud
  // Console — usado só pra enviar backups direto pro Google Drive dele, sem precisar
  // de servidor próprio nem guardar nenhuma credencial secreta do lado do app.
  googleDriveClientId?: string;
}

// Documento público (legível por qualquer um, sem login) usado pela página de agendamento
// pra saber qual clínica é o "dono" deste app e mostrar o nome dela
export interface PublicBookingConfig {
  ownerId: string;
  clinicName: string;
  professionalName: string;
  whatsappNumber?: string;
  workingDays?: number[];
  workingHoursStart?: string;
  workingHoursEnd?: string;
  appointmentInterval?: number;
  agendaBlocked?: boolean;
  blockedDates?: string[];
}

// Cada profissional tem agenda própria — horários de atendimento, dias da semana e
// bloqueios independentes dos demais. Só administrador consegue criar/editar isso (nas
// regras do Firestore), inclusive a agenda de outros profissionais que não sejam ele
// mesmo — é assim que "só administrador bloqueia, mas bloqueia de qualquer um" funciona.
export interface Professional {
  id?: string;
  name: string;
  email?: string; // opcional — só usado quando o profissional também é um login do sistema
  workingDays?: number[]; // 0=domingo, 1=segunda ... 6=sábado
  workingHoursStart?: string; // "08:00"
  workingHoursEnd?: string; // "18:00"
  appointmentInterval?: number; // minutos entre um horário e outro
  agendaBlocked?: boolean; // fecha a agenda desse profissional inteira, temporariamente
  blockedDates?: string[]; // datas específicas bloqueadas (AAAA-MM-DD) — dias avulsos ou período
}

// Marca um horário como ocupado — coleção pública (só data/hora, sem nenhum dado do paciente),
// usada pela página de agendamento pra saber quais horários mostrar como disponíveis.
export interface BusySlot {
  clinicId: string;
  professionalId?: string; // cada profissional tem disponibilidade independente
  date: string;
  time: string;
}

// Um ponto marcado no diagrama de rosto — x/y em porcentagem (0-100), não em pixel, pra
// funcionar em qualquer tamanho de tela sem perder a posição relativa.
export interface FaceMarkingPoint {
  x: number;
  y: number;
  label: string;
  color: string;
  inventoryItemId?: string; // se preenchido, dar baixa automática no estoque ao salvar
  inventoryItemName?: string; // guardado junto pra manter o histórico legível mesmo se o item for renomeado/excluído depois
  inventoryQuantity?: number;
  // Campos antigos (um ponto = uma substância) — mantidos só pra não quebrar a leitura
  // de sessões salvas antes de existir suporte a mais de uma substância por ponto. Novas
  // marcações usam o array "substances" abaixo, que suporta infiltrar mais de um produto
  // no mesmo ponto de aplicação.
  substanceId?: string;
  substanceName?: string;
  substanceMlPerPoint?: number;
  // Vínculo com o catálogo de Substâncias (Configurações) — diferente do estoque acima,
  // esse é usado pra calcular o custo/orçamento, não pra dar baixa física. Um ponto pode
  // ter mais de uma substância aplicada nele (ex: toxina + preenchedor no mesmo local).
  substances?: { substanceId: string; substanceName: string; ml: number }[];
}

// Resumo de quanto de cada substância foi usado numa sessão de marcação inteira — soma
// Soma de quanto de cada substância foi usado numa sessão de marcação inteira — só
// informativo (quanto produto foi gasto), não entra no cálculo do orçamento, que sempre
// vem do valor do procedimento.
export interface SubstanceUsageSummary {
  substanceId: string;
  substanceName: string;
  totalMl: number;
}

// Uma "sessão" de marcação salva no histórico do paciente — guarda o sexo usado no
// diagrama daquela vez (não muda retroativamente se o cadastro do paciente for editado depois)
export interface FaceMarkingSession {
  id: string;
  date: string;
  sex: 'F' | 'M' | 'N';
  notes?: string;
  points: FaceMarkingPoint[];
  substanceUsage?: SubstanceUsageSummary[];
}

// Senha do painel de administração — uma por administrador (documento admin_security/{uid})
export interface AdminSecurity {
  passwordHash?: string;
  webauthnCredentialId?: string;
}

