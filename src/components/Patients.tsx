import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, getDoc, doc, where, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Patient, ClinicSettings } from '../types';
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
  CheckCircle2,
  X,
  FileDown
} from 'lucide-react';
import SignaturePad from 'react-signature-canvas';
import { showToast } from '../lib/toast';
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
function exportPatientRecord(patient: Patient) {
  const a = patient.anamnesis;
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
    `Histórico médico: ${a?.medicalHistory || '-'}`,
    `Histórico familiar: ${a?.familyHistory || '-'}`,
    `Alergias: ${a?.allergies || '-'}`,
    `Medicações: ${a?.medications || '-'}`,
    `Hábitos: ${[
      a?.habits?.smoking ? 'Fumante' : '',
      a?.habits?.alcohol ? 'Álcool' : '',
      a?.habits?.exercise ? 'Exercícios' : ''
    ].filter(Boolean).join(', ') || 'Nenhum'}`,
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

export default function Patients({ user }: { user: User }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.cpf?.includes(searchTerm)
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
          <h1 className="serif text-3xl text-[#4A4644]">Base de Pacientes</h1>
          <p className="text-[#B4A08C] text-xs font-semibold uppercase tracking-widest mt-1">Prontuários Digitais & Históricos</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#D1C7BD] text-white px-8 py-4 rounded-2xl flex items-center gap-2 hover:bg-[#D1C7BD]/90 transition-all shadow-md active:scale-95 font-medium"
        >
          <Plus size={20} />
          <span>Novo Cadastro</span>
        </button>
      </div>

      <div className="bg-white rounded-[40px] border border-[#F2EEE9] shadow-sm overflow-hidden min-h-[400px]">
        <div className="p-8 border-b border-[#F2EEE9] flex items-center gap-6 bg-[#FDFBF9]">
          <div className="flex-1 max-w-md bg-white border border-[#EBE3DB] rounded-2xl px-6 py-3 flex items-center gap-4 shadow-inner focus-within:border-[#B4A08C] transition-all">
            <Search size={20} className="text-[#B4A08C]" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou CPF..." 
              className="flex-1 outline-none font-light text-[#4A4644] placeholder-[#B4A08C] bg-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="hidden md:block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest">
            {filteredPatients.length} pacientes encontrados
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-[#B4A08C] font-light italic">Sincronizando dados...</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#F2EEE9]">
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Identificação</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">CPF / E-mail</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Última Atividade</th>
                  <th className="p-6 text-[10px] font-bold uppercase tracking-widest text-[#B4A08C]">Status</th>
                  <th className="p-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2EEE9]">
                {filteredPatients.map(patient => (
                  <tr 
                    key={patient.id} 
                    className="hover:bg-[#FDFBF9] cursor-pointer transition-colors group"
                    onClick={() => setSelectedPatient(patient)}
                  >
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-[#D1C7BD] border border-[#EBE3DB] shadow-sm group-hover:bg-[#D1C7BD] group-hover:text-white transition-all">
                          <UserIcon size={24} />
                        </div>
                        <div>
                          <p className="font-semibold text-[#4A4644]">{patient.name}</p>
                          <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest">Paciente</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <p className="text-sm text-[#4A4644] font-medium">{patient.cpf || '-'}</p>
                      <p className="text-xs text-[#B4A08C] font-light">{patient.email || 'Sem e-mail'}</p>
                    </td>
                    <td className="p-6 text-sm font-light text-[#B4A08C]">
                      {patient.updatedAt ? new Date(patient.updatedAt).toLocaleDateString('pt-BR') : 'Sem registro'}
                    </td>
                    <td className="p-6">
                      <span className="px-3 py-1 bg-[#D4E2D4] text-[#4F634F] text-[9px] font-bold uppercase tracking-widest rounded-full">Ativo</span>
                    </td>
                    <td className="p-6 text-right">
                      <ChevronRight size={20} className="text-[#EBE3DB] group-hover:text-[#B4A08C] group-hover:translate-x-1 transition-all inline-block" />
                    </td>
                  </tr>
                ))}
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-20 text-center text-[#B4A08C] font-light italic">
                      Nenhum paciente encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
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
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'patients'), {
        userId: user.uid,
        name,
        cpf,
        email,
        updatedAt: new Date().toISOString(),
        anamnesis: {
          mainComplaint: '',
          expectations: '',
          medicalHistory: '',
          allergies: '',
          medications: '',
          familyHistory: '',
          habits: { smoking: false, alcohol: false, exercise: false, diet: '' },
          skinEvaluation: '',
          faceEvaluation: ''
        },
        evolution: [],
        photoHistory: [],
        files: [],
        consentTerms: []
      });
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
    <div className="fixed inset-0 bg-[#4A443F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl"
      >
        <h2 className="text-2xl font-light mb-8 text-[#4A4644] serif">Novo Cadastro</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
            <input 
              required
              className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Digite o nome completo"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">CPF</label>
              <input 
                className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">E-mail</label>
              <input 
                type="email"
                className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="paciente@exemplo.com"
              />
            </div>
          </div>
          
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 text-[#B4A08C] font-bold text-[10px] uppercase">Cancelar</button>
            <button 
              disabled={saving}
              type="submit" 
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#D1C7BD]/90 transition-all"
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
  const [activeTab, setActiveTab] = useState<'anamnesis' | 'evolution' | 'photos' | 'files' | 'consent'>('anamnesis');
  const [anamnesis, setAnamnesis] = useState(patient.anamnesis!);
  const [savingAnamnesis, setSavingAnamnesis] = useState(false);

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
      <button onClick={onBack} className="flex items-center gap-2 text-[#B4A08C] hover:text-[#4A4644] transition-all group font-medium">
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span>Voltar para lista</span>
      </button>

      <div className="bg-white rounded-[40px] border border-[#F2EEE9] shadow-sm overflow-hidden min-h-[600px] flex flex-col lg:flex-row">
        {/* Patient Detail Sidebar */}
        <div className="w-full lg:w-80 bg-[#FAF7F2] border-r border-[#F2EEE9] p-8 flex flex-col">
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-[#D1C7BD] mx-auto mb-6 border-4 border-white shadow-md overflow-hidden relative group">
              <UserIcon size={48} />
              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <h2 className="text-2xl font-light serif text-[#4A4644] leading-tight">{patient.name}</h2>
            <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-[0.2em] mt-3">{patient.cpf || 'Sem CPF'}</p>
          </div>

          <nav className="space-y-2">
            <TabButton active={activeTab === 'anamnesis'} onClick={() => setActiveTab('anamnesis')} icon={<FileText size={20} />} label="Anamnese" />
            <TabButton active={activeTab === 'evolution'} onClick={() => setActiveTab('evolution')} icon={<History size={20} />} label="Evolução Clínica" />
            <TabButton active={activeTab === 'consent'} onClick={() => setActiveTab('consent')} icon={<CheckCircle2 size={20} />} label="Termos & Assinaturas" />
            <TabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} icon={<Camera size={20} />} label="Galeria de Fotos" />
            <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<Paperclip size={20} />} label="Exames e Anexos" />
          </nav>

          <div className="mt-auto pt-10 border-t border-[#EBE3DB]">
            <button
              onClick={() => exportPatientRecord(patient)}
              className="w-full py-4 px-6 bg-white text-[#B4A08C] border border-[#EBE3DB] rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#FAF7F2] hover:text-[#4A4644] transition-all shadow-sm"
            >
              <Download size={18} />
              Exportar Prontuário
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-10 bg-white overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'anamnesis' && (
              <motion.div key="anamnesis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                <div className="flex items-center justify-between pb-6 border-b border-[#F2EEE9]">
                  <h3 className="serif text-2xl text-[#4A4644]">Ficha de Anamnese</h3>
                  <button 
                    onClick={handleSaveAnamnesis} 
                    disabled={savingAnamnesis}
                    className="bg-[#D4E2D4] text-[#4F634F] flex items-center gap-2 hover:bg-[#C5D9C5] px-8 py-3 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm disabled:opacity-50"
                  >
                    <Save size={18} />
                    {savingAnamnesis ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
                
                <div className="space-y-12">
                  <section>
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#D1C7BD]" /> Queixas e Expectativas
                    </h4>
                    <div className="space-y-6">
                      <FormField label="Queixa Principal" value={anamnesis.mainComplaint} onChange={v => setAnamnesis({...anamnesis, mainComplaint: v})} textarea />
                      <FormField label="Expectativas do Paciente" value={anamnesis.expectations} onChange={v => setAnamnesis({...anamnesis, expectations: v})} textarea />
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#D1C7BD]" /> Histórico Clínico
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Condições Médicas" value={anamnesis.medicalHistory} onChange={v => setAnamnesis({...anamnesis, medicalHistory: v})} textarea />
                      <FormField label="Histórico Familiar" value={anamnesis.familyHistory} onChange={v => setAnamnesis({...anamnesis, familyHistory: v})} textarea />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                      <FormField label="Alergias" value={anamnesis.allergies} onChange={v => setAnamnesis({...anamnesis, allergies: v})} />
                      <FormField label="Medicações" value={anamnesis.medications} onChange={v => setAnamnesis({...anamnesis, medications: v})} />
                    </div>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#D1C7BD]" /> Estilo de Vida
                    </h4>
                    <div className="flex flex-wrap gap-4 p-8 bg-[#FAF7F2] rounded-3xl border border-[#F2EEE9] mb-6 shadow-inner">
                      <HabitToggle label="Fumante" active={anamnesis.habits.smoking} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, smoking: !anamnesis.habits.smoking}})} />
                      <HabitToggle label="Álcool" active={anamnesis.habits.alcohol} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, alcohol: !anamnesis.habits.alcohol}})} />
                      <HabitToggle label="Exercícios" active={anamnesis.habits.exercise} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, exercise: !anamnesis.habits.exercise}})} />
                    </div>
                    <FormField label="Dieta e Suplementação" value={anamnesis.habits.diet} onChange={v => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, diet: v}})} textarea />
                  </section>

                  <section>
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#D1C7BD]" /> Avaliação Física
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
                <div className="flex items-center justify-between pb-6 border-b border-[#F2EEE9]">
                  <h3 className="serif text-2xl text-[#4A4644]">Evolução de Tratamentos</h3>
                  <button 
                    onClick={() => setIsAddingEvolution(true)}
                    className="bg-[#D1C7BD] text-white px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-md hover:bg-[#D1C7BD]/90 transition-all"
                  >
                    <Plus size={18} /> Novo Registro
                  </button>
                </div>

                {/* Progress Chart */}
                {patient.evolution && patient.evolution.some(e => e.numericValue !== undefined) && (
                  <div className="bg-[#FAF7F2] p-8 rounded-[40px] border border-[#F2EEE9] card-shadow">
                    <div className="mb-6">
                      <h4 className="serif text-xl text-[#4A4644]">Gráfico de Evolução</h4>
                      <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest mt-1">Acompanhamento de Medidas / Peso / Progresso</p>
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
                              <stop offset="5%" stopColor="#D1C7BD" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#D1C7BD" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE3DB" />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#B4A08C', fontSize: 10 }} 
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#B4A08C', fontSize: 10 }}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#D1C7BD" 
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
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="p-8 bg-[#FAF7F2] rounded-[32px] border border-[#EBE3DB] space-y-6 shadow-inner">
                    <h4 className="serif text-xl text-[#4A4644]">Novo Acompanhamento</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Procedimento / Técnica" value={newEvolution.procedure} onChange={v => setNewEvolution({...newEvolution, procedure: v})} />
                      <FormField label="Medida / Valor (Opcional)" value={newEvolution.numericValue} onChange={v => setNewEvolution({...newEvolution, numericValue: v})} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <FormField label="Notas Gerais" value={newEvolution.notes} onChange={v => setNewEvolution({...newEvolution, notes: v})} textarea />
                      <FormField label="Foco Clínico Específico" value={newEvolution.bucoMaxiloNotes} onChange={v => setNewEvolution({...newEvolution, bucoMaxiloNotes: v})} textarea />
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button onClick={() => setIsAddingEvolution(false)} className="flex-1 py-4 text-[#B4A08C] font-bold text-[10px] uppercase">Cancelar</button>
                      <button onClick={handleAddEvolution} className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md">Salvar Registro</button>
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
                      className="p-8 bg-white border border-[#F2EEE9] rounded-3xl shadow-sm hover:border-[#B4A08C] transition-all relative overflow-hidden group"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#D1C7BD]/20 group-hover:bg-[#D1C7BD] transition-all" />
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <span className="bg-[#FAF7F2] px-4 py-1.5 rounded-xl text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest border border-[#F2EEE9]">
                            {new Date(entry.date).toLocaleDateString('pt-BR')}
                          </span>
                          {entry.numericValue !== undefined && (
                            <span className="bg-[#D1C7BD] text-white px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm">
                              {entry.numericValue}
                            </span>
                          )}
                        </div>
                        <span className="text-lg font-normal text-[#4A4644] serif">{entry.procedure}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <p className="text-[9px] font-bold text-[#B4A08C] uppercase tracking-widest mb-3">Observações Clínicas</p>
                          <p className="text-sm font-light text-[#4A4644] leading-relaxed italic">"{entry.notes}"</p>
                        </div>
                        {entry.bucoMaxiloNotes && (
                          <div className="bg-[#FAF7F2] p-6 rounded-2xl border border-[#F2EEE9] shadow-inner">
                            <p className="text-[9px] font-bold text-[#D1C7BD] uppercase tracking-widest mb-3">Detalhes Técnicos</p>
                            <p className="text-sm font-light text-[#4A4644] leading-relaxed">{entry.bucoMaxiloNotes}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {(!patient.evolution || patient.evolution.length === 0) && (
                    <div className="p-20 text-center text-[#B4A08C] font-light italic border-2 border-dashed border-[#F2EEE9] rounded-3xl bg-[#FAF7F2]/30">
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

            {activeTab === 'photos' && (
              <motion.div key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-[#F2EEE9]">
                  <h3 className="serif text-2xl text-[#4A4644]">Galeria Clínica</h3>
                  <label className="bg-[#FAF7F2] text-[#B4A08C] px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer border border-[#F2EEE9] hover:bg-[#D1C7BD] hover:text-white hover:border-[#D1C7BD] transition-all shadow-sm">
                    <Camera size={18} /> Enviar Imagens
                    <input type="file" accept="image/*" className="hidden" multiple onChange={handlePhotoUpload} />
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                  {patient.photoHistory?.map((url, i) => (
                    <div key={i} className="group relative aspect-square">
                      <img src={url} alt="Paciente" className="w-full h-full object-cover rounded-[32px] border border-[#F2EEE9] shadow-md group-hover:scale-[1.02] transition-all duration-300" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-all rounded-[32px] flex items-center justify-center backdrop-blur-[2px]">
                        <button onClick={() => handleDeletePhoto(i)} className="p-4 bg-white/90 rounded-2xl text-[#8D6B6B] shadow-xl hover:scale-110 active:scale-95 transition-all">
                          <Trash2 size={24} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!patient.photoHistory || patient.photoHistory.length === 0) && (
                    <div className="col-span-full p-20 text-center text-[#B4A08C] font-light italic border-2 border-dashed border-[#F2EEE9] rounded-[40px] bg-[#FAF7F2]/30">
                      Nenhuma imagem clínica registrada.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'files' && (
              <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-[#F2EEE9]">
                  <h3 className="serif text-2xl text-[#4A4644]">Exames e Laudos</h3>
                  <label className="bg-[#D4E2D4] text-[#4F634F] px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm cursor-pointer hover:bg-[#C5D9C5] transition-all">
                    <Paperclip size={18} /> Anexar Arquivo
                    <input type="file" className="hidden" multiple onChange={handleFileUpload} />
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {patient.files?.map((file, i) => (
                    <div key={i} className="p-8 bg-white border border-[#F2EEE9] rounded-[32px] flex items-center gap-6 hover:border-[#B4A08C] hover:shadow-lg transition-all group">
                      <div className="w-14 h-14 bg-[#FAF7F2] rounded-2xl flex items-center justify-center text-[#D1C7BD] group-hover:bg-[#D1C7BD] group-hover:text-white transition-all shadow-inner">
                        <FileDown size={28} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#4A4644] truncate">{file.name}</p>
                        <p className="text-[10px] text-[#B4A08C] uppercase font-bold tracking-widest mt-1">{file.type} • {file.date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={file.url} download={file.name} target="_blank" rel="noreferrer" className="p-3 text-[#B4A08C] hover:text-[#4A4644] hover:bg-[#FAF7F2] rounded-xl transition-all">
                          <Download size={20} />
                        </a>
                        <button onClick={() => handleDeleteFile(i)} className="p-3 text-[#B4A08C] hover:text-[#8D6B6B] hover:bg-[#FAF7F2] rounded-xl transition-all">
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!patient.files || patient.files.length === 0) && (
                    <div className="col-span-full p-20 text-center text-[#B4A08C] font-light italic border-2 border-dashed border-[#F2EEE9] rounded-[40px] bg-[#FAF7F2]/30">
                      Nenhum anexo ou laudo encontrado.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
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
      <div className="flex items-center justify-between pb-6 border-b border-[#F2EEE9]">
        <h3 className="serif text-2xl text-[#4A4644]">Termos & Consentimentos</h3>
        <button 
          onClick={() => setIsSigning(true)}
          className="bg-[#D1C7BD] text-white px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-md hover:bg-[#D1C7BD]/90 transition-all"
        >
          Novo Termo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {patient.consentTerms?.map((term, i) => (
          <div key={i} className="p-8 bg-white border border-[#F2EEE9] rounded-[32px] space-y-6 shadow-sm group hover:border-[#B4A08C] transition-all">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-lg font-normal text-[#4A4644] serif leading-tight">{term.templateTitle}</h4>
                <p className="text-[9px] text-[#B4A08C] font-bold uppercase tracking-[0.2em] mt-2">Assinado em {new Date(term.signedAt).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="p-3 bg-[#FAF7F2] rounded-xl text-[#B4A08C] group-hover:bg-[#D4E2D4] group-hover:text-[#4F634F] transition-all">
                <CheckCircle2 size={24} />
              </div>
            </div>
            <div className="h-24 bg-[#FAF7F2] rounded-2xl flex items-center justify-center border border-dashed border-[#EBE3DB] p-4 shadow-inner">
              <img src={term.signatureUrl} alt="Assinatura" className="h-full object-contain mix-blend-multiply opacity-80" />
            </div>
          </div>
        ))}
        {(!patient.consentTerms || patient.consentTerms.length === 0) && (
          <div className="col-span-full p-20 text-center text-[#B4A08C] font-light italic border-2 border-dashed border-[#F2EEE9] rounded-[40px] bg-[#FAF7F2]/30">
            Nenhum termo de consentimento assinado.
          </div>
        )}
      </div>

      <AnimatePresence>
        {isSigning && (
          <div className="fixed inset-0 bg-[#4A443F]/30 backdrop-blur-md z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#FDFBF9] w-full max-w-2xl rounded-[48px] p-12 shadow-2xl overflow-y-auto max-h-[90vh] border border-white"
            >
              {!selectedTemplate ? (
                <div className="space-y-8">
                  <div className="flex justify-between items-center">
                    <h2 className="serif text-3xl text-[#4A4644]">Escolha o Modelo</h2>
                    <button onClick={() => setIsSigning(false)} className="text-[#B4A08C] hover:text-[#8D6B6B] transition-all"><X size={28} /></button>
                  </div>
                  {templates.length === 0 ? (
                    <div className="py-12 text-center space-y-4">
                      <p className="text-sm text-[#B4A08C] font-light italic">
                        Nenhum modelo configurado em sua conta.
                      </p>
                      <p className="text-[10px] text-[#D1C7BD] font-bold uppercase tracking-widest">Vá em Configurações → Modelos</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {templates.map(t => (
                        <button 
                          key={t.id} 
                          onClick={() => setSelectedTemplate(t)}
                          className="w-full text-left p-8 bg-white border border-[#F2EEE9] rounded-[32px] hover:border-[#D1C7BD] hover:shadow-lg transition-all flex justify-between items-center group"
                        >
                          <div>
                            <span className="font-semibold text-[#4A4644] text-lg block">{t.title}</span>
                            <span className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest mt-1">Pronto para assinatura</span>
                          </div>
                          <div className="w-10 h-10 rounded-full border border-[#EBE3DB] flex items-center justify-center text-[#B4A08C] group-hover:bg-[#D1C7BD] group-hover:text-white transition-all">
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
                    <div className="flex items-center gap-3 text-[#D1C7BD] mb-2">
                      <FileText size={24} />
                      <h2 className="serif text-3xl text-[#4A4644]">{selectedTemplate.title}</h2>
                    </div>
                    <div className="p-8 bg-white rounded-[32px] border border-[#F2EEE9] text-sm text-[#4A4644] leading-relaxed max-h-64 overflow-y-auto shadow-inner italic">
                      {selectedTemplate.content.replace('[NOME DO PACIENTE]', patient.name)}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] ml-2">Assinatura Digital do Paciente</p>
                    <div className="bg-white rounded-[32px] border-2 border-[#EBE3DB] shadow-inner overflow-hidden relative">
                      <SignaturePad 
                        ref={sigPad}
                        canvasProps={{ className: 'w-full h-64 cursor-crosshair' }}
                      />
                      <button 
                        onClick={() => sigPad.current.clear()} 
                        className="absolute bottom-6 right-6 px-4 py-2 bg-white/80 backdrop-blur-sm border border-[#EBE3DB] rounded-xl text-[10px] font-bold text-[#8D6B6B] uppercase tracking-widest hover:bg-white transition-all"
                      >
                        Limpar Campo
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button onClick={() => setSelectedTemplate(null)} className="flex-1 py-5 border border-[#EBE3DB] text-[#B4A08C] rounded-[24px] font-bold text-[10px] uppercase tracking-widest hover:bg-[#FAF7F2] transition-all">Voltar</button>
                    <button onClick={handleSign} className="flex-1 py-5 bg-[#D4E2D4] text-[#4F634F] rounded-[24px] font-bold text-[10px] uppercase tracking-widest shadow-xl hover:bg-[#C5D9C5] transition-all">Confirmar e Finalizar</button>
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
          ? 'bg-white text-[#8D6B6B] shadow-sm border border-[#F2EEE9]' 
          : 'text-[#B4A08C] hover:bg-white/50 hover:translate-x-1'
      }`}
    >
      <span className={`transition-colors ${active ? 'text-[#8D6B6B]' : 'text-[#B4A08C]'}`}>{icon}</span>
      <span className="tracking-tight">{label}</span>
    </button>
  );
}

function FormField({ label, value, onChange, textarea }: { label: string, value: string, onChange: (v: string) => void, textarea?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] ml-2">{label}</label>
      {textarea ? (
        <textarea 
          className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-[28px] p-6 outline-none focus:border-[#D1C7BD] transition-all font-light min-h-[120px] resize-none shadow-inner text-[#4A4644]"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Descreva aqui..."
        />
      ) : (
        <input 
          className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-[20px] p-4 px-6 outline-none focus:border-[#D1C7BD] transition-all font-light shadow-inner text-[#4A4644]"
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
          ? 'bg-[#D1C7BD] border-[#D1C7BD] text-white' 
          : 'bg-white border-[#EBE3DB] text-[#B4A08C] opacity-60 hover:opacity-100'
      }`}
    >
      <div className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-gray-200'}`} />
      {label}
    </button>
  );
}
