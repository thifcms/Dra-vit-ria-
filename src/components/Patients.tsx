import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, setDoc, deleteDoc, deleteField, getDoc, doc, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Patient, ClinicSettings } from '../types';
import { phoneIndexKey } from '../lib/slots';
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
  Bone,
  CheckCircle2,
  X,
  FileDown,
  Pill,
  Printer,
  ExternalLink
} from 'lucide-react';
import SignaturePad from 'react-signature-canvas';
import { showToast } from '../lib/toast';
const AnatomyViewer = lazy(() => import('./AnatomyViewer'));
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

function exportPatientRecord(patient: Patient) {
  const a = patient.anamnesis;
  
  const habitsList = [
    a?.habits?.smoking ? 'Fumante' : '',
    a?.habits?.alcohol ? 'Álcool' : '',
    a?.habits?.exercise ? 'Exercícios' : '',
    a?.habits?.sunExposure ? 'Exposição Solar Frequente' : '',
    a?.habits?.sunscreen ? 'Uso Diário de Protetor' : ''
  ].filter(Boolean).join(', ') || 'Nenhum';

  const conditionsList = a?.conditions ? Object.entries(a.conditions)
    .filter(([_, v]) => v)
    .map(([k, _]) => {
      const labels: any = {
        diabetes: 'Diabetes', hypertension: 'Hipertensão', heartProblems: 'Problemas Cardíacos',
        autoimmune: 'Doença Autoimune', cancerHistory: 'Histórico de Câncer', keloid: 'Queloide/Cicatrização Anormal',
        herpes: 'Herpes Recorrente', epilepsy: 'Epilepsia', hivHepatitis: 'HIV/Hepatite',
        pacemaker: 'Marca-passo', pregnant: 'Gestante', breastfeeding: 'Amamentando',
        anticoagulant: 'Anticoagulante', isotretinoin: 'Isotretinoína (Roacutan)', contraceptive: 'Anticoncepcional'
      };
      return labels[k] || k;
    }).join(', ') : '-';

  const lines = [
    `PRONTUÁRIO CLÍNICO — ${patient.name}`,
    `CPF: ${patient.cpf || '-'}`,
    `E-mail: ${patient.email || '-'}`,
    `Última Atualização: ${patient.updatedAt ? new Date(patient.updatedAt).toLocaleString('pt-BR') : '-'}`,
    '',
    '--------------------------------------------------',
    'ANAMNESE',
    '--------------------------------------------------',
    `Queixa principal: ${a?.mainComplaint || '-'}`,
    `Expectativas: ${a?.expectations || '-'}`,
    '',
    `Condições Médicas: ${conditionsList}`,
    `Outras condições: ${a?.otherConditions || '-'}`,
    `Alergias: ${a?.hasAllergies ? `Sim (${a.allergiesDetails})` : 'Não'}`,
    `Medicações Contínuas: ${a?.hasContinuousMedication ? `Sim (${a.medicationsDetails})` : 'Não'}`,
    `Histórico familiar: ${a?.familyHistory || '-'}`,
    '',
    `Hábitos: ${habitsList}`,
    `Dieta: ${a?.habits?.diet || '-'}`,
    '',
    `Avaliação da pele: ${a?.skinEvaluation || '-'}`,
    `Avaliação facial: ${a?.faceEvaluation || '-'}`,
    '',
    '--------------------------------------------------',
    'EVOLUÇÃO CLÍNICA',
    '--------------------------------------------------',
    ...(patient.evolution && patient.evolution.length
      ? patient.evolution.map(e => `[${new Date(e.date).toLocaleDateString('pt-BR')}] ${e.procedure}: ${e.notes}${e.bucoMaxiloNotes ? ' (Buco-Maxilo: ' + e.bucoMaxiloNotes + ')' : ''}`)
      : ['Nenhum registro de evolução encontrado.']),
    '',
    '--------------------------------------------------',
    'TERMOS DE CONSENTIMENTO ASSINADOS',
    '--------------------------------------------------',
    ...(patient.consentTerms && patient.consentTerms.length
      ? patient.consentTerms.map(t => `[${new Date(t.signedAt).toLocaleDateString('pt-BR')}] ${t.templateTitle}`)
      : ['Nenhum termo assinado.']),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `prontuario-${patient.name.replace(/\s+/g, '-').toLowerCase()}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Prontuário exportado com sucesso');
}

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
      where('userId', '==', user.uid),
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
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="serif text-3xl text-[#5C544E]">Base de Pacientes</h1>
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
              className="flex-1 outline-none font-light text-[#5C544E] placeholder-[#9CA3AF] bg-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="bg-white border border-[#F5F2F0] rounded-2xl px-5 py-3 shadow-sm outline-none focus:border-[#EADFD4]/30 transition-all text-xs font-semibold text-[#5C544E] appearance-none"
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
                          <p className="font-semibold text-[#5C544E]">{patient.name}</p>
                          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">Paciente</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <p className="text-sm text-[#5C544E] font-medium">{patient.cpf || '-'}</p>
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
  const [sex, setSex] = useState<'F' | 'M' | ''>('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
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
        await setDoc(doc(db, 'patientPhoneIndex', phoneIndexKey(user.uid, phone)), {
          clinicId: user.uid,
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
        <h2 className="text-2xl font-light mb-8 text-[#5C544E] serif">Novo Cadastro</h2>
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
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">E-mail</label>
              <input 
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
              className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Sexo (opcional)</label>
            <div className="grid grid-cols-2 gap-3">
              {(['F', 'M'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSex(sex === opt ? '' : opt)}
                  className={`py-4 rounded-2xl border text-sm font-medium transition-all ${
                    sex === opt
                      ? 'bg-[#EADFD4] text-white border-[#EADFD4]'
                      : 'bg-[#FDFBF9] text-[#9CA3AF] border-[#F5F2F0] hover:border-[#EADFD4]/40'
                  }`}
                >
                  {opt === 'F' ? 'Feminino' : 'Masculino'}
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
  const [activeTab, setActiveTab] = useState<'anamnesis' | 'evolution' | 'photos' | 'files' | 'consent' | 'prescriptions'>('anamnesis');
  const [phoneDraft, setPhoneDraft] = useState(patient.phone || '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);
  const [showAnatomyModal, setShowAnatomyModal] = useState(false);
  
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
      faceEvaluation: a?.faceEvaluation || ''
    };

    return { ...defaultAnamnesis, ...a, 
      conditions: { ...defaultAnamnesis.conditions, ...a?.conditions },
      habits: { ...defaultAnamnesis.habits, ...a?.habits }
    };
  };

  const [anamnesis, setAnamnesis] = useState(normalizeAnamnesis(patient.anamnesis));
  const [savingAnamnesis, setSavingAnamnesis] = useState(false);

  // Re-normaliza se o paciente mudar (sync em tempo real)
  useEffect(() => {
    setAnamnesis(normalizeAnamnesis(patient.anamnesis));
  }, [patient.id]); // Apenas quando trocar o ID para não resetar enquanto digita

  const [isAddingEvolution, setIsAddingEvolution] = useState(false);
  const [newEvolution, setNewEvolution] = useState({ procedure: '', notes: '', bucoMaxiloNotes: '', numericValue: '' });

  const handleSaveAnamnesis = async () => {
    setSavingAnamnesis(true);
    try {
      await updateDoc(doc(db, 'patients', patient.id!), { 
        anamnesis,
        updatedAt: new Date().toISOString()
      });
      showToast('Anamnese salva');
    } catch (err) {
      showToast('Erro ao salvar', 'error');
    }
    setSavingAnamnesis(false);
  };

  const handleAddEvolution = async () => {
    try {
      const entry = { 
        ...newEvolution, 
        numericValue: newEvolution.numericValue ? parseFloat(newEvolution.numericValue) : undefined,
        date: new Date().toISOString() 
      };
      const updated = [entry, ...(patient.evolution || [])];
      await updateDoc(doc(db, 'patients', patient.id!), { 
        evolution: updated,
        updatedAt: new Date().toISOString()
      });
      setIsAddingEvolution(false);
      setNewEvolution({ procedure: '', notes: '', bucoMaxiloNotes: '', numericValue: '' });
      showToast('Evolução registrada');
    } catch (err) {
      showToast('Erro ao salvar evolução', 'error');
    }
  };

  // Improved upload handlers using Firebase Storage
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    showToast('Iniciando upload...', 'info');
    try {
      const urls = await Promise.all(Array.from(files).map(async (file: File) => {
        const path = `patients/${user.uid}/${patient.id}/photos/${Date.now()}_${file.name}`;
        const sRef = ref(storage, path);
        await uploadBytes(sRef, file);
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

  const handleDeletePatient = async () => {
    if (deletingPatient) return;
    setDeletingPatient(true);
    try {
      await deleteDoc(doc(db, 'patients', patient.id!));
      // Melhor esforço: libera o índice de telefone também, se existir
      if (patient.phone) {
        await deleteDoc(doc(db, 'patientPhoneIndex', phoneIndexKey(user.uid, patient.phone))).catch(() => {});
      }
      showToast('Paciente excluído');
      onBack();
    } catch (err) {
      showToast('Erro ao excluir paciente', 'error');
      setDeletingPatient(false);
    }
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#5C544E] transition-all group font-medium">
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span>Voltar para lista</span>
      </button>

      <div className="bg-white rounded-[40px] border border-[#F5F2F0] shadow-sm min-h-[600px] flex flex-col lg:flex-row">
        {/* Patient Detail Sidebar */}
        <div className="w-full lg:w-80 bg-[#FDFBF9] border-r border-[#F5F2F0] p-8 flex flex-col rounded-t-[40px] lg:rounded-l-[40px] lg:rounded-tr-none">
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-[#EADFD4] mx-auto mb-6 border-4 border-white shadow-md overflow-hidden relative group">
              <UserIcon size={48} />
              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h2 className="text-2xl font-light serif text-[#5C544E] leading-tight">{patient.name}</h2>
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
              className="mt-2 text-center text-xs text-[#5C544E] bg-transparent border-b border-transparent hover:border-[#F5F2F0] focus:border-[#EADFD4] outline-none transition-all px-2 py-1 w-full"
            />
            <div className="flex justify-center gap-2 mt-3">
              {(['F', 'M'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={async () => {
                    const next = patient.sex === opt ? undefined : opt;
                    await updateDoc(doc(db, 'patients', patient.id!), { sex: next ?? deleteField() }).catch(() => {});
                  }}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                    patient.sex === opt
                      ? 'bg-[#EADFD4] text-white'
                      : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
                  }`}
                >
                  {opt === 'F' ? 'Feminino' : 'Masculino'}
                </button>
              ))}
            </div>
          </div>

          <nav className="space-y-2">
            <TabButton active={activeTab === 'anamnesis'} onClick={() => setActiveTab('anamnesis')} icon={<FileText size={20} />} label="Anamnese" />
            <TabButton active={activeTab === 'evolution'} onClick={() => setActiveTab('evolution')} icon={<History size={20} />} label="Evolução Clínica" />
            <TabButton active={activeTab === 'prescriptions'} onClick={() => setActiveTab('prescriptions')} icon={<Pill size={20} />} label="Receituários" />
            <TabButton active={activeTab === 'consent'} onClick={() => setActiveTab('consent')} icon={<CheckCircle2 size={20} />} label="Termos & Assinaturas" />
            <TabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} icon={<Camera size={20} />} label="Galeria de Fotos" />
            <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<Paperclip size={20} />} label="Exames e Anexos" />
          </nav>

          <button
            onClick={() => setShowAnatomyModal(true)}
            className="mt-4 w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-[#EADFD4]/15 border border-[#EADFD4]/40 text-[#5C544E] hover:bg-[#EADFD4]/25 transition-all"
          >
            <Bone size={20} className="text-[#EADFD4]" />
            <span className="text-sm font-medium">Anatomia 3D</span>
          </button>

          <div className="mt-auto pt-10 border-t border-[#F5F2F0] space-y-3">
            <button
              onClick={() => exportPatientRecord(patient)}
              className="w-full py-4 px-6 bg-white text-[#9CA3AF] border border-[#F5F2F0] rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#FDFBF9] hover:text-[#5C544E] transition-all shadow-sm"
            >
              <Download size={18} />
              Exportar Prontuário
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="w-full py-4 px-6 bg-white text-red-300 border border-red-100 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-500 transition-all shadow-sm"
            >
              <Trash2 size={18} />
              Excluir Paciente
            </button>
          </div>
        </div>

        {confirmingDelete && (
          <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl"
            >
              <h2 className="serif text-2xl text-[#5C544E] mb-2">Excluir paciente?</h2>
              <p className="text-sm text-[#9CA3AF] font-light mb-2">
                Isso apaga permanentemente o prontuário de <strong className="text-[#5C544E]">{patient.name}</strong> —
                anamnese, evolução, receituários, termos e fotos. Não pode ser desfeito.
              </p>
              <p className="text-xs text-[#9CA3AF] font-light mb-8 italic">
                Agendamentos e lançamentos financeiros já existentes não são apagados, só deixam de estar
                vinculados a um cadastro de paciente.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase"
                >
                  Não, cancelar
                </button>
                <button
                  disabled={deletingPatient}
                  onClick={handleDeletePatient}
                  className="flex-1 py-4 bg-red-400 text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-red-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingPatient ? 'Excluindo...' : 'Sim, excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-10 bg-white overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'anamnesis' && (
              <motion.div key="anamnesis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#5C544E]">Ficha de Anamnese</h3>
                  <button 
                    onClick={handleSaveAnamnesis} 
                    disabled={savingAnamnesis}
                    className="bg-[#F0F7F0] text-[#8BA888] flex items-center gap-2 hover:bg-[#E5EFE5] px-8 py-3 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm disabled:opacity-50"
                  >
                    <Save size={18} />
                    {savingAnamnesis ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
                
                <div className="space-y-12">
                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Queixas e Expectativas
                    </h4>
                    <div className="space-y-6">
                      <FormField label="Queixa Principal" value={anamnesis.mainComplaint} onChange={v => setAnamnesis({...anamnesis, mainComplaint: v})} textarea />
                      <FormField label="Expectativas do Paciente" value={anamnesis.expectations} onChange={v => setAnamnesis({...anamnesis, expectations: v})} textarea />
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Histórico Clínico
                    </h4>
                    <div className="bg-[#FDFBF9] p-8 rounded-[32px] border border-[#F5F2F0] mb-8">
                      <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-6">Condições Médicas</p>
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Outras Condições" value={anamnesis.otherConditions} onChange={v => setAnamnesis({...anamnesis, otherConditions: v})} textarea />
                      <FormField label="Histórico Familiar" value={anamnesis.familyHistory} onChange={v => setAnamnesis({...anamnesis, familyHistory: v})} textarea />
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Estilo de Vida
                    </h4>
                    <div className="flex flex-wrap gap-4 p-8 bg-[#FDFBF9] rounded-3xl border border-[#F5F2F0] mb-6 shadow-sm">
                      <HabitToggle label="Fumante" active={anamnesis.habits.smoking} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, smoking: !anamnesis.habits.smoking}})} />
                      <HabitToggle label="Álcool" active={anamnesis.habits.alcohol} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, alcohol: !anamnesis.habits.alcohol}})} />
                      <HabitToggle label="Exercícios" active={anamnesis.habits.exercise} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, exercise: !anamnesis.habits.exercise}})} />
                      <HabitToggle label="Exp. Solar" active={anamnesis.habits.sunExposure} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, sunExposure: !anamnesis.habits.sunExposure}})} />
                      <HabitToggle label="Protetor Diário" active={anamnesis.habits.sunscreen} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, sunscreen: !anamnesis.habits.sunscreen}})} />
                    </div>
                    <FormField label="Dieta e Suplementação" value={anamnesis.habits.diet} onChange={v => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, diet: v}})} textarea />
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4]" /> Avaliação Física
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Avaliação da Pele" value={anamnesis.skinEvaluation} onChange={v => setAnamnesis({...anamnesis, skinEvaluation: v})} textarea />
                      <FormField label="Avaliação Facial / Corporal" value={anamnesis.faceEvaluation} onChange={v => setAnamnesis({...anamnesis, faceEvaluation: v})} textarea />
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'evolution' && (
              <motion.div key="evolution" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#5C544E]">Evolução de Tratamentos</h3>
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
                      <h4 className="serif text-xl text-[#5C544E]">Gráfico de Evolução</h4>
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
                    <h4 className="serif text-xl text-[#5C544E]">Novo Acompanhamento</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Procedimento / Técnica" value={newEvolution.procedure} onChange={v => setNewEvolution({...newEvolution, procedure: v})} />
                      <FormField label="Medida / Valor (Opcional)" value={newEvolution.numericValue} onChange={v => setNewEvolution({...newEvolution, numericValue: v})} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Notas Gerais" value={newEvolution.notes} onChange={v => setNewEvolution({...newEvolution, notes: v})} textarea />
                      <FormField label="Foco Clínico Específico" value={newEvolution.bucoMaxiloNotes} onChange={v => setNewEvolution({...newEvolution, bucoMaxiloNotes: v})} textarea />
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button onClick={() => setIsAddingEvolution(false)} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
                      <button onClick={handleAddEvolution} className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all">Salvar Registro</button>
                    </div>
                  </motion.div>
                )}

                <div className="space-y-6">
                  {patient.evolution?.map((entry, i) => (
                    <motion.div 
                      key={i}
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
                        </div>
                        <span className="text-lg font-normal text-[#5C544E] serif">{entry.procedure}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">Observações Clínicas</p>
                          <p className="text-sm font-light text-[#5C544E] leading-relaxed italic">"{entry.notes}"</p>
                        </div>
                        {entry.bucoMaxiloNotes && (
                          <div className="bg-[#FDFBF9] p-6 rounded-2xl border border-[#F5F2F0] shadow-inner">
                            <p className="text-[9px] font-bold text-[#EADFD4] uppercase tracking-widest mb-3">Detalhes Técnicos</p>
                            <p className="text-sm font-light text-[#5C544E] leading-relaxed">{entry.bucoMaxiloNotes}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {(!patient.evolution || patient.evolution.length === 0) && (
                    <div className="p-20 text-center text-[#9CA3AF] font-light italic border-2 border-dashed border-[#F5F2F0] rounded-3xl bg-[#FDFBF9]/30">
                      Nenhum registro de evolução encontrado para este paciente.
                    </div>
                  )}
                </div>
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
                <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#5C544E]">Galeria Clínica</h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
                      className={`px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 border transition-all shadow-sm ${
                        compareMode ? 'bg-[#5C544E] text-white border-[#5C544E]' : 'bg-white text-[#9CA3AF] border-[#F5F2F0] hover:border-[#EADFD4]'
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
                        <h4 className="serif text-xl text-[#5C544E]">Comparação Antes / Depois</h4>
                        <button onClick={() => setCompareSelection([])} className="p-2 text-[#9CA3AF] hover:text-[#5C544E]">
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

            {activeTab === 'files' && (
              <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
                  <h3 className="serif text-2xl text-[#5C544E]">Exames e Laudos</h3>
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
                        <p className="text-sm font-semibold text-[#5C544E] truncate">{file.name}</p>
                        <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest mt-1">{file.type} • {file.date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="p-3 text-[#9CA3AF] hover:text-[#5C544E] hover:bg-[#FDFBF9] rounded-xl transition-all">
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
    </div>
  );
}

function ConsentTermsModule({ user, patient }: { user: User, patient: Patient }) {
  const [isSigning, setIsSigning] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templates, setTemplates] = useState<{ id: string, title: string, content: string }[]>([]);
  const sigPad = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', user.uid));
        if (snap.exists()) {
          setTemplates((snap.data().consentTemplates || []) as any);
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [user.uid]);

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
      <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
        <h3 className="serif text-2xl text-[#5C544E]">Termos & Consentimentos</h3>
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
                <h4 className="text-lg font-normal text-[#5C544E] serif leading-tight">{term.templateTitle}</h4>
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
          <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-md z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-[48px] p-12 shadow-2xl overflow-y-auto max-h-[90vh] border border-[#F5F2F0]"
            >
              {!selectedTemplate ? (
                <div className="space-y-8">
                  <div className="flex justify-between items-center">
                    <h2 className="serif text-3xl text-[#5C544E]">Escolha o Modelo</h2>
                    <button onClick={() => setIsSigning(false)} className="text-[#9CA3AF] hover:text-[#5C544E] transition-all"><X size={28} /></button>
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
                        <button 
                          key={t.id} 
                          onClick={() => setSelectedTemplate(t)}
                          className="w-full text-left p-8 bg-white border border-[#F5F2F0] rounded-[32px] hover:border-[#EADFD4] hover:shadow-lg transition-all flex justify-between items-center group"
                        >
                          <div>
                            <span className="font-semibold text-[#5C544E] text-lg block">{t.title}</span>
                            <span className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-1">Pronto para assinatura</span>
                          </div>
                          <div className="w-10 h-10 rounded-full border border-[#F5F2F0] flex items-center justify-center text-[#9CA3AF] group-hover:bg-[#EADFD4] group-hover:text-white transition-all">
                            <ChevronRight size={20} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-10">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-[#EADFD4] mb-2">
                      <FileText size={24} />
                      <h2 className="serif text-3xl text-[#5C544E]">{selectedTemplate.title}</h2>
                    </div>
                    <div className="p-8 bg-[#FDFBF9] rounded-[32px] border border-[#F5F2F0] text-sm text-[#5C544E] leading-relaxed max-h-64 overflow-y-auto shadow-sm italic">
                      {selectedTemplate.content.replace('[NOME DO PACIENTE]', patient.name)}
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
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-[28px] p-6 outline-none focus:border-[#EADFD4]/30 transition-all font-light min-h-[120px] resize-none shadow-sm text-[#5C544E]"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Descreva aqui..."
        />
      ) : (
        <input 
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-[20px] p-4 px-6 outline-none focus:border-[#EADFD4]/30 transition-all font-light shadow-sm text-[#5C544E]"
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
          ? 'bg-[#EADFD4] border-[#EADFD4] text-white' 
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

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
        <h3 className="serif text-2xl text-[#5C544E]">Receituários & Prescrições</h3>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => window.open('https://app.mevo.com.br/', '_blank')}
            className="bg-white text-[#EADFD4] border border-[#F5F2F0] px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#FDFBF9] transition-all shadow-sm"
          >
            <ExternalLink size={18} /> Mevo Prescrição Digital
          </button>
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
              <h4 className="serif text-2xl text-[#5C544E]">Prescrever Medicamentos</h4>
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
                  <h4 className="text-lg font-normal text-[#5C544E] serif leading-tight">Receituário #{p.id.slice(-4)}</h4>
                  <p className="text-[9px] text-[#9CA3AF] font-bold uppercase tracking-[0.2em] mt-1">Prescrito em {new Date(p.date).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              
              <div className="space-y-4 ml-2">
                {p.medicines.map((m, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#EADFD4] mt-2 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-[#5C544E]">{m.name} <span className="font-light text-[#9CA3AF]">({m.dosage})</span></p>
                      <p className="text-[10px] text-[#9CA3AF] font-medium leading-relaxed mt-0.5">{m.instructions}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-3 md:border-l border-[#F5F2F0] md:pl-8">
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
