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
  sex?: 'F' | 'M'; // usado pra mostrar o diagrama/rosto genérico correto na Anamnese
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
    signedAt: string;
    signatureUrl: string; // Base64 or URL
  }[];
  prescriptions?: {
    id: string;
    date: string;
    content: string;
    medicines: { name: string, dosage: string, instructions: string }[];
  }[];
  updatedAt?: string;
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
  createdAt?: string;
}

export interface InventoryItem {
  id?: string;
  userId?: string;
  code?: string;
  name: string;
  category: string;
  quantity: number;
  minThreshold: number;
  unit: string;
  supplier?: string;
  lastRestockDate?: string;
  expiryDate?: string;
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
  blockedDates?: string[]; // datas específicas bloqueadas (AAAA-MM-DD) — feriado, viagem, etc.
  // Catálogo de preços — usado pro Orçamento (BudgetGenerator) sugerir descrição e valor
  // automaticamente ao adicionar um item, em vez de digitar tudo na mão toda vez.
  priceCatalog?: {
    id: string;
    name: string;
    unit: 'procedimento' | 'ml' | 'unidade';
    price: number; // valor por procedimento inteiro, ou por ml/unidade, conforme "unit"
  }[];
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

// Marca um horário como ocupado — coleção pública (só data/hora, sem nenhum dado do paciente),
// usada pela página de agendamento pra saber quais horários mostrar como disponíveis.
export interface BusySlot {
  clinicId: string;
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
}

// Uma "sessão" de marcação salva no histórico do paciente — guarda o sexo usado no
// diagrama daquela vez (não muda retroativamente se o cadastro do paciente for editado depois)
export interface FaceMarkingSession {
  id: string;
  date: string;
  sex: 'F' | 'M';
  notes?: string;
  points: FaceMarkingPoint[];
}

// Senha do painel de administração — uma por administrador (documento admin_security/{uid})
export interface AdminSecurity {
  passwordHash?: string;
  webauthnCredentialId?: string;
}

