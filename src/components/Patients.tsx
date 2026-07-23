import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Patient } from '../types';
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
  Paperclip
} from 'lucide-react';

export default function Patients({ user }: { user: User }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'patients'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      setPatients(list);
    });
    return unsubscribe;
  }, []);

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.cpf?.includes(searchTerm)
  );

  if (selectedPatient) {
    return <PatientDetail patient={selectedPatient} onBack={() => setSelectedPatient(null)} />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="serif text-3xl text-[#4A4644]">Base de Pacientes</h1>
          <p className="text-[#B4A08C] text-xs font-semibold uppercase tracking-widest mt-1">Prontuários Digitais & Históricos</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#D1C7BD] text-white px-6 py-3 rounded-full flex items-center gap-2 hover:bg-[#D1C7BD]/90 transition-all shadow-sm active:scale-95 font-semibold"
        >
          <Plus size={20} />
          <span>Novo Cadastro</span>
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-[#F2EEE9] card-shadow overflow-hidden">
        <div className="p-6 border-b border-[#F2EEE9] flex items-center gap-4 bg-[#FDFBF9]">
          <Search size={20} className="text-[#B4A08C]" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou CPF..." 
            className="flex-1 outline-none font-light text-[#4A4644] placeholder-[#B4A08C] bg-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF7F2] border-b border-[#F2EEE9]">
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Nome do Paciente</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">CPF</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Última Atividade</th>
                <th className="p-6 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B4A08C]">Status</th>
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
                      <div className="w-10 h-10 rounded-full bg-[#D1C7BD]/20 flex items-center justify-center text-[#D1C7BD] border border-[#D1C7BD]">
                        <UserIcon size={20} />
                      </div>
                      <span className="font-semibold text-[#4A4644]">{patient.name}</span>
                    </div>
                  </td>
                  <td className="p-6 text-sm font-light text-[#B4A08C]">{patient.cpf || '-'}</td>
                  <td className="p-6 text-sm font-light text-[#B4A08C]">Há 2 dias</td>
                  <td className="p-6">
                    <span className="px-3 py-1 bg-[#D4E2D4] text-[#4F634F] text-[9px] font-bold uppercase tracking-widest rounded-full">Ativo</span>
                  </td>
                  <td className="p-6 text-right">
                    <ChevronRight size={20} className="text-[#B4A08C] opacity-0 group-hover:opacity-100 transition-opacity inline-block" />
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          habits: {
            smoking: false,
            alcohol: false,
            exercise: false,
            diet: ''
          },
          skinEvaluation: '',
          faceEvaluation: ''
        },
        evolution: [],
        photoHistory: [],
        files: [],
        consentTerms: []
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[#4A443F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white w-full max-w-lg rounded-[32px] p-10 shadow-2xl"
      >
        <h2 className="text-2xl font-light mb-8 text-[#4A4644]">Novo Cadastro</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">Nome Completo</label>
            <input 
              required
              className="w-full bg-[#FDFCFB] border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">CPF</label>
              <input 
                className="w-full bg-[#FDFCFB] border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#B4A08C] uppercase tracking-wider mb-2">E-mail</label>
              <input 
                type="email"
                className="w-full bg-[#FDFCFB] border border-[#EBE3DB] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex gap-4 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-4 border border-[#EBE3DB] text-[#B4A08C] rounded-2xl font-light hover:bg-[#FAF7F2] transition-all"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-light hover:bg-[#D1C7BD]/90 transition-all shadow-md"
            >
              Cadastrar
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function PatientDetail({ patient, onBack }: { patient: Patient, onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'anamnesis' | 'evolution' | 'photos' | 'files' | 'consent'>('anamnesis');
  const [anamnesis, setAnamnesis] = useState(patient.anamnesis || {
    mainComplaint: '',
    expectations: '',
    medicalHistory: '',
    allergies: '',
    medications: '',
    familyHistory: '',
    habits: {
      smoking: false,
      alcohol: false,
      exercise: false,
      diet: ''
    },
    skinEvaluation: '',
    faceEvaluation: ''
  });

  const [isAddingEvolution, setIsAddingEvolution] = useState(false);
  const [newEvolution, setNewEvolution] = useState({
    procedure: '',
    notes: '',
    bucoMaxiloNotes: ''
  });

  const handleSaveAnamnesis = async () => {
    try {
      await updateDoc(doc(db, 'patients', patient.id!), { anamnesis });
      alert('Anamnese salva com sucesso!');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddEvolution = async () => {
    try {
      const evolutionEntry = {
        ...newEvolution,
        date: new Date().toISOString()
      };
      const updatedEvolution = [evolutionEntry, ...(patient.evolution || [])];
      await updateDoc(doc(db, 'patients', patient.id!), { evolution: updatedEvolution });
      setIsAddingEvolution(false);
      setNewEvolution({ procedure: '', notes: '', bucoMaxiloNotes: '' });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-[#B4A08C] hover:text-[#4A4644] transition-colors mb-6 font-light">
        <ArrowLeft size={20} />
        Voltar para lista
      </button>

      <div className="bg-white rounded-[32px] border border-[#F2EEE9] card-shadow overflow-hidden min-h-[600px] flex flex-col md:flex-row">
        {/* Patient Sidebar Info */}
        <div className="w-full md:w-80 bg-[#FAF7F2] border-r border-[#F2EEE9] p-8">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-[#B4A08C] mx-auto mb-4 border-4 border-[#D1C7BD] shadow-sm overflow-hidden">
              <UserIcon size={48} />
            </div>
            <h2 className="text-xl font-semibold serif text-[#4A4644]">{patient.name}</h2>
            <p className="text-xs text-[#B4A08C] font-semibold uppercase tracking-widest mt-2">{patient.cpf || 'Sem CPF'}</p>
          </div>

          <div className="space-y-2">
            <TabButton active={activeTab === 'anamnesis'} onClick={() => setActiveTab('anamnesis')} icon={<FileText size={18} />} label="Anamnese" />
            <TabButton active={activeTab === 'evolution'} onClick={() => setActiveTab('evolution')} icon={<History size={18} />} label="Evolução Clínica" />
            <TabButton active={activeTab === 'consent'} onClick={() => setActiveTab('consent')} icon={<Paperclip size={18} />} label="Termos de Consentimento" />
            <TabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} icon={<Camera size={18} />} label="Histórico Fotográfico" />
            <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<Paperclip size={18} />} label="Anexos & Exames" />
          </div>

          <div className="mt-10 pt-10 border-t border-[#D1C7BD]">
            <button className="w-full py-3 px-4 bg-white text-[#B4A08C] border border-[#D1C7BD] rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#FAF7F2] transition-all shadow-sm">
              <Download size={16} />
              Prontuário PDF
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-10 bg-[#FDFBF9]">
          <AnimatePresence mode="wait">
            {activeTab === 'anamnesis' && (
              <motion.div key="anamnesis" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className="serif text-2xl text-[#4A4644]">Anamnese Detalhada</h3>
                  <button onClick={handleSaveAnamnesis} className="bg-[#D4E2D4] text-[#4F634F] flex items-center gap-2 hover:bg-[#C5D9C5] px-6 py-2 rounded-full transition-all font-bold text-xs uppercase tracking-widest shadow-sm">
                    <Save size={18} />
                    Salvar Dados
                  </button>
                </div>
                
                <div className="space-y-8">
                  <section className="space-y-4">
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] border-b border-[#EBE3DB] pb-2">Queixas e Expectativas</h4>
                    <FormField label="Queixa Principal" value={anamnesis.mainComplaint} onChange={v => setAnamnesis({...anamnesis, mainComplaint: v})} textarea />
                    <FormField label="Expectativas do Paciente" value={anamnesis.expectations} onChange={v => setAnamnesis({...anamnesis, expectations: v})} textarea />
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] border-b border-[#EBE3DB] pb-2">Histórico Médico</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Condições Médicas Atuais" value={anamnesis.medicalHistory} onChange={v => setAnamnesis({...anamnesis, medicalHistory: v})} textarea />
                      <FormField label="Histórico Familiar" value={anamnesis.familyHistory} onChange={v => setAnamnesis({...anamnesis, familyHistory: v})} textarea />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <FormField label="Alergias Conhecidas" value={anamnesis.allergies} onChange={v => setAnamnesis({...anamnesis, allergies: v})} />
                      <FormField label="Medicações em Uso" value={anamnesis.medications} onChange={v => setAnamnesis({...anamnesis, medications: v})} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] border-b border-[#EBE3DB] pb-2">Hábitos e Estilo de Vida</h4>
                    <div className="flex gap-8 p-6 bg-white rounded-2xl border border-[#F2EEE9]">
                      <HabitToggle label="Fumante" active={anamnesis.habits.smoking} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, smoking: !anamnesis.habits.smoking}})} />
                      <HabitToggle label="Álcool" active={anamnesis.habits.alcohol} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, alcohol: !anamnesis.habits.alcohol}})} />
                      <HabitToggle label="Exercícios" active={anamnesis.habits.exercise} onClick={() => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, exercise: !anamnesis.habits.exercise}})} />
                    </div>
                    <FormField label="Dieta e Alimentação" value={anamnesis.habits.diet} onChange={v => setAnamnesis({...anamnesis, habits: {...anamnesis.habits, diet: v}})} />
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-[0.2em] border-b border-[#EBE3DB] pb-2">Avaliação Clínica</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Avaliação da Pele" value={anamnesis.skinEvaluation} onChange={v => setAnamnesis({...anamnesis, skinEvaluation: v})} textarea />
                      <FormField label="Avaliação Facial" value={anamnesis.faceEvaluation} onChange={v => setAnamnesis({...anamnesis, faceEvaluation: v})} textarea />
                    </div>
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'evolution' && (
              <motion.div key="evolution" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className="serif text-2xl text-[#4A4644]">Evolução Clínica</h3>
                  <button 
                    onClick={() => setIsAddingEvolution(true)}
                    className="bg-[#D4E2D4] text-[#4F634F] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm"
                  >
                    <Plus size={16} /> Novo Registro
                  </button>
                </div>

                {isAddingEvolution && (
                  <div className="mb-8 p-8 bg-white rounded-3xl border border-[#E8D3D3] space-y-6 shadow-sm">
                    <h4 className="serif text-lg text-[#8D6B6B]">Novo Acompanhamento</h4>
                    <FormField label="Procedimento Realizado" value={newEvolution.procedure} onChange={v => setNewEvolution({...newEvolution, procedure: v})} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Notas Gerais de Evolução" value={newEvolution.notes} onChange={v => setNewEvolution({...newEvolution, notes: v})} textarea />
                      <FormField label="Foco Buco-Maxilo-Facial" value={newEvolution.bucoMaxiloNotes} onChange={v => setNewEvolution({...newEvolution, bucoMaxiloNotes: v})} textarea />
                    </div>
                    <div className="flex gap-4">
                      <button onClick={() => setIsAddingEvolution(false)} className="flex-1 py-3 border border-[#EBE3DB] text-[#B4A08C] rounded-xl text-xs font-bold uppercase">Cancelar</button>
                      <button onClick={handleAddEvolution} className="flex-1 py-3 bg-[#D4E2D4] text-[#4F634F] rounded-xl text-xs font-bold uppercase shadow-sm">Salvar Registro</button>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {patient.evolution?.map((entry, i) => (
                    <div key={i} className="p-8 bg-white border border-[#F2EEE9] rounded-3xl shadow-sm hover:border-[#B4A08C] transition-all">
                      <div className="flex justify-between items-start mb-4">
                        <span className="bg-[#FAF7F2] px-3 py-1 rounded-lg text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest border border-[#EBE3DB]">
                          {new Date(entry.date).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-sm font-semibold text-[#4A4644] serif">{entry.procedure}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-[9px] font-bold text-[#B4A08C] uppercase mb-2">Notas Gerais</p>
                          <p className="text-sm font-light text-[#4A4644] leading-relaxed italic">"{entry.notes}"</p>
                        </div>
                        {entry.bucoMaxiloNotes && (
                          <div className="bg-[#F5E6E8]/20 p-4 rounded-xl border border-[#F5E6E8]">
                            <p className="text-[9px] font-bold text-[#8D6B6B] uppercase mb-2">Acompanhamento Buco-Maxilo</p>
                            <p className="text-sm font-light text-[#8D6B6B] leading-relaxed">{entry.bucoMaxiloNotes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!patient.evolution || patient.evolution.length === 0) && (
                    <div className="p-20 text-center text-[#B4A08C] font-light italic border-2 border-dashed border-[#EBE3DB] rounded-3xl">Nenhum registro de evolução encontrado.</div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'consent' && (
              <motion.div key="consent" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ConsentTermsModule patient={patient} />
              </motion.div>
            )}

            {activeTab === 'photos' && (
              <motion.div key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className="serif text-2xl text-[#4A4644]">Galeria Clínica</h3>
                  <label className="bg-[#DBC4F0]/30 text-[#8D6B6B] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer hover:bg-[#DBC4F0]/50 transition-all shadow-sm">
                    <Camera size={16} /> Enviar Imagens
                    <input type="file" className="hidden" multiple />
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  {patient.photoHistory?.map((url, i) => (
                    <div key={i} className="group relative">
                      <img src={url} alt="Patient" className="w-full h-48 object-cover rounded-3xl border border-[#F2EEE9] group-hover:scale-[1.02] transition-transform duration-300" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl flex items-center justify-center">
                        <button className="p-2 bg-white rounded-full text-[#8D6B6B]"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {(!patient.photoHistory || patient.photoHistory.length === 0) && (
                    <div className="col-span-3 p-20 text-center text-[#B4A08C] font-light italic border-2 border-dashed border-[#EBE3DB] rounded-3xl bg-white/50">
                      Nenhuma imagem clínica anexada.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'files' && (
              <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center justify-between mb-8">
                  <h3 className="serif text-2xl text-[#4A4644]">Exames e Laudos</h3>
                  <button className="bg-[#D4E2D4] text-[#4F634F] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm">
                    <Paperclip size={16} /> Anexar Arquivo
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {patient.files?.map((file, i) => (
                    <div key={i} className="p-6 bg-white border border-[#F2EEE9] rounded-3xl flex items-center gap-4 hover:border-[#B4A08C] transition-all">
                      <div className="w-12 h-12 bg-[#FAF7F2] rounded-xl flex items-center justify-center text-[#B4A08C]">
                        <FileText size={24} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#4A4644]">{file.name}</p>
                        <p className="text-[10px] text-[#B4A08C] uppercase font-bold tracking-widest">{file.type} • {file.date}</p>
                      </div>
                      <button className="p-2 text-[#B4A08C] hover:text-[#8D6B6B]"><Download size={18} /></button>
                    </div>
                  ))}
                  {(!patient.files || patient.files.length === 0) && (
                    <div className="col-span-2 p-16 text-center text-[#B4A08C] font-light italic border-2 border-dashed border-[#EBE3DB] rounded-3xl">
                      Nenhum arquivo ou exame anexado ao prontuário.
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

function HabitToggle({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all border font-bold text-[10px] uppercase tracking-widest ${
        active ? 'bg-[#F5E6E8] border-[#E8D3D3] text-[#8D6B6B] shadow-sm' : 'bg-white border-[#EBE3DB] text-[#B4A08C] opacity-50'
      }`}
    >
      <div className={`w-3 h-3 rounded-full ${active ? 'bg-[#8D6B6B]' : 'bg-gray-200'}`} />
      {label}
    </button>
  );
}

import SignaturePad from 'react-signature-canvas';

function ConsentTermsModule({ patient }: { patient: Patient }) {
  const [isSigning, setIsSigning] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const sigPad = React.useRef<any>(null);

  const templates = [
    { id: '1', title: 'Termo de Consentimento - Cirurgia Buco-Maxilo', content: 'Eu, [NOME DO PACIENTE], autorizo a realização do procedimento cirúrgico...' },
    { id: '2', title: 'Termo de Consentimento - Procedimentos Faciais', content: 'Declaro estar ciente dos riscos e benefícios dos bioestimuladores...' }
  ];

  const handleSign = async () => {
    if (sigPad.current && !sigPad.current.isEmpty()) {
      const signatureData = sigPad.current.toDataURL();
      const newTerm = {
        templateId: selectedTemplate.id,
        templateTitle: selectedTemplate.title,
        signedAt: new Date().toISOString(),
        signatureUrl: signatureData
      };
      
      const updatedTerms = [...(patient.consentTerms || []), newTerm];
      try {
        await updateDoc(doc(db, 'patients', patient.id!), { consentTerms: updatedTerms });
        setIsSigning(false);
        setSelectedTemplate(null);
        alert('Termo assinado com sucesso!');
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="serif text-2xl text-[#4A4644]">Termos & Assinaturas</h3>
        <button 
          onClick={() => setIsSigning(true)}
          className="bg-[#D4E2D4] text-[#4F634F] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm"
        >
          Nova Assinatura
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {patient.consentTerms?.map((term, i) => (
          <div key={i} className="p-6 bg-white border border-[#F2EEE9] rounded-3xl space-y-4 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="text-sm font-semibold text-[#4A4644] serif">{term.templateTitle}</h4>
                <p className="text-[10px] text-[#B4A08C] font-bold uppercase tracking-widest">Assinado em {new Date(term.signedAt).toLocaleDateString()}</p>
              </div>
              <Download size={18} className="text-[#B4A08C]" />
            </div>
            <div className="h-16 bg-[#FAF7F2] rounded-xl flex items-center justify-center border border-dashed border-[#EBE3DB]">
              <img src={term.signatureUrl} alt="Signature" className="h-full object-contain mix-blend-multiply" />
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isSigning && (
          <div className="fixed inset-0 bg-[#4A443F]/20 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#FDFBF9] w-full max-w-2xl rounded-[40px] p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              {!selectedTemplate ? (
                <div className="space-y-6">
                  <h2 className="serif text-2xl text-[#4A4644]">Selecione o Modelo</h2>
                  <div className="space-y-4">
                    {templates.map(t => (
                      <button 
                        key={t.id} 
                        onClick={() => setSelectedTemplate(t)}
                        className="w-full text-left p-6 bg-white border border-[#F2EEE9] rounded-2xl hover:border-[#B4A08C] transition-all flex justify-between items-center group"
                      >
                        <span className="font-semibold text-[#4A4644]">{t.title}</span>
                        <ChevronRight size={20} className="text-[#B4A08C] group-hover:translate-x-1 transition-transform" />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setIsSigning(false)} className="w-full py-4 text-[#B4A08C] font-bold text-[10px] uppercase">Cancelar</button>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="space-y-2">
                    <h2 className="serif text-2xl text-[#4A4644]">{selectedTemplate.title}</h2>
                    <div className="p-6 bg-white rounded-2xl border border-[#F2EEE9] text-sm text-[#4A4644] leading-relaxed max-h-48 overflow-y-auto">
                      {selectedTemplate.content.replace('[NOME DO PACIENTE]', patient.name)}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest">Assinatura Digital do Paciente</p>
                    <div className="bg-white rounded-2xl border-2 border-[#EBE3DB] shadow-inner overflow-hidden">
                      <SignaturePad 
                        ref={sigPad}
                        canvasProps={{ className: 'w-full h-48 cursor-crosshair' }}
                      />
                    </div>
                    <button onClick={() => sigPad.current.clear()} className="text-[10px] font-bold text-[#8D6B6B] uppercase mt-2">Limpar Assinatura</button>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setSelectedTemplate(null)} className="flex-1 py-4 border border-[#EBE3DB] text-[#B4A08C] rounded-2xl font-bold text-[10px] uppercase">Voltar</button>
                    <button onClick={handleSign} className="flex-1 py-4 bg-[#D4E2D4] text-[#4F634F] rounded-2xl font-bold text-[10px] uppercase shadow-md">Confirmar Assinatura</button>
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
      className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all ${
        active ? 'bg-white text-[#4A4644] shadow-sm border border-[#F2EEE9]' : 'text-[#B4A08C] hover:text-[#4A4644]'
      }`}
    >
      <span className={active ? 'text-[#D1C7BD]' : ''}>{icon}</span>
      <span className="text-sm font-light tracking-wide">{label}</span>
    </button>
  );
}

function FormField({ label, value, onChange, textarea }: { label: string, value: string, onChange: (v: string) => void, textarea?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-[#B4A08C] uppercase tracking-[0.2em] mb-2 ml-1">{label}</label>
      {textarea ? (
        <textarea 
          className="w-full bg-[#FDFCFB] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light min-h-[100px] resize-none"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input 
          className="w-full bg-[#FDFCFB] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-colors font-light"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
