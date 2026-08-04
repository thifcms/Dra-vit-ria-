import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, setDoc, deleteDoc, deleteField, getDoc, getDocs, doc, where, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { compressImage } from '../lib/imageCompress';
import { db, storage } from '../lib/firebase';
import { Patient, ClinicSettings } from '../types';
import { phoneIndexKey, cpfIndexKey, getClinicOwnerId, todayLocalStr, remoteSignLink } from '../lib/slots';
import { buildLetterheadHtml } from '../lib/documentTemplate';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  User as UserIcon, 
  FileText, 
  Camera, 
  ChevronRight, 
  History, 
  ArrowLeft,
  Download,
  Save,
  Trash2,
  Paperclip,
  Microscope,
  Stamp,
  MessageCircle,
  Eye,
  Bone,
  MapPin,
  Lock,
  Edit2,
  CheckCircle2,
  X,
  FileDown,
  Pill,
  Printer,
  ExternalLink
} from 'lucide-react';
import SignaturePad from 'react-signature-canvas';
import { showToast } from '../lib/toast';
import { generatePatientPdf, patientPdfFileName } from '../lib/patientPdf';
import { DEFAULT_CONSENT_TEMPLATES } from '../lib/defaultConsentTemplates';
import { extractTextFromPdf, extractTextFromImage } from '../lib/textExtraction';
const AnatomyViewer = lazy(() => import('./AnatomyViewer'));
import FaceMarkingTab from './FaceMarkingTab';
import BudgetGenerator from './BudgetGenerator';

// Quebra um texto corrido em parágrafos por frase (ponto final + espaço/quebra de linha,
// seguido de letra maiúscula) — evita quebrar números como "13.709/2018" ou "R$ 1.200,00",
// que não são seguidos de maiúscula logo depois do ponto.
function formatTermParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/) // já respeita quebras de parágrafo que o próprio texto já tinha
    .flatMap(block =>
      block
        .split(/(?<=\.)\s+(?=[A-ZÀ-Ú])/)
        .map(s => s.trim())
        .filter(Boolean)
    );
}

import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

// Helper to export patient record as a clean text file
// Mesma lista de condições usada na ficha de anamnese, reaproveitada pro filtro de pacientes
const conditionFilterOptions: { key: string, label: string }[] = [
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'hypertension', label: 'Hipertensão' },
  { key: 'heartProblems', label: 'Problemas Cardíacos' },
  { key: 'autoimmune', label: 'Doença Autoimune' },
  { key: 'cancerHistory', label: 'Histórico de Câncer' },
  { key: 'keloid', label: 'Queloide' },
  { key: 'herpes', label: 'Herpes' },
  { key: 'epilepsy', label: 'Epilepsia' },
  { key: 'hivHepatitis', label: 'HIV/Hepatite' },
  { key: 'pacemaker', label: 'Marca-passo' },
  { key: 'pregnant', label: 'Gestante' },
  { key: 'breastfeeding', label: 'Amamentando' },
  { key: 'anticoagulant', label: 'Anticoagulante' },
  { key: 'isotretinoin', label: 'Roacutan' },
  { key: 'contraceptive', label: 'Anticoncepcional' },
];

export default function Patients({ user, initialPatientId }: { user: User, initialPatientId?: string | null }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'patients'),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      setPatients(list);
      setLoading(false);
    });
    return unsubscribe;
  }, [user.uid]);

  useEffect(() => {
    if (initialPatientId) {
      const p = patients.find(p => p.id === initialPatientId);
      if (p) setSelectedPatient(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPatientId, patients.length]);

  const filteredPatients = useMemo(
    () => patients.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.cpf?.includes(searchTerm);
      const matchesCondition = !conditionFilter || (p.anamnesis?.conditions as any)?.[conditionFilter] === true;
      return matchesSearch && matchesCondition;
    }),
    [patients, searchTerm, conditionFilter]
  );

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [searchTerm, conditionFilter]);
  const pagedPatients = useMemo(
    () => filteredPatients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredPatients, page]
  );

  if (selectedPatient) {
    // We fetch a fresh copy or use real-time sync for the detail view
    const patientSync = patients.find(p => p.id === selectedPatient.id) || selectedPatient;
    return <PatientDetail user={user} patient={patientSync} onBack={() => setSelectedPatient(null)} />;
  }

  return (
    <div className="max-w-[1800px] mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="serif text-3xl text-[#4A433D]">Base de Pacientes</h1>
          <p className="text-[#9CA3AF] text-xs font-semibold uppercase tracking-widest mt-1">Prontuários Digitais & Históricos</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#EADFD4] text-white px-8 py-4 rounded-2xl flex items-center gap-2 hover:bg-[#DFCFBF] transition-all shadow-md active:scale-95 font-medium"
        >
          <Plus size={20} />
          <span>Novo Cadastro</span>
        </button>
      </div>

      <div className="bg-white rounded-[40px] border border-[#F5F2F0] shadow-sm overflow-hidden min-h-[400px]">
        <div className="p-8 border-b border-[#F5F2F0] flex items-center gap-6 bg-[#FDFBF9]">
          <div className="flex-1 max-w-md bg-white border border-[#F5F2F0] rounded-2xl px-6 py-3 flex items-center gap-4 shadow-sm focus-within:border-[#EADFD4]/30 transition-all">
            <Search size={20} className="text-[#9CA3AF]" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou CPF..." 
              className="flex-1 outline-none font-light text-[#4A433D] placeholder-[#9CA3AF] bg-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="bg-white border border-[#F5F2F0] rounded-2xl px-5 py-3 shadow-sm outline-none focus:border-[#EADFD4]/30 transition-all text-xs font-semibold text-[#4A433D] appearance-none"
            value={conditionFilter}
            onChange={e => setConditionFilter(e.target.value)}
          >
            <option value="">Todas as condições</option>
            {conditionFilterOptions.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <div className="hidden md:block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">
            {filteredPatients.length} pacientes encontrados
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-[#9CA3AF] font-light italic">Sincronizando dados...</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FDFBF9] border-b border-[#F5F2F0]">
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Identificação</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">CPF / E-mail</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Última Atividade</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">Status</th>
                  <th className="p-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F2F0]">
                {pagedPatients.map(patient => (
                  <tr 
                    key={patient.id} 
                    className="hover:bg-[#FDFBF9] cursor-pointer transition-colors group"
                    onClick={() => setSelectedPatient(patient)}
                  >
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-[#EADFD4] border border-[#F5F2F0] shadow-sm group-hover:bg-[#EADFD4] group-hover:text-white transition-all">
                          <UserIcon size={24} />
                        </div>
                        <div>
                          <p className="font-semibold text-[#4A433D]">{patient.name}</p>
                          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">Paciente</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <p className="text-sm text-[#4A433D] font-medium">{patient.cpf || '-'}</p>
                      <p className="text-xs text-[#9CA3AF] font-light">{patient.email || 'Sem e-mail'}</p>
                    </td>
                    <td className="p-6 text-sm font-light text-[#9CA3AF]">
                      {patient.updatedAt ? new Date(patient.updatedAt).toLocaleDateString('pt-BR') : 'Sem registro'}
                    </td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-[#F0F7F0] text-[#8BA888] text-[9px] font-bold uppercase tracking-widest rounded-full">Ativo</span>
                    </td>
                    <td className="p-6 text-right">
                      <ChevronRight size={20} className="text-[#F5F2F0] group-hover:text-[#9CA3AF] group-hover:translate-x-1 transition-all inline-block" />
                    </td>
                  </tr>
                ))}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-20 text-center text-[#9CA3AF] font-light italic">
                      Nenhum paciente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        {!loading && filteredPatients.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-8 py-5 border-t border-[#F5F2F0] bg-[#FDFBF9]">
            <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">
              Página {page} de {totalPages} — {filteredPatients.length} pacientes
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl border border-[#F5F2F0] text-xs font-bold text-[#9CA3AF] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white transition-colors"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl border border-[#F5F2F0] text-xs font-bold text-[#9CA3AF] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <AddPatientModal user={user} onClose={() => setIsAdding(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddPatientModal({ user, onClose }: { user: User, onClose: () => void }) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sex, setSex] = useState<'F' | 'M' | 'N' | ''>('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !cpf.trim() || !email.trim() || !phone.trim() || !sex) {
      showToast('Preencha todos os campos pra cadastrar o paciente', 'error');
      return;
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'patients'), {
        userId: user.uid,
        name,
        cpf,
        email,
        phone,
        sex: sex || undefined,
        updatedAt: new Date().toISOString(),
        anamnesis: {
          mainComplaint: '',
          expectations: '',
          conditions: {
            diabetes: false, hypertension: false, heartProblems: false, autoimmune: false,
            cancerHistory: false, keloid: false, herpes: false, epilepsy: false,
            hivHepatitis: false, pacemaker: false, pregnant: false, breastfeeding: false,
            anticoagulant: false, isotretinoin: false, contraceptive: false
          },
          otherConditions: '',
          hasAllergies: false,
          allergiesDetails: '',
          hasContinuousMedication: false,
          medicationsDetails: '',
          familyHistory: '',
          habits: { smoking: false, alcohol: false, exercise: false, sunExposure: false, sunscreen: false, diet: '' },
          fitzpatrickType: '',
          skinEvaluation: '',
          faceEvaluation: ''
        },
        evolution: [],
        photoHistory: [],
        files: [],
        consentTerms: []
      });
      if (phone) {
        const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
        await setDoc(doc(db, 'patientPhoneIndex', phoneIndexKey(ownerId, phone)), {
          clinicId: ownerId,
          patientId: ref.id,
          name,
        }).catch(() => {});
      }
      showToast('Paciente cadastrado com sucesso');
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Erro ao cadastrar paciente', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/10 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl"
      >
        <h2 className="text-2xl font-light mb-8 text-[#4A433D] serif">Novo Cadastro</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
            <input 
              required
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Digite o nome completo"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">CPF</label>
              <input 
                required
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">E-mail</label>
              <input 
                required
                type="email"
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="paciente@exemplo.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Telefone / WhatsApp</label>
            <input 
              required
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Sexo</label>
            <div className="grid grid-cols-3 gap-3">
              {(['F', 'M', 'N'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSex(opt)}
                  className={`py-4 rounded-2xl border text-xs font-medium transition-all ${
                    sex === opt
                      ? 'bg-[#EADFD4] text-white border-[#EADFD4]'
                      : 'bg-[#FDFBF9] text-[#9CA3AF] border-[#F5F2F0] hover:border-[#EADFD4]/40'
                  }`}
                >
                  {opt === 'F' ? 'Feminino' : opt === 'M' ? 'Masculino' : 'Prefiro não informar'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all"
            >
              {saving ? 'Gravando...' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function PatientDetail({ user, patient, onBack }: { user: User, patient: Patient, onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'anamnesis' | 'evolution' | 'photos' | 'files' | 'exams' | 'atestado' | 'consent' | 'prescriptions' | 'facemap' | 'budget'>('anamnesis');
  const [phoneDraft, setPhoneDraft] = useState(patient.phone || '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [viewingData, setViewingData] = useState(false);
  const [showAnatomyModal, setShowAnatomyModal] = useState(false);
  const [showAnamnesisHistory, setShowAnamnesisHistory] = useState(false);

  // Modal obrigatório com o resumo da última consulta, mostrado sempre que o prontuário é
  // aberto (se houver pelo menos um registro de evolução anterior, rascunho ou liberado) —
  // só fecha quando a pessoa confirma que leu, não dá pra clicar fora nem apertar Esc pra
  // sair sem ver.
  const allEvolutionEntries = [...(patient.evolution || []), ...(patient.evolutionHistory || [])];
  const lastEvolution = allEvolutionEntries.length > 0
    ? [...allEvolutionEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    : null;
  const [showLastVisitModal, setShowLastVisitModal] = useState(!!lastEvolution);

  // Confere se quem está vendo é administrador — os botões de LGPD (ver todos os dados /
  // excluir todos os dados) só aparecem pra administrador.
  useEffect(() => {
    getDoc(doc(db, 'system', 'authorized_admins')).then(snap => {
      const emails: string[] = snap.exists() ? (snap.data().emails || []) : [];
      setIsAdminUser(!!user.email && emails.includes(user.email));
    }).catch(() => setIsAdminUser(false));
  }, [user.email]);
  
  // Normalização para garantir que dados legados não quebrem a interface nova de checkboxes
  const normalizeAnamnesis = (a: any) => {
    const defaultAnamnesis = {
      mainComplaint: '',
      expectations: '',
      conditions: {
        diabetes: false, hypertension: false, heartProblems: false, autoimmune: false,
        cancerHistory: false, keloid: false, herpes: false, epilepsy: false,
        hivHepatitis: false, pacemaker: false, pregnant: false, breastfeeding: false,
        anticoagulant: false, isotretinoin: false, contraceptive: false
      },
      otherConditions: a?.medicalHistory || '',
      hasAllergies: false,
      allergiesDetails: a?.allergies || '',
      hasContinuousMedication: false,
      medicationsDetails: a?.medications || '',
      familyHistory: a?.familyHistory || '',
      habits: { 
        smoking: a?.habits?.smoking || false, 
        alcohol: a?.habits?.alcohol || false, 
        exercise: a?.habits?.exercise || false,
        sunExposure: false,
        sunscreen: false,
        diet: a?.habits?.diet || ''
      },
      fitzpatrickType: '',
      skinEvaluation: a?.skinEvaluation || '',
      faceEvaluation: a?.faceEvaluation || '',
      conduct: a?.conduct || '',
      plannedProcedures: a?.plannedProcedures || [],
      plannedSubstances: a?.plannedSubstances || {},
      launchedProcedures: a?.launchedProcedures || [],
    };

    return { ...defaultAnamnesis, ...a, 
      conditions: { ...defaultAnamnesis.conditions, ...a?.conditions },
      habits: { ...defaultAnamnesis.habits, ...a?.habits }
    };
  };

  const [anamnesis, setAnamnesis] = useState(normalizeAnamnesis(patient.anamnesis));
  const [procedures, setProcedures] = useState<{ id: string; name: string; price: number }[]>([]);
  const [substances, setSubstances] = useState<{ id: string; name: string; unit: string; pricePerUnit: number; procedureIds: string[] }[]>([]);

  useEffect(() => {
    (async () => {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const snap = await getDoc(doc(db, 'settings', ownerId));
      if (snap.exists()) {
        setProcedures(snap.data().procedures || []);
        setSubstances(snap.data().substances || []);
      }
    })();
  }, [user.uid]);

  // Lança o procedimento marcado na Conduta direto no financeiro — o paciente já está
  // selecionado (é o prontuário que está aberto), então não precisa escolher de novo,
  // igual ao mesmo padrão já usado ao marcar uma consulta como realizada na agenda.
  const handleLaunchToFinance = async (procedureName: string) => {
    const proc = procedures.find(p => p.name === procedureName);
    if (!proc) return;
    const substanceName = anamnesis.plannedSubstances?.[procedureName];
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        amount: proc.price,
        type: 'income',
        date: new Date(),
        category: procedureName,
        description: `${procedureName}${substanceName ? ` (${substanceName})` : ''} — ${patient.name}`,
        patientId: patient.id,
        autoGenerated: true,
      });
      const updatedLaunched = [...(anamnesis.launchedProcedures || []), procedureName];
      setAnamnesis({ ...anamnesis, launchedProcedures: updatedLaunched });
      await updateDoc(doc(db, 'patients', patient.id!), { 'anamnesis.launchedProcedures': updatedLaunched }).catch(() => {});
      showToast('Lançamento financeiro criado');
    } catch (err) {
      showToast('Erro ao lançar no financeiro', 'error');
    }
  };

  const [savingAnamnesis, setSavingAnamnesis] = useState(false);

  // Re-normaliza se o paciente mudar (sync em tempo real)
  useEffect(() => {
    setAnamnesis(normalizeAnamnesis(patient.anamnesis));
  }, [patient.id]); // Apenas quando trocar o ID para não resetar enquanto digita

  const [isAddingEvolution, setIsAddingEvolution] = useState(false);
  const [isAddingExam, setIsAddingExam] = useState(false);
  const [newExam, setNewExam] = useState({ examType: '', examDate: '', notes: '' });
  const [examFile, setExamFile] = useState<File | null>(null);
  const [savingExam, setSavingExam] = useState(false);
  const [extractingText, setExtractingText] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [newEvolution, setNewEvolution] = useState({ procedure: '', notes: '', bucoMaxiloNotes: '', numericValue: '' });

  const handleSaveAnamnesis = async () => {
    if (patient.anamnesisReleased) return; // trava — não deveria nem chegar aqui, mas por segurança
    setSavingAnamnesis(true);
    try {
      await updateDoc(doc(db, 'patients', patient.id!), { 
        anamnesis,
        updatedAt: new Date().toISOString()
      });
      showToast('Anamnese salva (ainda editável)');
    } catch (err) {
      showToast('Erro ao salvar', 'error');
    }
    setSavingAnamnesis(false);
  };

  const [releasingAnamnesis, setReleasingAnamnesis] = useState(false);
  // Backup automático: sempre que algo é liberado (trava definitiva, o momento que
  // importa legalmente), gera um PDF atualizado do prontuário — baixa localmente E sobe
  // pro Firebase Storage (cópia centralizada, acessível de qualquer aparelho, só por
  // administrador), sem depender de ninguém lembrar de fazer isso manualmente depois.
  // Ao liberar uma anamnese/evolução, marca sozinho o agendamento de HOJE desse paciente
  // como "realizado" — funciona independente de como o prontuário foi aberto (clicando na
  // agenda ou direto na lista de pacientes), já que procura pela data, não por um vínculo
  // de navegação. Se não houver agendamento de hoje pendente, simplesmente não faz nada.
  const markTodaysAppointmentCompleted = async () => {
    try {
      const q = query(
        collection(db, 'appointments'),
        where('patientId', '==', patient.id),
        where('date', '==', todayLocalStr())
      );
      const snap = await getDocs(q);
      const pending = snap.docs.find(d => ['scheduled', 'confirmed'].includes(d.data().status));
      if (pending) {
        await updateDoc(doc(db, 'appointments', pending.id), { status: 'completed' });
      }
    } catch {
      // Melhor esforço — não afeta a liberação em si se isso falhar
    }
  };

  const triggerAutoBackup = async (updatedPatientData: Patient) => {
    try {
      const blob = await generatePatientPdf(updatedPatientData, null);
      const fileName = patientPdfFileName(updatedPatientData);

      // Cópia local (no aparelho de quem liberou)
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

      // Cópia central no Storage — histórico completo, nunca sobrescreve (nome inclui
      // data/hora), acessível só por administrador de qualquer aparelho
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const storagePath = `backups/${updatedPatientData.id}/${timestamp}-${fileName}`;
      await uploadBytes(ref(storage, storagePath), blob).catch(() => {});
    } catch {
      // Melhor esforço — não trava a liberação em si se o backup falhar por algum motivo
    }
  };

  const handleReleaseAnamnesis = async () => {
    if (patient.anamnesisReleased) return;
    if (!confirm('Depois de liberada, essa anamnese não poderá mais ser editada por ninguém — nem por administrador. Confirma?')) return;
    setReleasingAnamnesis(true);
    try {
      const releasedAt = new Date().toISOString();
      const historyEntry = { snapshot: anamnesis, releasedAt, releasedBy: user.email || user.uid };
      const updatedFields = {
        anamnesis,
        anamnesisReleased: true,
        anamnesisReleasedAt: releasedAt,
        anamnesisReleasedBy: user.email || user.uid,
        anamnesisHistory: [...(patient.anamnesisHistory || []), historyEntry],
        updatedAt: releasedAt,
      };
      await updateDoc(doc(db, 'patients', patient.id!), updatedFields);
      showToast('Anamnese liberada — trancada no histórico do paciente');
      triggerAutoBackup({ ...patient, ...updatedFields });
      markTodaysAppointmentCompleted();

      // Se algum procedimento marcado na Conduta tem substância vinculada, é sinal de
      // aplicação por pontos (toxina, preenchedor, bioestimulador) — antes de ir pro
      // Orçamento, precisa passar pelo Mapa de Aplicação pra calcular quanto de
      // substância será usado de verdade nesse paciente.
      const plannedNames = anamnesis.plannedProcedures || [];
      const needsFaceMap = plannedNames.some(name => {
        const proc = procedures.find(p => p.name === name);
        if (!proc) return false;
        return substances.some(s => s.procedureIds.includes(proc.id));
      });
      if (needsFaceMap) {
        setActiveTab('facemap');
        showToast('Procedimento marcado usa substância por pontos — calcule a quantidade no Mapa de Aplicação antes do orçamento', 'info');
      }
    } catch (err) {
      showToast('Erro ao liberar', 'error');
    }
    setReleasingAnamnesis(false);
  };

  const [editingEvolutionIndex, setEditingEvolutionIndex] = useState<number | null>(null);

  const handleAddEvolution = async () => {
    try {
      if (editingEvolutionIndex !== null) {
        // Editando um rascunho existente (só é possível se ainda não foi liberado)
        const updated = [...(patient.evolution || [])];
        updated[editingEvolutionIndex] = {
          ...updated[editingEvolutionIndex],
          ...newEvolution,
          numericValue: newEvolution.numericValue ? parseFloat(newEvolution.numericValue) : undefined,
        };
        await updateDoc(doc(db, 'patients', patient.id!), {
          evolution: updated,
          updatedAt: new Date().toISOString()
        });
        showToast('Registro atualizado (ainda editável)');
      } else {
        const entry = { 
          ...newEvolution, 
          numericValue: newEvolution.numericValue ? parseFloat(newEvolution.numericValue) : undefined,
          date: new Date().toISOString(),
          released: false,
        };
        const updated = [entry, ...(patient.evolution || [])];
        await updateDoc(doc(db, 'patients', patient.id!), { 
          evolution: updated,
          updatedAt: new Date().toISOString()
        });
        showToast('Registro salvo (ainda editável)');
      }
      setIsAddingEvolution(false);
      setEditingEvolutionIndex(null);
      setNewEvolution({ procedure: '', notes: '', bucoMaxiloNotes: '', numericValue: '' });
    } catch (err) {
      showToast('Erro ao salvar evolução', 'error');
    }
  };

  const handleReleaseEvolution = async (index: number) => {
    if (!confirm('Depois de liberado, esse registro não poderá mais ser editado por ninguém — nem por administrador. Confirma?')) return;
    try {
      const draft = (patient.evolution || [])[index];
      const releasedAt = new Date().toISOString();
      const historyEntry = { ...draft, releasedAt, releasedBy: user.email || user.uid };
      const remainingDrafts = (patient.evolution || []).filter((_, i) => i !== index);
      const updatedFields = {
        evolution: remainingDrafts,
        evolutionHistory: [...(patient.evolutionHistory || []), historyEntry],
        updatedAt: releasedAt,
      };
      await updateDoc(doc(db, 'patients', patient.id!), updatedFields);
      showToast('Registro liberado — travado no histórico do paciente');
      triggerAutoBackup({ ...patient, ...updatedFields });
      markTodaysAppointmentCompleted();
    } catch (err) {
      showToast('Erro ao liberar', 'error');
    }
  };

  // Improved upload handlers using Firebase Storage
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    showToast('Iniciando upload...', 'info');
    try {
      const urls = await Promise.all(Array.from(files).map(async (file: File) => {
        const compressed = await compressImage(file);
        const path = `patients/${user.uid}/${patient.id}/photos/${Date.now()}_${compressed.name}`;
        const sRef = ref(storage, path);
        await uploadBytes(sRef, compressed);
        return await getDownloadURL(sRef);
      }));
      
      const updated = [...(patient.photoHistory || []), ...urls];
      await updateDoc(doc(db, 'patients', patient.id!), { photoHistory: updated });
      showToast('Fotos enviadas com sucesso');
    } catch (err) {
      showToast('Erro no upload das fotos', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Exclusão completa (direito de eliminação da LGPD) — apaga o prontuário e TUDO que
  // referencia esse paciente: fotos, exames, anexos, backups automáticos na nuvem, e os
  // índices de busca (CPF e telefone). Só administrador consegue fazer isso, e só depois
  // de digitar o nome do paciente pra confirmar — não tem como desfazer.
  const handleDeletePatient = async () => {
    if (deletingPatient) return;
    if (deleteConfirmText.trim().toLowerCase() !== patient.name.trim().toLowerCase()) {
      showToast('O nome digitado não confere', 'error');
      return;
    }
    setDeletingPatient(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);

      // Apaga cada arquivo pelo link que já temos guardado no prontuário — funciona
      // corretamente não importa qual administrador/usuário tenha feito o upload original
      // (a pasta no Storage é nomeada pelo UID de quem enviou, que pode não ser o mesmo
      // "dono" da clínica usado como referência fixa em outros lugares do sistema).
      const knownUrls: string[] = [
        ...(patient.photoHistory || []),
        ...(patient.files || []).map(f => f.url),
        ...(patient.exams || []).filter(e => e.fileUrl).map(e => e.fileUrl!),
        ...(patient.consentTerms || []).map(t => t.signatureUrl).filter(Boolean),
      ];
      await Promise.all(knownUrls.map(url =>
        deleteObject(ref(storage, url)).catch(() => {})
      ));

      // Reforço extra: também limpa a pasta do dono fixo da clínica, caso exista algum
      // arquivo órfão sem link salvo no prontuário (ex: dado legado)
      try {
        const folderRef = ref(storage, `patients/${ownerId}/${patient.id}`);
        const deleteRecursive = async (r: typeof folderRef) => {
          const l = await listAll(r);
          await Promise.all(l.items.map(item => deleteObject(item).catch(() => {})));
          await Promise.all(l.prefixes.map(p => deleteRecursive(p)));
        };
        await deleteRecursive(folderRef);
      } catch { /* melhor esforço */ }

      // Backups automáticos desse paciente na nuvem
      try {
        const backupFolderRef = ref(storage, `backups/${patient.id}`);
        const backupList = await listAll(backupFolderRef);
        await Promise.all(backupList.items.map(item => deleteObject(item).catch(() => {})));
      } catch { /* melhor esforço */ }

      // Índices de busca (telefone e CPF)
      if (patient.phone) {
        await deleteDoc(doc(db, 'patientPhoneIndex', phoneIndexKey(ownerId, patient.phone))).catch(() => {});
      }
      if (patient.cpf) {
        await deleteDoc(doc(db, 'patientCpfIndex', cpfIndexKey(ownerId, patient.cpf))).catch(() => {});
      }

      // O prontuário em si, por último
      await deleteDoc(doc(db, 'patients', patient.id!));

      showToast('Todos os dados do paciente foram excluídos');
      onBack();
    } catch (err) {
      showToast('Erro ao excluir dados', 'error');
      setDeletingPatient(false);
    }
  };

  // Direito de acesso da LGPD — gera e abre um PDF com absolutamente tudo que o sistema
  // guarda desse paciente, pra mostrar ou entregar caso ele peça.
  const handleViewAllData = async () => {
    setViewingData(true);
    try {
      const blob = await generatePatientPdf(patient, null);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      showToast('Erro ao gerar os dados', 'error');
    }
    setViewingData(false);
  };

  const handleDeletePhoto = async (index: number) => {
    if (!window.confirm('Excluir esta foto?')) return;
    const url = patient.photoHistory![index];
    try {
      // Try to delete from storage if it's a firebase URL
      if (url.includes('firebasestorage')) {
        const sRef = ref(storage, url);
        await deleteObject(sRef).catch(() => {}); // Silent fail if object not found
      }
      const updated = patient.photoHistory!.filter((_, i) => i !== index);
      await updateDoc(doc(db, 'patients', patient.id!), { photoHistory: updated });
      showToast('Foto excluída');
    } catch (err) {
      showToast('Erro ao excluir foto', 'error');
    }
  };

  // Comparação de fotos antes/depois lado a lado
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<number[]>([]);
  const toggleCompareSelection = (index: number) => {
    setCompareSelection(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length >= 2) return [prev[1], index];
      return [...prev, index];
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    showToast('Enviando arquivo...', 'info');
    try {
      const newFiles = await Promise.all(Array.from(files).map(async (file: File) => {
        const path = `patients/${user.uid}/${patient.id}/files/${Date.now()}_${file.name}`;
        const sRef = ref(storage, path);
        await uploadBytes(sRef, file);
        const url = await getDownloadURL(sRef);
        return {
          name: file.name,
          type: file.type.includes('pdf') ? 'PDF' : file.type.includes('image') ? 'Imagem' : 'Arquivo',
          date: new Date().toLocaleDateString('pt-BR'),
          url
        };
      }));
      
      const updated = [...(patient.files || []), ...newFiles];
      await updateDoc(doc(db, 'patients', patient.id!), { files: updated });
      showToast('Arquivo anexado');
    } catch (err) {
      showToast('Erro no envio do arquivo', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteFile = async (index: number) => {
    if (!window.confirm('Excluir este anexo?')) return;
    const file = patient.files![index];
    try {
      if (file.url.includes('firebasestorage')) {
        const sRef = ref(storage, file.url);
        await deleteObject(sRef).catch(() => {});
      }
      const updated = patient.files!.filter((_, i) => i !== index);
      await updateDoc(doc(db, 'patients', patient.id!), { files: updated });
      showToast('Anexo removido');
    } catch (err) {
      showToast('Erro ao remover arquivo', 'error');
    }
  };

  const handleImportPdf = async (file: File) => {
    setExtractingText(true);
    try {
      const text = await extractTextFromPdf(file);
      if (!text) {
        showToast('Não consegui ler texto desse PDF (pode ser um PDF de imagem escaneada — tenta importar como foto)', 'error');
      } else {
        setNewExam(prev => ({ ...prev, notes: prev.notes ? `${prev.notes}\n\n${text}` : text }));
        showToast('Texto do PDF importado');
      }
    } catch {
      showToast('Erro ao ler o PDF', 'error');
    }
    setExtractingText(false);
  };

  const handleImportPhoto = async (file: File) => {
    setExtractingText(true);
    setExtractProgress(0);
    try {
      const text = await extractTextFromImage(file, setExtractProgress);
      if (!text) {
        showToast('Não consegui reconhecer texto nessa foto', 'error');
      } else {
        setNewExam(prev => ({ ...prev, notes: prev.notes ? `${prev.notes}\n\n${text}` : text }));
        showToast('Texto da foto importado');
      }
    } catch {
      showToast('Erro ao processar a foto', 'error');
    }
    setExtractingText(false);
  };

  const handleSaveExam = async () => {
    if (!newExam.examType || !newExam.examDate) {
      showToast('Preencha ao menos o tipo e a data do exame', 'error');
      return;
    }
    setSavingExam(true);
    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      if (examFile) {
        const toUpload = await compressImage(examFile);
        const path = `patients/${user.uid}/${patient.id}/exams/${Date.now()}_${toUpload.name}`;
        const sRef = ref(storage, path);
        await uploadBytes(sRef, toUpload);
        fileUrl = await getDownloadURL(sRef);
        fileName = toUpload.name;
      }
      const entry = { ...newExam, fileUrl, fileName };
      const updated = [entry, ...(patient.exams || [])];
      await updateDoc(doc(db, 'patients', patient.id!), { exams: updated });
      showToast('Exame registrado');
      setIsAddingExam(false);
      setNewExam({ examType: '', examDate: '', notes: '' });
      setExamFile(null);
    } catch (err) {
      showToast('Erro ao salvar exame', 'error');
    }
    setSavingExam(false);
  };

  const handleDeleteExam = async (index: number) => {
    if (!window.confirm('Excluir este exame?')) return;
    const exam = patient.exams![index];
    try {
      if (exam.fileUrl?.includes('firebasestorage')) {
        await deleteObject(ref(storage, exam.fileUrl)).catch(() => {});
      }
      const updated = patient.exams!.filter((_, i) => i !== index);
      await updateDoc(doc(db, 'patients', patient.id!), { exams: updated });
      showToast('Exame removido');
    } catch (err) {
      showToast('Erro ao remover exame', 'error');
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#4A433D] transition-all group font-medium">
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span>Voltar para lista</span>
      </button>

      <div className="bg-white rounded-[40px] border border-[#F5F2F0] shadow-sm min-h-[600px] lg:h-[80vh] flex flex-col lg:flex-row lg:overflow-hidden">
        {/* Patient Detail Sidebar */}
        <div className="w-full lg:w-80 bg-[#FDFBF9] border-r border-[#F5F2F0] p-8 flex flex-col rounded-t-[40px] lg:rounded-l-[40px] lg:rounded-tr-none lg:overflow-y-auto">
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-[#EADFD4] mx-auto mb-6 border-4 border-white shadow-md overflow-hidden relative group">
              <UserIcon size={48} />
              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h2 className="text-2xl font-light serif text-[#4A433D] leading-tight">{patient.name}</h2>
            <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-[0.2em] mt-3">{patient.cpf || 'Sem CPF'}</p>
            <input
              value={phoneDraft}
              onChange={e => setPhoneDraft(e.target.value)}
              onBlur={async () => {
                if (phoneDraft !== (patient.phone || '')) {
                  await updateDoc(doc(db, 'patients', patient.id!), { phone: phoneDraft }).catch(() => {});
                  showToast('Telefone atualizado');
                }
              }}
              placeholder="Adicionar telefone"
              className="mt-2 text-center text-xs text-[#4A433D] bg-transparent border-b border-transparent hover:border-[#F5F2F0] focus:border-[#EADFD4] outline-none transition-all px-2 py-1 w-full"
            />
            <div className="flex justify-center gap-2 mt-3">
              {(['F', 'M', 'N'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={async () => {
                    const next = patient.sex === opt ? undefined : opt;
                    await updateDoc(doc(db, 'patients', patient.id!), { sex: next ?? deleteField() }).catch(() => {});
                  }}
                  title={opt === 'F' ? 'Feminino' : opt === 'M' ? 'Masculino' : 'Prefiro não informar'}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                    patient.sex === opt
                      ? 'bg-[#EADFD4] text-white'
                      : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <nav className="space-y-2">
            <TabButton active={activeTab === 'anamnesis'} onClick={() => setActiveTab('anamnesis')} icon={<FileText size={20} />} label="Anamnese" />
            <TabButton active={activeTab === 'facemap'} onClick={() => setActiveTab('facemap')} icon={<MapPin size={20} />} label="Mapa de Aplicação" />
            <TabButton active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={<FileDown size={20} />} label="Orçamento" />
            <TabButton active={activeTab === 'evolution'} onClick={() => setActiveTab('evolution')} icon={<History size={20} />} label="Evolução Clínica" />
            <TabButton active={activeTab === 'exams'} onClick={() => setActiveTab('exams')} icon={<Microscope size={20} />} label="Exames" />
            <TabButton active={activeTab === 'prescriptions'} onClick={() => setActiveTab('prescriptions')} icon={<Pill size={20} />} label="Receituários" />
            <TabButton active={activeTab === 'atestado'} onClick={() => setActiveTab('atestado')} icon={<Stamp size={20} />} label="Atestados & Declarações" />
            <TabButton active={activeTab === 'consent'} onClick={() => setActiveTab('consent')} icon={<CheckCircle2 size={20} />} label="Termos & Assinaturas" />
            <TabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} icon={<Camera size={20} />} label="Galeria de Fotos" />
            <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<Paperclip size={20} />} label="Anexos" />
          </nav>

          <button
            onClick={() => setShowAnatomyModal(true)}
            className="mt-4 w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-[#EADFD4]/15 border border-[#EADFD4]/40 text-[#4A433D] hover:bg-[#EADFD4]/25 transition-all"
          >
            <Bone size={20} className="text-[#EADFD4]" />
            <span className="text-sm font-medium">Anatomia 3D</span>
          </button>

          <div className="mt-auto pt-10 border-t border-[#F5F2F0] space-y-3">
            {isAdminUser && (
              <>
                <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest px-2">LGPD — Direitos do Paciente</p>
                <button
                  onClick={handleViewAllData}
                  disabled={viewingData}
                  className="w-full py-4 px-6 bg-white text-[#9CA3AF] border border-[#F5F2F0] rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#FDFBF9] hover:text-[#4A433D] transition-all shadow-sm disabled:opacity-50"
                >
                  <Download size={18} />
                  {viewingData ? 'Gerando...' : 'Ver Todos os Dados'}
                </button>
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="w-full py-4 px-6 bg-white text-red-300 border border-red-100 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-500 transition-all shadow-sm"
                >
                  <Trash2 size={18} />
                  Excluir Todos os Dados
                </button>
              </>
            )}
          </div>
        </div>

        {confirmingDelete && (
          <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl"
            >
              <h2 className="serif text-2xl text-[#4A433D] mb-2">Excluir todos os dados?</h2>
              <p className="text-sm text-[#9CA3AF] font-light mb-2">
                Isso apaga permanentemente TUDO relacionado a <strong className="text-[#4A433D]">{patient.name}</strong> —
                prontuário, anamnese, evolução, exames, fotos, anexos, e também os backups automáticos guardados na nuvem. Não pode ser desfeito.
              </p>
              <p className="text-xs text-[#9CA3AF] font-light mb-6 italic">
                Agendamentos e lançamentos financeiros já existentes não são apagados, só deixam de estar
                vinculados a um cadastro de paciente.
              </p>
              <p className="text-xs font-semibold text-[#4A433D] mb-3">
                Pra confirmar, digite o nome completo do paciente: <span className="italic">{patient.name}</span>
              </p>
              <input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Digite o nome aqui"
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-red-200 transition-all text-sm mb-6"
              />
              <div className="flex gap-4">
                <button
                  onClick={() => { setConfirmingDelete(false); setDeleteConfirmText(''); }}
                  className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase"
                >
                  Não, cancelar
                </button>
                <button
                  disabled={deletingPatient || deleteConfirmText.trim().toLowerCase() !== patient.name.trim().toLowerCase()}
                  onClick={handleDeletePatient}
                  className="flex-1 py-4 bg-red-400 text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-red-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingPatient ? 'Excluindo...' : 'Sim, excluir tudo'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-10 bg-white overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'facemap' && (
              <motion.div key="facemap" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <FaceMarkingTab patient={patient} user={user} />
              </motion.div>
            )}
            {activeTab === 'budget' && (
              <motion.div key="budget" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <BudgetGenerator patient={patient} user={user} liveAnamnesis={anamnesis} availableProcedures={procedures} />
              </motion.div>
            )}
            {activeTab === 'anamnesis' && (
              <motion.div key="anamnesis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 md:space-y-10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
                  <div>
                    <h3 className="serif text-2xl text-[#4A433D]">Ficha de Anamnese</h3>
                    {patient.anamnesisReleased && (
                      <p className="text-[10px] text-[#B8846E] font-bold uppercase tracking-widest mt-1 flex items-center gap-1.5">
                        <Lock size={11} /> Liberada em {new Date(patient.anamnesisReleasedAt!).toLocaleDateString('pt-BR')} — travada
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {(patient.anamnesisHistory?.length || 0) > 0 && (
                      <button
                        onClick={() => setShowAnamnesisHistory(true)}
                        className="text-[#9CA3AF] hover:text-[#4A433D] flex items-center gap-2 px-6 py-3 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-widest border border-[#F5F2F0]"
                      >
                        <History size={16} /> Histórico ({patient.anamnesisHistory!.length})
                      </button>
                    )}
                    {!patient.anamnesisReleased && (
                    <>
                      <button 
                        onClick={handleSaveAnamnesis} 
                        disabled={savingAnamnesis || releasingAnamnesis}
                        className="bg-[#F0F7F0] text-[#8BA888] flex items-center gap-2 hover:bg-[#E5EFE5] px-6 py-3 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm disabled:opacity-50"
                      >
                        <Save size={16} />
                        {savingAnamnesis ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button 
                        onClick={handleReleaseAnamnesis} 
                        disabled={savingAnamnesis || releasingAnamnesis}
                        className="bg-[#B8846E] text-white flex items-center gap-2 hover:bg-[#A6735E] px-6 py-3 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm disabled:opacity-50"
                      >
                        <Lock size={16} />
                        {releasingAnamnesis ? 'Liberando...' : 'Liberar'}
                      </button>
                    </>
                    )}
                  </div>
                </div>
                
                <div className={`space-y-8 md:space-y-12 ${patient.anamnesisReleased ? 'pointer-events-none opacity-60' : ''}`}>
                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-4 md:mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Queixas e Expectativas
                    </h4>
                    <div className="space-y-6">
                      <FormField label="Queixa Principal" value={anamnesis.mainComplaint} onChange={v => setAnamnesis({...anamnesis, mainComplaint: v})} textarea />
                      <FormField label="Expectativas do Paciente" value={anamnesis.expectations} onChange={v => setAnamnesis({...anamnesis, expectations: v})} textarea />
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-4 md:mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Histórico Clínico
                    </h4>
                    <div className="bg-[#FDFBF9] p-5 md:p-8 rounded-[32px] border border-[#F5F2F0] mb-5 md:mb-8">
                      <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-4 md:mb-6">Condições Médicas</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <ConditionToggle label="Diabetes" active={anamnesis.conditions.diabetes} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, diabetes: !anamnesis.conditions.diabetes}})} />
                        <ConditionToggle label="Hipertensão" active={anamnesis.conditions.hypertension} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, hypertension: !anamnesis.conditions.hypertension}})} />
                        <ConditionToggle label="Prob. Cardíacos" active={anamnesis.conditions.heartProblems} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, heartProblems: !anamnesis.conditions.heartProblems}})} />
                        <ConditionToggle label="Doença Autoimune" active={anamnesis.conditions.autoimmune} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, autoimmune: !anamnesis.conditions.autoimmune}})} />
                        <ConditionToggle label="Hist. Câncer" active={anamnesis.conditions.cancerHistory} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, cancerHistory: !anamnesis.conditions.cancerHistory}})} />
                        <ConditionToggle label="Queloide" active={anamnesis.conditions.keloid} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, keloid: !anamnesis.conditions.keloid}})} />
                        <ConditionToggle label="Herpes" active={anamnesis.conditions.herpes} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, herpes: !anamnesis.conditions.herpes}})} />
                        <ConditionToggle label="Epilepsia" active={anamnesis.conditions.epilepsy} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, epilepsy: !anamnesis.conditions.epilepsy}})} />
                        <ConditionToggle label="HIV/Hepatite" active={anamnesis.conditions.hivHepatitis} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, hivHepatitis: !anamnesis.conditions.hivHepatitis}})} />
                        <ConditionToggle label="Marca-passo" active={anamnesis.conditions.pacemaker} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, pacemaker: !anamnesis.conditions.pacemaker}})} />
                        <ConditionToggle label="Gestante" active={anamnesis.conditions.pregnant} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, pregnant: !anamnesis.conditions.pregnant}})} />
                        <ConditionToggle label="Amamentando" active={anamnesis.conditions.breastfeeding} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, breastfeeding: !anamnesis.conditions.breastfeeding}})} />
                        <ConditionToggle label="Anticoagulante" active={anamnesis.conditions.anticoagulant} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, anticoagulant: !anamnesis.conditions.anticoagulant}})} />
                        <ConditionToggle label="Roacutan" active={anamnesis.conditions.isotretinoin} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, isotretinoin: !anamnesis.conditions.isotretinoin}})} />
                        <ConditionToggle label="Anticoncepcional" active={anamnesis.conditions.contraceptive} onClick={() => setAnamnesis({...anamnesis, conditions: {...anamnesis.conditions, contraceptive: !anamnesis.conditions.contraceptive}})} />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-5 md:mb-8">
                      <div className="space-y-4">
                        <ConditionToggle label="Possui alergias?" active={anamnesis.hasAllergies} onClick={() => setAnamnesis({...anamnesis, hasAllergies: !anamnesis.hasAllergies})} />
                        {anamnesis.hasAllergies && (
                          <FormField label="Quais alergias?" value={anamnesis.allergiesDetails} onChange={v => setAnamnesis({...anamnesis, allergiesDetails: v})} />
                        )}
                      </div>
                      <div className="space-y-4">
                        <ConditionToggle label="Faz uso de medicação contínua?" active={anamnesis.hasContinuousMedication} onClick={() => setAnamnesis({...anamnesis, hasContinuousMedication: !anamnesis.hasContinuousMedication})} />
                        {anamnesis.hasContinuousMedication && (
                          <FormField label="Quais medicações?" value={anamnesis.medicationsDetails} onChange={v => setAnamnesis({...anamnesis, medicationsDetails: v})} />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                      <FormField label="Outras Condições" value={anamnesis.otherConditions} onChange={v => setAnamnesis({...anamnesis, otherConditions: v})} textarea />
                      <FormField label="Histórico Familiar" value={anamnesis.familyHistory} onChange={v => setAnamnesis({...anamnesis, familyHistory: v})} textarea />
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-4 md:mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Estilo de Vida
                    </h4>
                    <div className="flex flex-wrap gap-4 p-5 md:p-8 bg-[#FDFBF9] rounded-3xl border border-[#F5F2F0] mb-4 md:mb-6 shadow-sm">
                      <HabitToggle label="Fumante" active={anamnesis.habits.smoking} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, smoking: !anamnesis.habits.smoking}})} />
                      <HabitToggle label="Álcool" active={anamnesis.habits.alcohol} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, alcohol: !anamnesis.habits.alcohol}})} />
                      <HabitToggle label="Exercícios" active={anamnesis.habits.exercise} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, exercise: !anamnesis.habits.exercise}})} />
                      <HabitToggle label="Exp. Solar" active={anamnesis.habits.sunExposure} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, sunExposure: !anamnesis.habits.sunExposure}})} />
                      <HabitToggle label="Protetor Diário" active={anamnesis.habits.sunscreen} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, sunscreen: !anamnesis.habits.sunscreen}})} />
                    </div>
                    <FormField label="Dieta e Suplementação" value={anamnesis.habits.diet} onChange={v => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, diet: v}})} textarea />
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-4 md:mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Avaliação Física
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                      <FormField label="Avaliação da Pele" value={anamnesis.skinEvaluation} onChange={v => setAnamnesis({...anamnesis, skinEvaluation: v})} textarea />
                      <FormField label="Avaliação Facial" value={anamnesis.faceEvaluation} onChange={v => setAnamnesis({...anamnesis, faceEvaluation: v})} textarea />
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-4 md:mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Conduta
                    </h4>
                    <div className="p-5 md:p-8 bg-[#FDFBF9] rounded-[32px] border border-[#F5F2F0] space-y-6">
                      <FormField label="Conduta / Plano de Tratamento" value={anamnesis.conduct || ''} onChange={v => setAnamnesis({...anamnesis, conduct: v})} textarea />
                      {procedures.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3 ml-1">Procedimentos planejados</p>
                          <div className="flex flex-wrap gap-2">
                            {procedures.map(proc => {
                              const active = (anamnesis.plannedProcedures || []).includes(proc.name);
                              const launched = (anamnesis.launchedProcedures || []).includes(proc.name);
                              return (
                                <div key={proc.id} className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      const current = anamnesis.plannedProcedures || [];
                                      if (active) {
                                        // Desmarcando — também limpa a escolha de substância guardada pra esse procedimento
                                        const nextSubs = { ...(anamnesis.plannedSubstances || {}) };
                                        delete nextSubs[proc.name];
                                        setAnamnesis({ ...anamnesis, plannedProcedures: current.filter(n => n !== proc.name), plannedSubstances: nextSubs });
                                        return;
                                      }
                                      // Marcando — se esse procedimento tiver mais de uma substância vinculada,
                                      // pergunta qual foi usada nesse paciente antes de marcar
                                      const linkedSubstances = substances.filter(s => s.procedureIds.includes(proc.id));
                                      if (linkedSubstances.length > 1) {
                                        const options = linkedSubstances.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
                                        const choice = window.prompt(`Qual substância foi usada em "${proc.name}"?\n${options}\n\nDigite o número:`);
                                        const idx = parseInt(choice || '', 10) - 1;
                                        if (idx < 0 || idx >= linkedSubstances.length || isNaN(idx)) return; // cancelou ou digitou errado — não marca
                                        setAnamnesis({
                                          ...anamnesis,
                                          plannedProcedures: [...current, proc.name],
                                          plannedSubstances: { ...(anamnesis.plannedSubstances || {}), [proc.name]: linkedSubstances[idx].name },
                                        });
                                        return;
                                      }
                                      if (linkedSubstances.length === 1) {
                                        setAnamnesis({
                                          ...anamnesis,
                                          plannedProcedures: [...current, proc.name],
                                          plannedSubstances: { ...(anamnesis.plannedSubstances || {}), [proc.name]: linkedSubstances[0].name },
                                        });
                                        return;
                                      }
                                      setAnamnesis({ ...anamnesis, plannedProcedures: [...current, proc.name] });
                                    }}
                                    className={`text-xs px-4 py-2 rounded-xl border transition-all ${active ? 'bg-[#8BA888] border-[#8BA888] text-white' : 'bg-white border-[#F5F2F0] text-[#9CA3AF] hover:border-[#8BA888]/30'}`}
                                  >
                                    {proc.name}
                                    {active && anamnesis.plannedSubstances?.[proc.name] && (
                                      <span className="opacity-80"> — {anamnesis.plannedSubstances[proc.name]}</span>
                                    )}
                                  </button>
                                  {active && (
                                    launched ? (
                                      <span className="text-[10px] font-bold text-[#8BA888] uppercase tracking-widest px-2 flex items-center gap-1">
                                        <CheckCircle2 size={12} /> Lançado
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleLaunchToFinance(proc.name)}
                                        title={`Lançar R$ ${proc.price.toFixed(2).replace('.', ',')} no financeiro`}
                                        className="text-[10px] font-bold text-[#B8846E] uppercase tracking-widest px-3 py-2 rounded-xl border border-[#B8846E]/30 hover:bg-[#B8846E]/10 transition-all whitespace-nowrap"
                                      >
                                        Lançar no Financeiro
                                      </button>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {procedures.length === 0 && (
                        <p className="text-xs text-[#9CA3AF] italic">
                          Nenhum procedimento cadastrado ainda — cadastre em Configurações → Procedimentos pra poder marcar aqui.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'evolution' && (
              <motion.div key="evolution" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#4A433D]">Evolução de Tratamentos</h3>
                  <button 
                    onClick={() => setIsAddingEvolution(true)}
                    className="bg-[#EADFD4] text-white px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-md hover:bg-[#DFCFBF] transition-all"
                  >
                    <Plus size={18} /> Novo Registro
                  </button>
                </div>

                {/* Progress Chart */}
                {patient.evolution && patient.evolution.some(e => e.numericValue !== undefined) && (
                  <div className="bg-[#FDFBF9] p-8 rounded-[40px] border border-[#F5F2F0] shadow-sm">
                    <div className="mb-6">
                      <h4 className="serif text-xl text-[#4A433D]">Gráfico de Evolução</h4>
                      <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">Acompanhamento de Medidas / Peso / Progresso</p>
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                          data={[...(patient.evolution || [])]
                            .filter(e => e.numericValue !== undefined)
                            .reverse()
                            .map(e => ({
                              date: new Date(e.date).toLocaleDateString('pt-BR'),
                              value: e.numericValue
                            }))
                          }
                        >
                          <defs>
                            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#EADFD4" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#EADFD4" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F5F2F0" />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#9CA3AF', fontSize: 10 }} 
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#9CA3AF', fontSize: 10 }}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#EADFD4" 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorVal)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {isAddingEvolution && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="p-8 bg-[#FDFBF9] rounded-[32px] border border-[#F5F2F0] space-y-6 shadow-sm">
                    <h4 className="serif text-xl text-[#4A433D]">{editingEvolutionIndex !== null ? 'Editar Registro' : 'Novo Acompanhamento'}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Procedimento / Técnica" value={newEvolution.procedure} onChange={v => setNewEvolution({...newEvolution, procedure: v})} />
                      <FormField label="Medida / Valor (Opcional)" value={newEvolution.numericValue} onChange={v => setNewEvolution({...newEvolution, numericValue: v})} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Notas Gerais" value={newEvolution.notes} onChange={v => setNewEvolution({...newEvolution, notes: v})} textarea />
                      <FormField label="Foco Clínico Específico" value={newEvolution.bucoMaxiloNotes} onChange={v => setNewEvolution({...newEvolution, bucoMaxiloNotes: v})} textarea />
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button onClick={() => { setIsAddingEvolution(false); setEditingEvolutionIndex(null); setNewEvolution({ procedure: '', notes: '', bucoMaxiloNotes: '', numericValue: '' }); }} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
                      <button onClick={handleAddEvolution} className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all">Salvar Rascunho</button>
                    </div>
                  </motion.div>
                )}

                <div className="space-y-6">
                  {[
                    ...(patient.evolution || []).map((e, idx) => ({ ...e, _released: false as const, _draftIndex: idx })),
                    ...(patient.evolutionHistory || []).map(e => ({ ...e, _released: true as const, _draftIndex: -1 })),
                  ]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((entry, i) => (
                    <motion.div 
                      key={`${entry._released ? 'h' : 'd'}-${i}`}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-8 bg-white border border-[#F5F2F0] rounded-3xl shadow-sm hover:border-[#EADFD4]/30 transition-all relative overflow-hidden group"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#EADFD4]/20 group-hover:bg-[#EADFD4] transition-all" />
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <span className="bg-[#FDFBF9] px-4 py-1.5 rounded-xl text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest border border-[#F5F2F0]">
                            {new Date(entry.date).toLocaleDateString('pt-BR')}
                          </span>
                          {entry.numericValue !== undefined && (
                            <span className="bg-[#EADFD4] text-white px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm">
                              {entry.numericValue}
                            </span>
                          )}
                          {entry._released ? (
                            <span className="flex items-center gap-1 bg-[#FDFBF9] px-3 py-1.5 rounded-xl text-[10px] font-bold text-[#B8846E] uppercase tracking-widest border border-[#F5F2F0]">
                              <Lock size={10} /> Liberado
                            </span>
                          ) : (
                            <span className="bg-[#F0F7F0] px-3 py-1.5 rounded-xl text-[10px] font-bold text-[#8BA888] uppercase tracking-widest">
                              Rascunho
                            </span>
                          )}
                        </div>
                        <span className="text-lg font-normal text-[#4A433D] serif">{entry.procedure}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">Observações Clínicas</p>
                          <p className="text-sm font-light text-[#4A433D] leading-relaxed italic">"{entry.notes}"</p>
                        </div>
                        {entry.bucoMaxiloNotes && (
                          <div className="bg-[#FDFBF9] p-6 rounded-2xl border border-[#F5F2F0] shadow-inner">
                            <p className="text-[9px] font-bold text-[#EADFD4] uppercase tracking-widest mb-3">Detalhes Técnicos</p>
                            <p className="text-sm font-light text-[#4A433D] leading-relaxed">{entry.bucoMaxiloNotes}</p>
                          </div>
                        )}
                      </div>
                      {!entry._released && entry._draftIndex !== -1 && (
                        <div className="flex gap-3 mt-6 pt-6 border-t border-[#F5F2F0]">
                          <button
                            onClick={() => {
                              setEditingEvolutionIndex(entry._draftIndex);
                              setNewEvolution({
                                procedure: entry.procedure,
                                notes: entry.notes,
                                bucoMaxiloNotes: entry.bucoMaxiloNotes || '',
                                numericValue: entry.numericValue !== undefined ? String(entry.numericValue) : '',
                              });
                              setIsAddingEvolution(true);
                            }}
                            className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#4A433D] text-[10px] font-bold uppercase tracking-widest transition-all"
                          >
                            <Edit2 size={13} /> Editar
                          </button>
                          <button
                            onClick={() => handleReleaseEvolution(entry._draftIndex)}
                            className="flex items-center gap-2 text-[#B8846E] hover:text-[#A6735E] text-[10px] font-bold uppercase tracking-widest transition-all"
                          >
                            <Lock size={13} /> Liberar
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {(!patient.evolution || patient.evolution.length === 0) && (!patient.evolutionHistory || patient.evolutionHistory.length === 0) && (
                    <div className="p-20 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-3xl bg-[#FDFBF9]/30">
                      Nenhum registro de evolução encontrado para este paciente.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'atestado' && (
              <motion.div key="atestado" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <AtestadoModule user={user} patient={patient} />
              </motion.div>
            )}

            {activeTab === 'consent' && (
              <motion.div key="consent" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ConsentTermsModule user={user} patient={patient} />
              </motion.div>
            )}

            {activeTab === 'prescriptions' && (
              <motion.div key="prescriptions" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <PrescriptionModule user={user} patient={patient} />
              </motion.div>
            )}

            {activeTab === 'photos' && (
              <motion.div key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#4A433D]">Galeria Clínica</h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
                      className={`px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border transition-all shadow-sm ${
                        compareMode ? 'bg-[#4A433D] text-white border-[#4A433D]' : 'bg-white text-[#9CA3AF] border-[#F5F2F0] hover:border-[#EADFD4]'
                      }`}
                    >
                      {compareMode ? 'Sair da Comparação' : 'Comparar Antes/Depois'}
                    </button>
                    <label className="bg-[#FDFBF9] text-[#9CA3AF] px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer border border-[#F5F2F0] hover:bg-[#EADFD4] hover:text-white hover:border-[#EADFD4] transition-all shadow-sm">
                      <Camera size={18} /> Enviar Imagens
                      <input type="file" accept="image/*" className="hidden" multiple onChange={handlePhotoUpload} />
                    </label>
                  </div>
                </div>
                {compareMode && (
                  <p className="text-xs text-[#9CA3AF] font-light italic -mt-4">
                    Selecione duas fotos para comparar lado a lado ({compareSelection.length}/2 selecionadas)
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                  {patient.photoHistory?.map((url, i) => (
                    <div 
                      key={i} 
                      className="group relative aspect-square"
                      onClick={compareMode ? () => toggleCompareSelection(i) : undefined}
                    >
                      <img 
                        src={url} 
                        alt="Paciente" 
                        className={`w-full h-full object-cover rounded-[32px] border shadow-md group-hover:scale-[1.02] transition-all duration-300 ${
                          compareMode && compareSelection.includes(i) ? 'border-4 border-[#EADFD4]' : 'border-[#F5F2F0]'
                        } ${compareMode ? 'cursor-pointer' : ''}`}
                      />
                      {compareMode && compareSelection.includes(i) && (
                        <div className="absolute top-3 left-3 w-8 h-8 bg-[#EADFD4] rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">
                          {compareSelection.indexOf(i) + 1}
                        </div>
                      )}
                      {!compareMode && (
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all rounded-[32px] flex items-center justify-center backdrop-blur-[2px]">
                          <button onClick={() => handleDeletePhoto(i)} className="p-4 bg-white/90 rounded-2xl text-red-400 shadow-xl hover:scale-110 active:scale-95 transition-all">
                            <Trash2 size={24} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {(!patient.photoHistory || patient.photoHistory.length === 0) && (
                    <div className="col-span-full p-20 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-[#FDFBF9]/30">
                      Nenhuma imagem clínica registrada.
                    </div>
                  )}
                </div>

                {compareMode && compareSelection.length === 2 && (
                  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setCompareSelection([])}>
                    <div className="bg-white rounded-[32px] p-8 max-w-4xl w-full" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="serif text-xl text-[#4A433D]">Comparação Antes / Depois</h4>
                        <button onClick={() => setCompareSelection([])} className="p-2 text-[#9CA3AF] hover:text-[#4A433D]">
                          <X size={24} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        {compareSelection.map((idx, pos) => (
                          <div key={idx}>
                            <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3 text-center">{pos === 0 ? 'Antes' : 'Depois'}</p>
                            <img src={patient.photoHistory![idx]} alt={pos === 0 ? 'Antes' : 'Depois'} className="w-full aspect-square object-cover rounded-[24px] border border-[#F5F2F0] shadow-md" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'exams' && (
              <motion.div key="exams" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#4A433D]">Exames</h3>
                  {!isAddingExam && (
                    <button
                      onClick={() => setIsAddingExam(true)}
                      className="bg-[#F0F7F0] text-[#8BA888] px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:bg-[#E5EFE5] transition-all"
                    >
                      <Microscope size={18} /> Novo Exame
                    </button>
                  )}
                </div>

                {isAddingExam && (
                  <div className="p-8 bg-[#FDFBF9] border border-[#F5F2F0] rounded-[32px] space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Tipo de Exame" value={newExam.examType} onChange={v => setNewExam({ ...newExam, examType: v })} />
                      <div>
                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Data do Exame</label>
                        <input
                          type="date"
                          value={newExam.examDate}
                          onChange={e => setNewExam({ ...newExam, examDate: e.target.value })}
                          className="w-full bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                        />
                      </div>
                    </div>
                    <FormField label="Observações / Resultado" value={newExam.notes} onChange={v => setNewExam({ ...newExam, notes: v })} textarea />

                    <div>
                      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">
                        Importar texto automaticamente (opcional)
                      </label>
                      <div className="flex gap-3">
                        <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl text-[10px] font-bold uppercase tracking-widest text-[#4A433D] cursor-pointer hover:border-[#EADFD4] transition-all">
                          <FileText size={14} /> Importar PDF
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportPdf(f); e.target.value = ''; }}
                          />
                        </label>
                        <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl text-[10px] font-bold uppercase tracking-widest text-[#4A433D] cursor-pointer hover:border-[#EADFD4] transition-all">
                          <Camera size={14} /> Importar Foto
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportPhoto(f); e.target.value = ''; }}
                          />
                        </label>
                      </div>
                      {extractingText && (
                        <p className="text-[10px] text-[#B8846E] font-bold uppercase tracking-widest mt-2">
                          Lendo o texto... {extractProgress > 0 ? `${extractProgress}%` : ''}
                        </p>
                      )}
                      <p className="text-[10px] text-[#9CA3AF] font-light mt-2">
                        O texto reconhecido é adicionado ao campo "Observações / Resultado" acima — confira e ajuste antes de salvar.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Arquivo do Exame (opcional)</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={e => setExamFile(e.target.files?.[0] || null)}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex gap-4 pt-2">
                      <button
                        onClick={() => { setIsAddingExam(false); setNewExam({ examType: '', examDate: '', notes: '' }); setExamFile(null); }}
                        className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveExam}
                        disabled={savingExam}
                        className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all disabled:opacity-50"
                      >
                        {savingExam ? 'Salvando...' : 'Salvar Exame'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {patient.exams?.map((exam, i) => (
                    <div key={i} className="p-8 bg-white border border-[#F5F2F0] rounded-[32px] hover:border-[#EADFD4]/30 hover:shadow-lg transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-sm font-semibold text-[#4A433D]">{exam.examType}</p>
                          <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mt-1">
                            {new Date(exam.examDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <button onClick={() => handleDeleteExam(i)} className="p-2 text-[#9CA3AF] hover:text-red-400 transition-all">
                          <Trash2 size={18} />
                        </button>
                      </div>
                      {exam.notes && <p className="text-xs text-[#4A433D]/70 font-light leading-relaxed mb-4">{exam.notes}</p>}
                      {exam.fileUrl && (
                        <a
                          href={exam.fileUrl}
                          download={exam.fileName}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-[10px] font-bold text-[#B8846E] uppercase tracking-widest hover:text-[#A6735E] transition-all"
                        >
                          <Download size={14} /> {exam.fileName}
                        </a>
                      )}
                    </div>
                  ))}
                  {(!patient.exams || patient.exams.length === 0) && !isAddingExam && (
                    <div className="col-span-full p-20 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-[#FDFBF9]/30">
                      Nenhum exame registrado ainda.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'files' && (
              <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#4A433D]">Anexos</h3>
                  <label className="bg-[#F0F7F0] text-[#8BA888] px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm cursor-pointer hover:bg-[#E5EFE5] transition-all">
                    <Paperclip size={18} /> Anexar Arquivo
                    <input type="file" className="hidden" multiple onChange={handleFileUpload} />
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {patient.files?.map((file, i) => (
                    <div key={i} className="p-8 bg-white border border-[#F5F2F0] rounded-[32px] flex items-center gap-6 hover:border-[#EADFD4]/30 hover:shadow-lg transition-all group">
                      <div className="w-14 h-14 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4] group-hover:bg-[#EADFD4] group-hover:text-white transition-all shadow-inner">
                        <FileDown size={28} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#4A433D] truncate">{file.name}</p>
                        <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mt-1">{file.type} • {file.date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="p-3 text-[#9CA3AF] hover:text-[#4A433D] hover:bg-[#FDFBF9] rounded-xl transition-all">
                          <Download size={20} />
                        </a>
                        <button onClick={() => handleDeleteFile(i)} className="p-3 text-[#9CA3AF] hover:text-red-400 hover:bg-[#FDFBF9] rounded-xl transition-all">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!patient.files || patient.files.length === 0) && (
                    <div className="col-span-full p-20 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-[#FDFBF9]/30">
                      Nenhum anexo ou laudo encontrado.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {showAnatomyModal && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-[#FDFBF9] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[#EADFD4] border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <AnatomyViewer onClose={() => setShowAnatomyModal(false)} />
        </Suspense>
      )}

      {showAnamnesisHistory && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white w-full max-w-2xl max-h-[85vh] rounded-[40px] p-10 shadow-2xl overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="serif text-2xl text-[#4A433D]">Histórico de Anamneses Liberadas</h3>
              <button onClick={() => setShowAnamnesisHistory(false)} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              {[...(patient.anamnesisHistory || [])].reverse().map((entry, i) => (
                <details key={i} className="bg-[#FDFBF9] rounded-3xl border border-[#F5F2F0] overflow-hidden">
                  <summary className="p-6 cursor-pointer flex items-center justify-between text-sm font-semibold text-[#4A433D]">
                    <span className="flex items-center gap-2">
                      <Lock size={13} className="text-[#B8846E]" />
                      {new Date(entry.releasedAt).toLocaleString('pt-BR')}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF] font-normal uppercase tracking-widest">{entry.releasedBy}</span>
                  </summary>
                  <div className="p-6 pt-0 space-y-3 text-xs text-[#4A433D] font-light">
                    <p><strong>Queixa Principal:</strong> {entry.snapshot?.mainComplaint || '—'}</p>
                    <p><strong>Expectativas:</strong> {entry.snapshot?.expectations || '—'}</p>
                    <p><strong>Avaliação da Pele:</strong> {entry.snapshot?.skinEvaluation || '—'}</p>
                    <p><strong>Avaliação Facial:</strong> {entry.snapshot?.faceEvaluation || '—'}</p>
                  </div>
                </details>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {showLastVisitModal && lastEvolution && (
        <div className="fixed inset-0 bg-[#4A433D]/40 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl"
          >
            <div className="w-14 h-14 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4] mb-6">
              <History size={24} />
            </div>
            <h3 className="serif text-2xl text-[#4A433D] mb-1">Resumo da Última Consulta</h3>
            <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mb-8">
              {patient.name} — {new Date(lastEvolution.date).toLocaleDateString('pt-BR')}
            </p>
            <div className="space-y-5 mb-8">
              <div>
                <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2">Procedimento</p>
                <p className="text-sm text-[#4A433D]">{lastEvolution.procedure || '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2">Observações</p>
                <p className="text-sm text-[#4A433D] font-light italic leading-relaxed">"{lastEvolution.notes || '—'}"</p>
              </div>
              {lastEvolution.bucoMaxiloNotes && (
                <div className="bg-[#FDFBF9] p-5 rounded-2xl border border-[#F5F2F0]">
                  <p className="text-[9px] font-bold text-[#EADFD4] uppercase tracking-widest mb-2">Detalhes Técnicos</p>
                  <p className="text-sm text-[#4A433D] font-light">{lastEvolution.bucoMaxiloNotes}</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowLastVisitModal(false)}
              className="w-full py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#DFCFBF] transition-all"
            >
              Entendi, continuar
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

type AtestadoDocType = 'atestado' | 'atestado_cid' | 'atestado_menor' | 'declaracao_comparecimento' | 'declaracao_acompanhamento' | 'livre';

const ATESTADO_DOC_LABELS: Record<AtestadoDocType, string> = {
  atestado: 'Atestado (sem CID)',
  atestado_cid: 'Atestado (com CID)',
  atestado_menor: 'Atestado — Paciente Menor',
  declaracao_comparecimento: 'Declaração de Comparecimento',
  declaracao_acompanhamento: 'Declaração de Acompanhamento',
  livre: 'Texto Livre (personalizado)',
};

function AtestadoModule({ user, patient }: { user: User, patient: Patient }) {
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [docType, setDocType] = useState<AtestadoDocType>('atestado');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const currentTimeStr = new Date().toTimeString().slice(0, 5); // "HH:MM"
  const [timeFrom, setTimeFrom] = useState(currentTimeStr);
  const [timeTo, setTimeTo] = useState('');
  const [restAmount, setRestAmount] = useState('');
  const [restUnit, setRestUnit] = useState<'horas' | 'dias'>('horas');
  const [cid, setCid] = useState('');
  const [rg, setRg] = useState('');
  // Usados nos modelos de menor/acompanhante
  const [guardianName, setGuardianName] = useState('');
  const [guardianDoc, setGuardianDoc] = useState('');
  const [companionName, setCompanionName] = useState('');
  const [companionDoc, setCompanionDoc] = useState('');
  const [freeText, setFreeText] = useState('');

  useEffect(() => {
    (async () => {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const snap = await getDoc(doc(db, 'settings', ownerId));
      if (snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
    })();
  }, [user.uid]);

  const patientDocLabel = patient.cpf ? `CPF nº ${patient.cpf}` : rg ? `RG nº ${rg}` : '________________';
  const dateLabel = attendanceDate ? new Date(attendanceDate + 'T00:00:00').toLocaleDateString('pt-BR') : '____/____/____';
  const timeRangeLabel = timeFrom && timeTo ? `das ${timeFrom} às ${timeTo} horas` : timeFrom ? `a partir das ${timeFrom}` : '____:____ às ____:____';
  const restLabel = `${restAmount || '____'} (${restUnit})`;

  const bodyText = (() => {
    switch (docType) {
      case 'atestado':
        return `Atesto, para os devidos fins e a pedido do(a) interessado(a), que o(a) paciente ${patient.name}, ${patientDocLabel}, esteve sob meus cuidados profissionais em ${dateLabel}, no horário ${timeRangeLabel}, necessitando de ${restLabel} de afastamento de suas atividades a partir desta data.`;
      case 'atestado_cid':
        return `Atesto, para os devidos fins e a pedido do(a) interessado(a), inclusive com menção de Código CID por este(a) solicitado, que o(a) paciente ${patient.name}, ${patientDocLabel}, esteve sob os meus cuidados profissionais em virtude de CID nº ${cid || '________'}, tendo sido submetido(a) a tratamento odontológico em ${dateLabel}, no período ${timeRangeLabel}, sendo-lhe recomendado repouso por ${restLabel}, além da necessidade de seguir as orientações e tomar os medicamentos que lhe foram prescritos.`;
      case 'atestado_menor':
        return `Atesto, para os devidos fins e a pedido do(a) Responsável Legal ${guardianName || '_______________________'}, ${guardianDoc || '________________'}, que o(a) menor ${patient.name}, ${patientDocLabel}, esteve sob os meus cuidados profissionais em ${dateLabel}, no período ${timeRangeLabel}, sendo-lhe recomendado repouso por ${restLabel}, além da necessidade de seguir as orientações e retornar conforme agendado.`;
      case 'declaracao_comparecimento':
        return `Declaro, para os devidos fins e a pedido do(a) interessado(a), que o(a) Sr(a). ${companionName || '_______________________'}, ${companionDoc || '________________'}, compareceu no consultório odontológico ${clinicSettings?.clinicName || clinicSettings?.professionalName || ''}, acompanhando o(a) paciente ${patient.name}, ${patientDocLabel}, o(a) qual esteve sob os meus cuidados profissionais para tratamento odontológico em ${dateLabel}, no período ${timeRangeLabel}.`;
      case 'declaracao_acompanhamento':
        return `Declaro, para os devidos fins e a pedido do(a) interessado(a), que o(a) Sr(a). ${guardianName || '_______________________'}, ${guardianDoc || '________________'}, Responsável Legal pelo(a) menor ${patient.name}, ${patientDocLabel}, acompanhou o(a) filho(a) durante tratamento odontológico por mim realizado em ${dateLabel}, no período ${timeRangeLabel}.`;
      case 'livre':
        return freeText;
    }
  })();

  const showRestFields = docType === 'atestado' || docType === 'atestado_cid' || docType === 'atestado_menor';
  const showCidField = docType === 'atestado_cid';
  const showGuardianFields = docType === 'atestado_menor' || docType === 'declaracao_acompanhamento';
  const showCompanionFields = docType === 'declaracao_comparecimento';
  const showFreeText = docType === 'livre';
  const documentTitle = docType === 'livre'
    ? 'Documento'
    : docType.startsWith('declaracao') ? (docType === 'declaracao_comparecimento' ? 'Declaração de Comparecimento' : 'Declaração de Acompanhamento') : 'Atestado Odontológico';

  const handlePrint = () => {
    const clinicName = clinicSettings?.clinicName || clinicSettings?.professionalName || 'Clínica';
    const professionalName = clinicSettings?.professionalName || '';
    const now = new Date();
    const todayLabel = now.toLocaleDateString('pt-BR');
    const nowTimeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const bodyHtml = `
      <div class="box">
        <div class="box-label">Paciente</div>
        <p>${patient.name}</p>
      </div>
      <div class="box">
        <p>${bodyText}</p>
      </div>
      <div class="box" style="text-align: center;">
        <p style="margin: 40px 0 6px;">
          <span style="display: inline-block; border-top: 1px solid #4A433D; padding-top: 8px; min-width: 280px;">
            ${professionalName ? `${professionalName}<br/>` : ''}Cirurgião(ã)-Dentista
          </span>
        </p>
      </div>
    `;
    const footerHtml = `
      <div class="footer-row">
        <span>${todayLabel} às ${nowTimeLabel}</span>
        <img class="footer-mark" src="/logo/logo-mark-v2.png" alt="" />
      </div>
    `;
    const html = buildLetterheadHtml({ title: documentTitle, clinicName, bodyHtml, footerHtml, documentLabel: `${documentTitle} — ${patient.name}` });
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
        <h3 className="serif text-2xl text-[#4A433D]">Atestados & Declarações</h3>
        <button
          onClick={handlePrint}
          className="bg-[#EADFD4] text-white px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-md hover:bg-[#DFCFBF] transition-all flex items-center gap-2"
        >
          <Printer size={16} /> Imprimir
        </button>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Tipo de Documento</label>
        <select
          value={docType}
          onChange={e => setDocType(e.target.value as AtestadoDocType)}
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm font-medium"
        >
          {Object.entries(ATESTADO_DOC_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="p-6 bg-[#FDFBF9] rounded-2xl border border-[#F5F2F0] text-xs text-[#9CA3AF] space-y-1">
        <p><strong className="text-[#4A433D]">Paciente:</strong> {patient.name}</p>
        <p><strong className="text-[#4A433D]">CPF:</strong> {patient.cpf || 'não cadastrado — preencha o RG abaixo'}</p>
      </div>

      {!showFreeText && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {!patient.cpf && <FormField label="RG do Paciente" value={rg} onChange={setRg} />}

          {showGuardianFields && (
            <>
              <FormField label="Nome do Responsável Legal" value={guardianName} onChange={setGuardianName} />
              <FormField label="RG/CPF do Responsável Legal" value={guardianDoc} onChange={setGuardianDoc} />
            </>
          )}
          {showCompanionFields && (
            <>
              <FormField label="Nome do Acompanhante" value={companionName} onChange={setCompanionName} />
              <FormField label="RG/CPF do Acompanhante" value={companionDoc} onChange={setCompanionDoc} />
            </>
          )}

          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Data do Atendimento</label>
            <input
              type="date"
              value={attendanceDate}
              onChange={e => setAttendanceDate(e.target.value)}
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Horário Início</label>
              <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Horário Fim</label>
              <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm" />
            </div>
          </div>

          {showRestFields && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Tempo de Afastamento" value={restAmount} onChange={setRestAmount} />
              <div>
                <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Unidade</label>
                <select
                  value={restUnit}
                  onChange={e => setRestUnit(e.target.value as 'horas' | 'dias')}
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                >
                  <option value="horas">Horas</option>
                  <option value="dias">Dias</option>
                </select>
              </div>
            </div>
          )}
          {showCidField && <FormField label="Código CID" value={cid} onChange={setCid} />}
        </div>
      )}

      {showFreeText && (
        <div>
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Texto do Documento</label>
          <textarea
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            rows={12}
            placeholder={`Escreva aqui o texto completo do documento pra ${patient.name}...`}
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-[28px] p-6 text-sm text-[#4A433D] leading-relaxed outline-none focus:border-[#EADFD4]/50 transition-all font-light"
          />
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3 ml-1">Pré-visualização</p>
        <div className="p-8 bg-white border border-[#F5F2F0] rounded-[32px] text-sm text-[#4A433D] leading-relaxed shadow-sm italic">
          {bodyText}
        </div>
      </div>
    </div>
  );
}

function ConsentTermsModule({ user, patient }: { user: User, patient: Patient }) {
  const [isSigning, setIsSigning] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templates, setTemplates] = useState<{ id: string, title: string, content: string }[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const sigPad = useRef<any>(null);
  const [preparingWhatsAppTemplate, setPreparingWhatsAppTemplate] = useState<{ id: string, title: string, content: string } | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  // Os 3 modelos padrão (TCLE, Autorização de Imagem, Recibo) sempre aparecem aqui, sem
  // depender de nenhum passo em Configurações — só recebem um ID estável baseado no
  // título, pra continuar reconhecíveis caso o mesmo modelo também exista salvo lá (evita
  // duplicar na lista).
  const defaultTemplatesWithIds = DEFAULT_CONSENT_TEMPLATES.map(t => ({
    ...t,
    id: `default-${t.title}`,
  }));

  useEffect(() => {
    (async () => {
      try {
        const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
        const snap = await getDoc(doc(db, 'settings', ownerId));
        const extraTemplates = snap.exists() ? ((snap.data().consentTemplates || []) as { id: string, title: string, content: string }[]) : [];
        const defaultTitles = new Set(defaultTemplatesWithIds.map(t => t.title));
        const merged = [...defaultTemplatesWithIds, ...extraTemplates.filter(t => !defaultTitles.has(t.title))];
        setTemplates(merged);
        if (snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
      } catch (err) {
        // Mesmo se a leitura de Configurações falhar, os modelos padrão continuam
        // disponíveis — não dependem dela
        setTemplates(defaultTemplatesWithIds);
        console.error(err);
      }
    })();
  }, [user.uid]);

  // Preenche automaticamente os campos que já temos, pra não entregar ao paciente um
  // texto cheio de linhas em branco pra ler. Cobre os placeholders usados nos modelos
  // padrão (Configurações → "Adicionar Modelos Padrão").
  const fillTemplate = (content: string) => {
    return content
      .replace(/\[NOME DO PACIENTE\]/g, patient.name || '_______________________')
      .replace(/\[CPF DO PACIENTE\]/g, patient.cpf || '_______________________')
      .replace(/\[DATA DE HOJE\]/g, new Date().toLocaleDateString('pt-BR'))
      .replace(/\[NOME DA CLINICA\]/g, clinicSettings?.clinicName || clinicSettings?.professionalName || '_______________________')
      .replace(/\[NOME DO PROFISSIONAL\]/g, clinicSettings?.professionalName || '_______________________');
  };

  // Assinaturas feitas remotamente (link enviado por WhatsApp) ficam guardadas em
  // signRequests até serem "puxadas" pro prontuário — isso acontece sozinho aqui, assim
  // que o profissional abre essa aba do paciente.
  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, 'signRequests'),
          where('patientId', '==', patient.id),
          where('status', '==', 'signed')
        );
        const snap = await getDocs(q);
        const toMerge = snap.docs.filter(d => !d.data().mergedIntoRecord);
        if (toMerge.length === 0) return;

        const newTerms = toMerge.map(d => {
          const data = d.data();
          return {
            templateId: data.templateId,
            templateTitle: data.templateTitle,
            signedAt: data.signedAt,
            signatureUrl: data.signatureUrl,
          };
        });
        await updateDoc(doc(db, 'patients', patient.id!), {
          consentTerms: [...(patient.consentTerms || []), ...newTerms],
        });
        await Promise.all(toMerge.map(d => updateDoc(doc(db, 'signRequests', d.id), { mergedIntoRecord: true })));
        showToast(`${newTerms.length} assinatura(s) remota(s) recebida(s)`);
      } catch (err) {
        // Melhor esforço — não impede o resto da tela de funcionar
      }
    })();
  }, [patient.id]);

  // Ficha clínica de harmonização facial, preenchida pelo próprio paciente na sala de
  // espera (logo após o check-in) — puxa tudo pro prontuário sozinho assim que o
  // profissional abre essa aba: dados de cadastro, anamnese (questionário de saúde e
  // queixa principal) e os dois termos de autorização, com a assinatura do paciente.
  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, 'intakeSubmissions'),
          where('patientId', '==', patient.id)
        );
        const snap = await getDocs(q);
        const toMerge = snap.docs.filter(d => !d.data().mergedIntoRecord);
        if (toMerge.length === 0) return;

        // Só existe 1 ficha por check-in — se por acaso houver mais de uma pendente,
        // usa a mais recente
        const sorted = toMerge.sort((a, b) => (b.data().submittedAt || '').localeCompare(a.data().submittedAt || ''));
        const s = sorted[0].data();

        const currentAnamnesis = patient.anamnesis || ({} as any);
        const patientUpdate: any = {
          // Só preenche o que ainda não existia — nunca sobrescreve o que já estava
          // certo no cadastro
          birthDate: patient.birthDate || s.birthDate || '',
          rg: patient.rg || s.rg || '',
          address: patient.address || s.address || '',
          email: patient.email || s.email || '',
          profession: patient.profession || s.profession || '',
          maritalStatus: patient.maritalStatus || s.maritalStatus || '',
          howHeardAboutClinic: patient.howHeardAboutClinic || s.howHeardAboutClinic || '',
          consentTerms: [
            ...(patient.consentTerms || []),
            {
              templateId: 'intake-photo-consent',
              templateTitle: 'Autorização de Documentação Fotográfica (Ficha Clínica)',
              signedAt: s.submittedAt,
              signatureUrl: s.signatureUrl,
            },
            {
              templateId: 'intake-image-disclosure',
              templateTitle: 'Autorização de Divulgação de Imagens (Ficha Clínica)',
              signedAt: s.submittedAt,
              signatureUrl: s.signatureUrl,
            },
          ],
          anamnesis: {
            ...currentAnamnesis,
            mainComplaint: currentAnamnesis.mainComplaint || s.mainComplaint || '',
            conditions: {
              ...(currentAnamnesis.conditions || {}),
              diabetes: currentAnamnesis.conditions?.diabetes || !!s.hasDiabetes,
              autoimmune: currentAnamnesis.conditions?.autoimmune || !!s.hasAutoimmuneDisease,
              pregnant: currentAnamnesis.conditions?.pregnant || !!s.isPregnant,
              breastfeeding: currentAnamnesis.conditions?.breastfeeding || !!s.isBreastfeeding,
            },
            hasAllergies: currentAnamnesis.hasAllergies || !!s.hasMedicationAllergy,
            allergiesDetails: currentAnamnesis.allergiesDetails || s.medicationAllergyDetail || '',
            hasContinuousMedication: currentAnamnesis.hasContinuousMedication || !!s.usesContinuousMedication,
            medicationsDetails: currentAnamnesis.medicationsDetails || s.continuousMedicationDetail || '',
            intakeQuestionnaire: {
              usedToxinBefore: !!s.usedToxinBefore,
              lastToxinDate: s.lastToxinDate || '',
              toxinTimes: s.toxinTimes || '',
              hasFoodAllergy: !!s.hasFoodAllergy,
              hadFillerBefore: !!s.hadFillerBefore,
              fillerProduct: s.fillerProduct || '',
              hasCoagulationDisease: !!s.hasCoagulationDisease,
              bleedsEasily: !!s.bleedsEasily,
              hadHemorrhageOrHerpes: !!s.hadHemorrhageOrHerpes,
              hasAnemia: !!s.hasAnemia,
              howHeardAboutClinic: s.howHeardAboutClinic || '',
              submittedAt: s.submittedAt,
            },
          },
        };
        await updateDoc(doc(db, 'patients', patient.id!), patientUpdate);
        await Promise.all(toMerge.map(d => updateDoc(doc(db, 'intakeSubmissions', d.id), { mergedIntoRecord: true })));
        showToast('Ficha clínica preenchida pelo paciente recebida e mesclada no prontuário');
      } catch (err) {
        // Melhor esforço — não impede o resto da tela de funcionar
      }
    })();
  }, [patient.id]);

  const openWhatsAppPreparation = (template: { id: string, title: string, content: string }) => {
    if (!patient.phone) {
      showToast('Cadastre um telefone pro paciente antes de enviar por WhatsApp', 'error');
      return;
    }
    setPreparingWhatsAppTemplate(template);
    setEditableContent(fillTemplate(template.content));
  };

  const handleSaveAndSendWhatsApp = async () => {
    if (!preparingWhatsAppTemplate || !editableContent.trim()) return;
    setSendingWhatsApp(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const requestData = {
        userId: user.uid,
        patientId: patient.id,
        patientName: patient.name,
        patientCpf: patient.cpf || '',
        templateId: preparingWhatsAppTemplate.id,
        templateTitle: preparingWhatsAppTemplate.title,
        // Texto final, já revisado/preenchido pelo profissional — é isso que fica
        // salvo permanentemente, não o modelo genérico original.
        templateContent: editableContent,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        createdBy: user.email || user.uid,
        ownerId,
      };
      const docRef = await addDoc(collection(db, 'signRequests'), requestData);
      const link = remoteSignLink(docRef.id);
      const phoneDigits = patient.phone!.replace(/\D/g, '');
      const whatsappPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
      const message = encodeURIComponent(
        `Olá, ${patient.name}! Segue o link pra assinar o documento "${preparingWhatsAppTemplate.title}" da sua consulta:\n${link}`
      );
      window.open(`https://wa.me/${whatsappPhone}?text=${message}`, '_blank');
      setPreparingWhatsAppTemplate(null);
      setEditableContent('');
      setIsSigning(false);
      showToast('Documento salvo e link gerado — confirme o envio no WhatsApp');
    } catch (err: any) {
      console.error('Erro ao salvar/enviar termo:', err);
      const detail = err?.code === 'permission-denied'
        ? 'Sem permissão — as regras do Firestore podem precisar ser republicadas.'
        : (err?.message || 'Erro desconhecido');
      showToast(`Erro ao salvar o link: ${detail}`, 'error');
    }
    setSendingWhatsApp(false);
  };

  const handleSign = async () => {
    if (sigPad.current && !sigPad.current.isEmpty()) {
      showToast('Processando assinatura...', 'info');
      try {
        const signatureBlob = await fetch(sigPad.current.toDataURL()).then(res => res.blob());
        const path = `patients/${user.uid}/${patient.id}/consent/${Date.now()}_sig.png`;
        const sRef = ref(storage, path);
        await uploadBytes(sRef, signatureBlob);
        const signatureUrl = await getDownloadURL(sRef);

        const newTerm = {
          templateId: selectedTemplate.id,
          templateTitle: selectedTemplate.title,
          signedAt: new Date().toISOString(),
          signatureUrl
        };
        
        const updatedTerms = [...(patient.consentTerms || []), newTerm];
        await updateDoc(doc(db, 'patients', patient.id!), { 
          consentTerms: updatedTerms,
          updatedAt: new Date().toISOString()
        });
        
        setIsSigning(false);
        setSelectedTemplate(null);
        showToast('Termo assinado com sucesso');
      } catch (err) {
        console.error(err);
        showToast('Erro ao processar assinatura', 'error');
      }
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
        <h3 className="serif text-2xl text-[#4A433D]">Termos & Consentimentos</h3>
        <button 
          onClick={() => setIsSigning(true)}
          className="bg-[#EADFD4] text-white px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-md hover:bg-[#DFCFBF] transition-all"
        >
          Novo Termo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {patient.consentTerms?.map((term, i) => (
          <div key={i} className="p-8 bg-white border border-[#F5F2F0] rounded-[32px] space-y-6 shadow-sm group hover:border-[#EADFD4]/30 transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-lg font-normal text-[#4A433D] serif leading-tight">{term.templateTitle}</h4>
                <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-[0.2em] mt-2">Assinado em {new Date(term.signedAt).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="p-3 bg-[#FDFBF9] rounded-xl text-[#9CA3AF] group-hover:bg-[#F0F7F0] group-hover:text-[#8BA888] transition-all">
                <CheckCircle2 size={24} />
              </div>
            </div>
            <div className="h-24 bg-[#FDFBF9] rounded-2xl flex items-center justify-center border border-dashed border-[#F5F2F0] p-4 shadow-sm">
              <img src={term.signatureUrl} alt="Assinatura" className="h-full object-contain mix-blend-multiply opacity-80" />
            </div>
          </div>
        ))}
        {(!patient.consentTerms || patient.consentTerms.length === 0) && (
          <div className="col-span-full p-20 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-[#FDFBF9]/50">
            Nenhum termo de consentimento assinado.
          </div>
        )}
      </div>

      <AnimatePresence>
        {isSigning && (
          <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-md z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-[48px] p-12 shadow-2xl overflow-y-auto max-h-[90vh] border border-[#F5F2F0]"
            >
              {!selectedTemplate ? (
                <div className="space-y-8">
                  <div className="flex justify-between items-center">
                    <h2 className="serif text-3xl text-[#4A433D]">Escolha o Modelo</h2>
                    <button onClick={() => setIsSigning(false)} className="text-[#9CA3AF] hover:text-[#4A433D] transition-all"><X size={28} /></button>
                  </div>
                  {templates.length === 0 ? (
                    <div className="py-12 text-center space-y-4">
                      <p className="text-sm text-[#9CA3AF] font-light italic">
                        Nenhum modelo configurado em sua conta.
                      </p>
                      <p className="text-[10px] text-[#EADFD4] font-bold uppercase tracking-widest">Vá em Configurações → Modelos</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {templates.map(t => (
                        <div
                          key={t.id}
                          className="w-full p-8 bg-white border border-[#F5F2F0] rounded-[32px] hover:border-[#EADFD4] hover:shadow-lg transition-all flex justify-between items-center group gap-4"
                        >
                          <button onClick={() => setSelectedTemplate(t)} className="text-left flex-1">
                            <span className="font-semibold text-[#4A433D] text-lg block">{t.title}</span>
                            <span className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">Assinar agora, presencialmente</span>
                          </button>
                          <button
                            onClick={() => openWhatsAppPreparation(t)}
                            title="Enviar link de assinatura por WhatsApp"
                            className="shrink-0 w-10 h-10 rounded-full border border-[#F5F2F0] flex items-center justify-center text-[#9CA3AF] hover:bg-[#8BA888] hover:text-white hover:border-[#8BA888] transition-all"
                          >
                            <MessageCircle size={18} />
                          </button>
                          <button onClick={() => setSelectedTemplate(t)} className="shrink-0 w-10 h-10 rounded-full border border-[#F5F2F0] flex items-center justify-center text-[#9CA3AF] group-hover:bg-[#EADFD4] group-hover:text-white transition-all">
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-[#EADFD4] mb-2">
                      <FileText size={24} />
                      <h2 className="serif text-3xl text-[#4A433D]">{selectedTemplate.title}</h2>
                    </div>
                    <div className="p-8 bg-[#FDFBF9] rounded-[32px] border border-[#F5F2F0] text-sm text-[#4A433D] leading-relaxed max-h-64 overflow-y-auto shadow-sm space-y-3">
                      {formatTermParagraphs(fillTemplate(selectedTemplate.content)).map((paragraph, i) => (
                        <p key={i} className="italic">{paragraph}</p>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] ml-2">Assinatura Digital do Paciente</p>
                    <div className="bg-white rounded-[32px] border-2 border-[#F5F2F0] shadow-sm overflow-hidden relative">
                      <SignaturePad 
                        ref={sigPad}
                        canvasProps={{ className: 'w-full h-64 cursor-crosshair' }}
                      />
                      <button 
                        onClick={() => sigPad.current.clear()} 
                        className="absolute bottom-6 right-6 px-4 py-2 bg-white/80 backdrop-blur-sm border border-[#F5F2F0] rounded-xl text-[10px] font-bold text-[#EADFD4] uppercase tracking-widest hover:bg-white transition-all"
                      >
                        Limpar Campo
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button onClick={() => setSelectedTemplate(null)} className="flex-1 py-5 border border-[#F5F2F0] text-[#9CA3AF] rounded-[24px] font-bold text-[10px] uppercase tracking-widest hover:bg-[#FDFBF9] transition-all">Voltar</button>
                    <button onClick={handleSign} className="flex-1 py-5 bg-[#F0F7F0] text-[#8BA888] rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl hover:bg-[#E5EFE5] transition-all">Confirmar e Finalizar</button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {preparingWhatsAppTemplate && (
          <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-md z-[60] flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-[48px] p-12 shadow-2xl overflow-y-auto max-h-[90vh] border border-[#F5F2F0]"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3 text-[#8BA888]">
                  <MessageCircle size={24} />
                  <h2 className="serif text-3xl text-[#4A433D]">{preparingWhatsAppTemplate.title}</h2>
                </div>
                <button onClick={() => { setPreparingWhatsAppTemplate(null); setEditableContent(''); }} className="text-[#9CA3AF] hover:text-[#4A433D] transition-all"><X size={28} /></button>
              </div>

              <p className="text-sm text-[#9CA3AF] font-light mb-6">
                Revise e complete o texto abaixo antes de enviar — o que estiver aqui é exatamente o que o paciente vai ver e assinar. Depois de salvo, esse texto fica permanente no prontuário.
              </p>

              <textarea
                value={editableContent}
                onChange={e => setEditableContent(e.target.value)}
                rows={14}
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-[28px] p-6 text-sm text-[#4A433D] leading-relaxed outline-none focus:border-[#EADFD4]/50 transition-all font-light mb-8"
              />

              <div className="flex gap-4">
                <button
                  onClick={() => { setPreparingWhatsAppTemplate(null); setEditableContent(''); }}
                  className="flex-1 py-5 border border-[#F5F2F0] text-[#9CA3AF] rounded-[24px] font-bold text-[10px] uppercase tracking-widest hover:bg-[#FDFBF9] transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAndSendWhatsApp}
                  disabled={sendingWhatsApp || !editableContent.trim()}
                  className="flex-1 py-5 bg-[#8BA888] text-white rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl hover:bg-[#7A9877] transition-all disabled:opacity-50"
                >
                  {sendingWhatsApp ? 'Salvando...' : 'Salvar e Enviar por WhatsApp'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-5 rounded-[24px] transition-all font-medium text-sm ${
        active 
          ? 'bg-white text-[#EADFD4] shadow-sm border border-[#F5F2F0]' 
          : 'text-[#9CA3AF] hover:bg-white/50 hover:translate-x-1'
      }`}
    >
      <span className={`transition-colors ${active ? 'text-[#EADFD4]' : 'text-[#9CA3AF]'}`}>{icon}</span>
      <span className="tracking-tight">{label}</span>
    </button>
  );
}

function FormField({ label, value, onChange, textarea }: { label: string, value: string, onChange: (v: string) => void, textarea?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] ml-2">{label}</label>
      {textarea ? (
        <textarea 
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-[28px] p-6 outline-none focus:border-[#EADFD4]/30 transition-all font-light min-h-[120px] resize-none shadow-sm text-[#4A433D]"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Descreva aqui..."
        />
      ) : (
        <input 
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-[20px] p-4 px-6 outline-none focus:border-[#EADFD4]/30 transition-all font-light shadow-sm text-[#4A433D]"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="..."
        />
      )}
    </div>
  );
}

function HabitToggle({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-4 px-8 py-4 rounded-2xl transition-all border font-bold text-[10px] uppercase tracking-widest shadow-sm ${
        active 
          ? 'bg-[#8BA888] border-[#8BA888] text-white' 
          : 'bg-white border-[#F5F2F0] text-[#9CA3AF] opacity-60 hover:opacity-100'
      }`}
    >
      <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-gray-200'}`} />
      {label}
    </button>
  );
}

function ConditionToggle({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border text-left ${
        active 
          ? 'bg-[#F0F7F0] border-[#F0F7F0] text-[#8BA888] shadow-sm' 
          : 'bg-white border-[#F5F2F0] text-[#9CA3AF] hover:border-[#EADFD4]/30'
      }`}
    >
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
        active ? 'bg-[#8BA888] border-[#8BA888]' : 'bg-white border-[#F5F2F0]'
      }`}>
        {active && <CheckCircle2 size={10} className="text-white" />}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function PrescriptionModule({ user, patient }: { user: User, patient: Patient }) {
  const [isAdding, setIsAdding] = useState(false);
  const [medicines, setMedicines] = useState<{ name: string, dosage: string, instructions: string }[]>([{ name: '', dosage: '', instructions: '' }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);

  useEffect(() => {
    (async () => {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const snap = await getDoc(doc(db, 'settings', ownerId));
      if (snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
    })();
  }, [user.uid]);

  const addMedicine = () => setMedicines([...medicines, { name: '', dosage: '', instructions: '' }]);
  const updateMedicine = (index: number, field: string, value: string) => {
    const updated = [...medicines];
    (updated[index] as any)[field] = value;
    setMedicines(updated);
  };
  const removeMedicine = (index: number) => setMedicines(medicines.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const newPrescription = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        medicines: medicines.filter(m => m.name.trim()),
        content: notes
      };
      const updated = [newPrescription, ...(patient.prescriptions || [])];
      await updateDoc(doc(db, 'patients', patient.id!), { 
        prescriptions: updated,
        updatedAt: new Date().toISOString()
      });
      setIsAdding(false);
      setMedicines([{ name: '', dosage: '', instructions: '' }]);
      setNotes('');
      showToast('Receituário salvo');
    } catch (err) {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  };

  const handleExport = (prescription: any) => {
    const lines = [
      `RECEITUÁRIO MÉDICO`,
      `Paciente: ${patient.name}`,
      `Data: ${new Date(prescription.date).toLocaleDateString('pt-BR')}`,
      '',
      'MEDICAMENTOS:',
      '--------------------------------------------------',
      ...prescription.medicines.map((m: any, i: number) => `${i + 1}. ${m.name} - ${m.dosage}\n   Instruções: ${m.instructions}\n`),
      '',
      'ORIENTAÇÕES GERAIS:',
      '--------------------------------------------------',
      prescription.content || 'Nenhuma orientação adicional.',
      '',
      '',
      '__________________________________________________',
      'Assinatura e Carimbo Profissional'
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receituario-${patient.name.replace(/\s+/g, '-').toLowerCase()}-${new Date(prescription.date).toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleViewPrescription = (prescription: any) => {
    const clinicName = clinicSettings?.clinicName || clinicSettings?.professionalName || 'Clínica';
    const professionalName = clinicSettings?.professionalName || '';
    const medicinesHtml = prescription.medicines.map((m: any, i: number) =>
      `<p style="margin-bottom: 14px;"><strong>${i + 1}. ${m.name}</strong> — ${m.dosage}<br/><span style="color:#9CA3AF; font-size:13px;">${m.instructions || ''}</span></p>`
    ).join('');
    const bodyHtml = `
      <div class="box">
        <div class="box-label">Paciente</div>
        <p><strong>${patient.name}</strong> — ${new Date(prescription.date).toLocaleDateString('pt-BR')}</p>
      </div>
      <div class="box">
        <div class="box-label">Medicamentos</div>
        ${medicinesHtml}
      </div>
      ${prescription.content ? `<div class="box"><div class="box-label">Orientações Gerais</div><p>${prescription.content}</p></div>` : ''}
      <div class="box" style="text-align: center;">
        <p style="margin: 40px 0 6px;">
          <span style="display: inline-block; border-top: 1px solid #4A433D; padding-top: 8px; min-width: 280px;">
            ${professionalName ? `${professionalName}<br/>` : ''}Assinatura e Carimbo Profissional
          </span>
        </p>
      </div>
    `;
    const footerHtml = `
      <div class="footer-row">
        <span>${new Date().toLocaleDateString('pt-BR')}</span>
        <img class="footer-mark" src="/logo/logo-mark-v2.png" alt="" />
      </div>
    `;
    const html = buildLetterheadHtml({ title: 'Receituário', clinicName, bodyHtml, footerHtml, documentLabel: `Receituário — ${patient.name}` });
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#F5F2F0]">
        <h3 className="serif text-2xl text-[#4A433D]">Receituários & Prescrições</h3>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://receita.mevosaude.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-[#EADFD4] border border-[#F5F2F0] px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#FDFBF9] transition-all shadow-sm"
          >
            <ExternalLink size={18} /> Mevo Prescrição Digital
          </a>
          <a
            href="https://memed.com.br/login"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-[#EADFD4] border border-[#F5F2F0] px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#FDFBF9] transition-all shadow-sm"
          >
            <ExternalLink size={18} /> Memed Prescrição Digital
          </a>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-[#EADFD4] text-white px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-md hover:bg-[#DFCFBF] transition-all flex items-center gap-2"
          >
            <Plus size={18} /> Novo Receituário
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="p-10 bg-[#FDFBF9] rounded-[40px] border border-[#F5F2F0] space-y-8 shadow-sm overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <h4 className="serif text-2xl text-[#4A433D]">Prescrever Medicamentos</h4>
              <button onClick={() => setIsAdding(false)} className="text-[#9CA3AF] hover:text-[#EADFD4]">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              {medicines.map((med, i) => (
                <div key={i} className="bg-white p-8 rounded-3xl border border-[#F5F2F0] relative group shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Nome do Medicamento" value={med.name} onChange={v => updateMedicine(i, 'name', v)} />
                    <FormField label="Dosagem / Frequência" value={med.dosage} onChange={v => updateMedicine(i, 'dosage', v)} />
                  </div>
                  <div className="mt-4">
                    <FormField label="Instruções de Uso" value={med.instructions} onChange={v => updateMedicine(i, 'instructions', v)} textarea />
                  </div>
                  {medicines.length > 1 && (
                    <button 
                      onClick={() => removeMedicine(i)}
                      className="absolute -top-3 -right-3 w-8 h-8 bg-white border border-[#F5F2F0] text-red-400 rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              
              <button 
                onClick={addMedicine}
                className="w-full py-4 border-2 border-dashed border-[#EADFD4] text-[#EADFD4] rounded-3xl font-bold text-[10px] uppercase tracking-widest hover:bg-white transition-all flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Adicionar outro item
              </button>
            </div>

            <FormField label="Orientações Gerais" value={notes} onChange={setNotes} textarea />

            <div className="flex gap-4 pt-4">
              <button onClick={() => setIsAdding(false)} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
              <button 
                disabled={saving}
                onClick={handleSave} 
                className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all"
              >
                {saving ? 'Gravando...' : 'Finalizar Receituário'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6">
        {patient.prescriptions?.map((p, i) => (
          <div key={p.id} className="p-8 bg-white border border-[#F5F2F0] rounded-[32px] hover:border-[#EADFD4]/30 transition-all group flex flex-col md:flex-row gap-8 shadow-sm">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#9CA3AF] group-hover:bg-[#EADFD4] group-hover:text-white transition-all shadow-sm">
                  <Printer size={20} />
                </div>
                <div>
                  <h4 className="text-lg font-normal text-[#4A433D] serif leading-tight">Receituário #{p.id.slice(-4)}</h4>
                  <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-[0.2em] mt-1">Prescrito em {new Date(p.date).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              
              <div className="space-y-4 ml-2">
                {p.medicines.map((m, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4] mt-2 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-[#4A433D]">{m.name} <span className="font-light text-[#9CA3AF]">({m.dosage})</span></p>
                      <p className="text-[10px] text-[#9CA3AF] font-medium leading-relaxed mt-0.5">{m.instructions}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 md:border-l border-[#F5F2F0] md:pl-8">
              <button 
                onClick={() => handleViewPrescription(p)}
                className="flex items-center gap-2 px-6 py-4 bg-[#FDFBF9] text-[#9CA3AF] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#8BA888] hover:text-white transition-all shadow-sm"
              >
                <Eye size={18} /> Visualizar
              </button>
              <button 
                onClick={() => handleExport(p)}
                className="flex items-center gap-2 px-6 py-4 bg-[#FDFBF9] text-[#9CA3AF] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#EADFD4] hover:text-white transition-all shadow-sm"
              >
                <Download size={18} /> Baixar
              </button>
            </div>
          </div>
        ))}
        {(!patient.prescriptions || patient.prescriptions.length === 0) && (
          <div className="p-20 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-[40px] bg-[#FDFBF9]/50">
            Nenhum receituário emitido para este paciente.
          </div>
        )}
      </div>
    </div>
  );
}
