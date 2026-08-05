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
    // Controla quais procedimentos já geraram lançamento no financeiro — evita duplicar
    // se o botão "Lançar no Financeiro" for clicado de novo por engano
    launchedProcedures?: string[];

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
    releasedBy: string;
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
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
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

export interface InventoryItem {
  id?: string;
  userId?: string;
  code?: string;
  name: string;
  category: string;
  quantity: number; // sempre em ampolas/frascos pra itens com ampouleSize — a compra é
                     // sempre por ampola inteira, mesmo que o uso seja parcial (em ml)
  minThreshold: number;
  unit: string;
  supplier?: string;
  lastRestockDate?: string;
  expiryDate?: string;
  // Quantos ml/UI vêm em 1 ampola/frasco — só faz sentido pra itens com unit='Ampolas'.
  // Usado pra converter um consumo registrado em ml pra uma fração de ampola, já que o
  // controle de estoque sempre conta por ampola, não por ml solto.
  ampouleSize?: number;
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

export interface ClinicSettings {
  professionalName: string;
  registrationNumber: string;
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
  }[];
  substances?: {
    id: string;
    name: string;
    unit: 'ml' | 'unidade';
    procedureIds: string[]; // a quais procedimentos essa substância pode ser aplicada
    // pricePerUnit/ampouleSize removidos — o valor é sempre do procedimento agora, a
    // substância não entra no cálculo do orçamento. Mantidos como opcionais só pra não
    // quebrar leitura de dados antigos que ainda tenham esses campos gravados.
    pricePerUnit?: number;
    ampouleSize?: number;
  }[];
  prescriptionTemplates?: PrescriptionTemplate[];
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
  // Vínculo com o catálogo de Substâncias (Configurações) — diferente do estoque acima,
  // esse é usado pra calcular o custo/orçamento, não pra dar baixa física
  substanceId?: string;
  substanceName?: string;
  substanceMlPerPoint?: number;
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

