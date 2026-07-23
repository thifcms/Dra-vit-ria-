export interface Patient {
  id?: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  address?: string;
  cpf?: string;
  anamnesis?: {
    // Dados Pessoais & Queixas
    mainComplaint: string;
    expectations: string;
    
    // Histórico Médico
    medicalHistory: string;
    allergies: string;
    medications: string;
    familyHistory: string;
    
    // Hábitos
    habits: {
      smoking: boolean;
      alcohol: boolean;
      exercise: boolean;
      diet: string;
    };
    
    // Avaliação Clínica
    skinEvaluation: string;
    faceEvaluation: string;
  };
  photoHistory?: string[];
  files?: {
    name: string;
    url: string;
    type: string;
    date: string;
  }[];
  evolution?: {
    date: string;
    procedure: string;
    notes: string;
    bucoMaxiloNotes?: string;
    professionalId?: string;
  }[];
  consentTerms?: {
    templateId: string;
    templateTitle: string;
    signedAt: string;
    signatureUrl: string; // Base64 or URL
  }[];
  updatedAt?: string;
}

export interface Appointment {
  id?: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
}

export interface InventoryItem {
  id?: string;
  code: string;
  name: string;
  category: string;
  quantity: number;
  minThreshold: number;
  unit: string;
  supplier: string;
  lastRestockDate?: string;
}

export interface ConsentTemplate {
  id?: string;
  title: string;
  content: string;
  category: 'cirurgico' | 'estetico' | 'geral';
}

export interface Transaction {
  id?: string;
  amount: number;
  type: 'income' | 'expense';
  date: any; // Firestore Timestamp
  category: string;
  description: string;
  patientId?: string;
}

export interface ClinicSettings {
  professionalName: string;
  registrationNumber: string;
  clinicName: string;
  clinicAddress: string;
  contactEmail?: string;
}
