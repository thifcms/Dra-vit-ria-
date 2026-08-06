import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ClinicSettings, ConsentTemplate, PrescriptionTemplate, InventoryItem } from '../types';
import { APP_VERSION } from '../version';
import { User, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import SignaturePad from 'react-signature-canvas';
import { 
  Building2, 
  Calendar,
  User as UserIcon, 
  MapPin, 
  Hash,
  Shield,
  Fingerprint,
  Save,
  Cloud,
  FileText,
  Plus,
  Edit2,
  Trash2,
  X,
  Clock,
  Lock,
  CreditCard,
  Download,
  KeyRound,
  Pill,
  Receipt,
  RotateCcw
} from 'lucide-react';
import { showToast } from '../lib/toast';
import { hashPin, isValidPinFormat } from '../lib/pin';
import { getClinicOwnerId, parseCurrencyInput } from '../lib/slots';
import { isPlatformAuthenticatorAvailable, registerBiometric } from '../lib/webauthn';
import AdminPanel from './AdminPanel';
import ProfessionalScheduleManager from './ProfessionalScheduleManager';
import PatientBackup from './PatientBackup';

export default function Settings({ user }: { user: User }) {
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const profileSigPad = useRef<any>(null);
  const [settingsTab, setSettingsTab] = useState<'perfil' | 'gestao'>('perfil');
  const [changingLoginPassword, setChangingLoginPassword] = useState(false);
  const [oldLoginPassword, setOldLoginPassword] = useState('');
  const [newLoginPassword, setNewLoginPassword] = useState('');
  const [confirmLoginPassword, setConfirmLoginPassword] = useState('');
  const [savingLoginPassword, setSavingLoginPassword] = useState(false);
  const isEmailPasswordUser = user.providerData.some(p => p.providerId === 'password');

  const handleChangeLoginPassword = async () => {
    if (newLoginPassword.length < 6) {
      showToast('A nova senha precisa ter pelo menos 6 caracteres', 'error');
      return;
    }
    if (newLoginPassword !== confirmLoginPassword) {
      showToast('As senhas novas não coincidem', 'error');
      return;
    }
    setSavingLoginPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email!, oldLoginPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newLoginPassword);
      setOldLoginPassword('');
      setNewLoginPassword('');
      setConfirmLoginPassword('');
      setChangingLoginPassword(false);
      showToast('Senha de acesso alterada com sucesso');
    } catch (err: any) {
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        showToast('Senha atual incorreta', 'error');
      } else {
        showToast('Erro ao trocar a senha. Tente novamente.', 'error');
      }
    }
    setSavingLoginPassword(false);
  };

  useEffect(() => {
    getDoc(doc(db, 'system', 'authorized_admins')).then(snap => {
      const emails: string[] = snap.exists() ? (snap.data().emails || []) : [];
      setIsAdminUser(!!user.email && emails.includes(user.email));
    }).catch(() => setIsAdminUser(false));
  }, [user.email]);

  const [settings, setSettings] = useState<ClinicSettings>({
    professionalName: user.displayName || 'Minha Conta',
    registrationNumber: '',
    clinicName: 'Minha Clínica',
    clinicAddress: '',
    contactEmail: user.email || '',
    consentTemplates: [],
    biometricEnabled: false,
    cloudBackupEnabled: true,
    whatsappNumber: '',
    workingDays: [1, 2, 3, 4, 5], // seg-sex por padrão
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    appointmentInterval: 60,
    agendaBlocked: false,
    blockedDates: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ConsentTemplate | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [editingRxTemplate, setEditingRxTemplate] = useState<PrescriptionTemplate | null>(null);
  const [isAddingRxTemplate, setIsAddingRxTemplate] = useState(false);
  const [newProcedureName, setNewProcedureName] = useState('');
  const [newProcedurePrice, setNewProcedurePrice] = useState('');
  const [newSubstance, setNewSubstance] = useState<{ name: string; unit: 'ml' | 'unidade'; procedureIds: string[] }>({ name: '', unit: 'ml', procedureIds: [] });
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [editingKitProcId, setEditingKitProcId] = useState<string | null>(null);
  const [kitDraft, setKitDraft] = useState<{ itemId: string; itemName: string; quantity: number }[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'inventory'));
    const unsubscribe = onSnapshot(q, snap => {
      setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    });
    return () => unsubscribe();
  }, []);

  const openKitEditor = (proc: { id: string; insumoKit?: { itemId: string; itemName: string; quantity: number }[] }) => {
    setEditingKitProcId(proc.id);
    setKitDraft(proc.insumoKit ? proc.insumoKit.map(k => ({ ...k })) : []);
  };

  const toggleKitItem = (item: InventoryItem) => {
    setKitDraft(prev => {
      const exists = prev.find(k => k.itemId === item.id);
      if (exists) return prev.filter(k => k.itemId !== item.id);
      return [...prev, { itemId: item.id!, itemName: item.name, quantity: 1 }];
    });
  };

  const updateKitQuantity = (itemId: string, quantity: number) => {
    setKitDraft(prev => prev.map(k => k.itemId === itemId ? { ...k, quantity: Math.max(0.01, quantity) } : k));
  };

  const handleSaveKit = () => {
    if (!editingKitProcId) return;
    const next = (settings.procedures || []).map(p =>
      p.id === editingKitProcId ? { ...p, insumoKit: kitDraft } : p
    );
    persist({ ...settings, procedures: next });
    showToast('Kit de insumos salvo');
    setEditingKitProcId(null);
    setKitDraft([]);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        // Só usa o próprio UID como "dono" se ainda não existir nenhum — depois da
        // primeira vez, o dono fica fixo pra sempre, não importa quem loga depois
        const bookingSnap = await getDoc(doc(db, 'publicConfig', 'booking'));
        const existingOwnerId = bookingSnap.exists() ? bookingSnap.data().ownerId : null;
        const ownerId = existingOwnerId || user.uid;

        const docRef = doc(db, 'settings', ownerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as ClinicSettings;
          // Mescla com os padrões (não substitui tudo) — sem isso, uma conta antiga sem
          // os campos novos (horário de atendimento, etc.) ficaria com eles undefined.
          setSettings(prev => ({ ...prev, ...data }));
          // Garante que a página pública de agendamento sempre tenha o nome atualizado,
          // mesmo que o usuário nunca clique em "Salvar" depois desta atualização —
          // preserva o ownerId já existente, nunca troca pra quem está logado agora.
          await setDoc(doc(db, 'publicConfig', 'booking'), {
            ownerId,
            clinicName: data.clinicName || data.professionalName || 'Clínica',
            professionalName: data.professionalName || '',
            whatsappNumber: data.whatsappNumber || '',
            workingDays: data.workingDays ?? [1, 2, 3, 4, 5],
            workingHoursStart: data.workingHoursStart || '08:00',
            workingHoursEnd: data.workingHoursEnd || '18:00',
            appointmentInterval: data.appointmentInterval || 60,
            agendaBlocked: data.agendaBlocked || false,
            blockedDates: data.blockedDates || [],
          }).catch(() => {});
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [user.uid]);

  const persist = async (next: ClinicSettings) => {
    setSettings(next);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      await setDoc(doc(db, 'settings', ownerId), next);
    } catch (err) {
      showToast('Erro ao salvar no banco', 'error');
    }
  };

  const handleSaveTemplate = (template: ConsentTemplate) => {
    const templates = settings.consentTemplates || [];
    const exists = templates.some(t => t.id === template.id);
    const next = exists 
      ? templates.map(t => t.id === template.id ? template : t) 
      : [...templates, { ...template, id: crypto.randomUUID() }];
    persist({ ...settings, consentTemplates: next });
    setEditingTemplate(null);
    setIsAddingTemplate(false);
    showToast('Modelo de termo salvo');
  };

  const handleSaveRxTemplate = (template: PrescriptionTemplate) => {
    const templates = settings.prescriptionTemplates || [];
    const exists = templates.some(t => t.id === template.id);
    const next = exists
      ? templates.map(t => t.id === template.id ? template : t)
      : [...templates, { ...template, id: crypto.randomUUID() }];
    persist({ ...settings, prescriptionTemplates: next });
    setEditingRxTemplate(null);
    setIsAddingRxTemplate(false);
    showToast('Modelo de receita salvo');
  };

  const handleDeleteTemplate = (id: string) => {
    if (!window.confirm('Excluir este modelo de termo?')) return;
    persist({ ...settings, consentTemplates: (settings.consentTemplates || []).filter(t => t.id !== id) });
    showToast('Modelo removido');
  };

  const handleDeleteRxTemplate = (id: string) => {
    if (!window.confirm('Excluir este modelo de receita?')) return;
    persist({ ...settings, prescriptionTemplates: (settings.prescriptionTemplates || []).filter(t => t.id !== id) });
    showToast('Modelo removido');
  };

  const handleAddProcedure = (item: { name: string; price: number }) => {
    const next = [...(settings.procedures || []), { ...item, id: crypto.randomUUID() }];
    persist({ ...settings, procedures: next });
    showToast('Procedimento adicionado');
  };

  const handleDeleteProcedure = (id: string) => {
    if (!window.confirm('Excluir este procedimento? As substâncias vinculadas a ele deixam de referenciá-lo.')) return;
    persist({
      ...settings,
      procedures: (settings.procedures || []).filter(p => p.id !== id),
      substances: (settings.substances || []).map(s => ({ ...s, procedureIds: s.procedureIds.filter(pid => pid !== id) })),
    });
    showToast('Procedimento removido');
  };

  const handleAddSubstance = (item: { name: string; unit: 'ml' | 'unidade'; procedureIds: string[] }) => {
    const next = [...(settings.substances || []), { ...item, id: crypto.randomUUID() }];
    persist({ ...settings, substances: next });
    showToast('Substância adicionada');
  };

  const handleDeleteSubstance = (id: string) => {
    if (!window.confirm('Excluir esta substância?')) return;
    persist({ ...settings, substances: (settings.substances || []).filter(s => s.id !== id) });
    showToast('Substância removida');
  };


  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const handleSavePin = async () => {
    if (!isValidPinFormat(pinDraft)) {
      showToast('O PIN precisa ter exatamente 6 números', 'error');
      return;
    }
    if (pinDraft !== pinConfirm) {
      showToast('Os PINs não coincidem', 'error');
      return;
    }
    setSavingPin(true);
    try {
      const pinHash = await hashPin(pinDraft);
      await persist({ ...settings, pinHash, biometricEnabled: true });
      showToast('PIN definido com sucesso');
      setShowPinModal(false);
    } catch (err) {
      showToast('Erro ao salvar o PIN', 'error');
    }
    setSavingPin(false);
  };

  const [webauthnSupported, setWebauthnSupported] = useState(false);
  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setWebauthnSupported);
  }, []);

  const handleToggleBiometric = async () => {
    if (settings.webauthnCredentialId) {
      await persist({ ...settings, webauthnCredentialId: undefined });
      showToast('Biometria desativada');
      return;
    }
    try {
      const credentialId = await registerBiometric(
        user.uid,
        user.email || '',
        user.displayName || settings.professionalName || ''
      );
      await persist({ ...settings, webauthnCredentialId: credentialId });
      showToast('Biometria ativada com sucesso');
    } catch (err) {
      showToast('Não foi possível ativar a biometria. Tente novamente.', 'error');
    }
  };

  const toggleCloudBackup = () => {
    // Desligar precisa de confirmação — é fácil clicar sem querer, e as consequências
    // (parar de gerar backup automático dos prontuários) são sérias o bastante pra
    // merecer uma pausa antes de confirmar. Ligar não precisa, já que só passa a fazer
    // mais uma coisa boa, sem risco.
    if (settings.cloudBackupEnabled) {
      if (!window.confirm('Tem certeza que quer desativar o backup em nuvem? Os prontuários deixarão de ser salvos automaticamente.')) return;
    }
    persist({ ...settings, cloudBackupEnabled: !settings.cloudBackupEnabled });
  };

  const handleSaveDrawnSignature = async () => {
    if (!profileSigPad.current || profileSigPad.current.isEmpty()) {
      showToast('Assine no quadro antes de salvar', 'error');
      return;
    }
    setSavingSignature(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const signatureBlob = await fetch(profileSigPad.current.toDataURL()).then(res => res.blob());
      const sRef = ref(storage, `signatures/${ownerId}/professional.png`);
      await uploadBytes(sRef, signatureBlob);
      const url = await getDownloadURL(sRef);
      const updated = { ...settings, professionalSignatureUrl: url };
      setSettings(updated);
      await setDoc(doc(db, 'settings', ownerId), updated);
      showToast('Assinatura salva — será usada automaticamente nos documentos');
      setShowSignaturePad(false);
      profileSigPad.current?.clear();
    } catch (err) {
      showToast('Erro ao salvar assinatura', 'error');
    }
    setSavingSignature(false);
  };

  const handleUploadSignaturePhoto = async (file: File) => {
    setSavingSignature(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const sRef = ref(storage, `signatures/${ownerId}/professional.png`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      const updated = { ...settings, professionalSignatureUrl: url };
      setSettings(updated);
      await setDoc(doc(db, 'settings', ownerId), updated);
      showToast('Assinatura salva — será usada automaticamente nos documentos');
    } catch (err) {
      showToast('Erro ao salvar assinatura', 'error');
    }
    setSavingSignature(false);
  };

  const handleRemoveSignature = async () => {
    if (!window.confirm('Remover a assinatura salva? Documentos voltarão a pedir assinatura manual.')) return;
    setSavingSignature(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      // setDoc rejeita undefined explícito — remove a chave do objeto por completo em vez
      // de tentar zerá-la com undefined
      const { professionalSignatureUrl, ...rest } = settings;
      setSettings(rest as ClinicSettings);
      await setDoc(doc(db, 'settings', ownerId), rest);
      showToast('Assinatura removida');
    } catch (err) {
      showToast('Erro ao remover', 'error');
    }
    setSavingSignature(false);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      await setDoc(doc(db, 'settings', ownerId), settings);
      // Mantém o config público (usado pela página de agendamento sem login) sincronizado
      await setDoc(doc(db, 'publicConfig', 'booking'), {
        ownerId,
        clinicName: settings.clinicName || settings.professionalName || 'Clínica',
        professionalName: settings.professionalName || '',
        whatsappNumber: settings.whatsappNumber || '',
        workingDays: settings.workingDays ?? [1, 2, 3, 4, 5],
        workingHoursStart: settings.workingHoursStart || '08:00',
        workingHoursEnd: settings.workingHoursEnd || '18:00',
        appointmentInterval: settings.appointmentInterval || 60,
        agendaBlocked: settings.agendaBlocked || false,
        blockedDates: settings.blockedDates || [],
      });
      showToast('Configurações atualizadas');
    } catch (err) {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  };

  const [backingUp, setBackingUp] = useState(false);
  const handleFullBackup = async () => {
    setBackingUp(true);
    try {
      const collections = ['patients', 'appointments', 'transactions', 'inventory', 'inventory_movements'];
      const backup: Record<string, any> = {};
      
      const sanitize = (val: any): any => {
        if (val === null || val === undefined) return val;
        
        // Handle Firestore Timestamp
        if (typeof val.toDate === 'function') {
          return val.toDate().toISOString();
        }
        
        // Handle Firestore Reference (avoid circularity)
        if (val.path && typeof val.path === 'string' && val.firestore) {
          return `ref:${val.path}`;
        }

        if (typeof val !== 'object') return val;
        
        // Handle Arrays
        if (Array.isArray(val)) {
          return val.map(sanitize);
        }
        
        // Handle Objects
        const sanitized: any = {};
        for (const key in val) {
          if (Object.prototype.hasOwnProperty.call(val, key)) {
            sanitized[key] = sanitize(val[key]);
          }
        }
        return sanitized;
      };

      for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        backup[col] = snap.docs.map(d => sanitize({ id: d.id, ...d.data() }));
      }
      backup.settings = sanitize(settings);
      backup.exportedAt = new Date().toISOString();

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `backup-clinica-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      showToast('Backup completo exportado');
    } catch (err) {
      console.error('Erro no backup:', err);
      showToast('Erro ao gerar backup', 'error');
    }
    setBackingUp(false);
  };

  const [clearingSlots, setClearingSlots] = useState(false);
  const handleClearStuckSlots = async () => {
    setClearingSlots(true);
    try {
      const snap = await getDocs(query(collection(db, 'busySlots'), where('clinicId', '==', user.uid)));
      let cleared = 0;
      for (const slotDoc of snap.docs) {
        const data = slotDoc.data();
        if (!data.apt) continue; // sem vínculo com agendamento — não mexe (não dá pra saber se está travado)
        const apptSnap = await getDoc(doc(db, 'appointments', data.apt));
        if (!apptSnap.exists()) {
          // O agendamento nunca chegou a ser criado (falhou no meio do caminho) — o horário
          // ficou travado sem necessidade. Libera.
          await deleteDoc(slotDoc.ref);
          cleared++;
        }
      }
      showToast(cleared > 0 ? `${cleared} horário(s) destravado(s)` : 'Nenhum horário travado encontrado');
    } catch (err) {
      showToast('Erro ao verificar horários', 'error');
    }
    setClearingSlots(false);
  };

  if (loading) return (
    <div className="py-20 text-center text-[#9CA3AF] font-light italic">Carregando configurações...</div>
  );

  return (
    <div className="max-w-[1800px] mx-auto space-y-10">
      <div className="flex items-center gap-6">
        <div className="p-4 bg-[#FDFBF9] rounded-3xl text-[#EADFD4] border border-[#F5F2F0]">
          <SettingsIcon className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-light text-[#4A433D] serif">Configurações</h1>
          <p className="text-[#9CA3AF] font-light text-xs uppercase tracking-widest mt-1">Personalização & Segurança da Clínica</p>
        </div>
      </div>

      {isAdminUser && (
      <div className="flex gap-3">
        <button
          onClick={() => setSettingsTab('perfil')}
          className={`px-6 py-3 rounded-2xl text-sm font-medium transition-all ${
            settingsTab === 'perfil' ? 'bg-[#4A433D] text-white' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
          }`}
        >
          Perfil
        </button>
        <button
          onClick={() => setSettingsTab('gestao')}
          className={`px-6 py-3 rounded-2xl text-sm font-medium transition-all ${
            settingsTab === 'gestao' ? 'bg-[#4A433D] text-white' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
          }`}
        >
          Gestão da Clínica
        </button>
      </div>
      )}

      {settingsTab === 'perfil' && (
      <div className="max-w-3xl space-y-8">
        {/* Professional Profile */}
        <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
              <UserIcon size={24} />
            </div>
            <h3 className="text-xl font-light text-[#4A433D] serif">Identificação Profissional</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <SettingField 
              label="Nome do Profissional" 
              value={settings.professionalName} 
              onChange={v => setSettings({...settings, professionalName: v})}
              icon={<UserIcon size={18} />}
            />
            <SettingField 
              label="CRM / CRO" 
              value={settings.registrationNumber} 
              onChange={v => setSettings({...settings, registrationNumber: v})}
              icon={<Hash size={18} />}
            />
          </div>

          <div className="mt-8 pt-8 border-t border-[#F5F2F0]">
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">
              Assinatura do Profissional
            </label>
            <p className="text-xs text-[#9CA3AF] font-light mb-5">
              Cadastre sua assinatura uma vez (desenhando ou enviando uma foto) e ela será colada automaticamente
              nos documentos liberados, sem precisar assinar com o mouse toda vez.
            </p>
            {settings.professionalSignatureUrl ? (
              <div className="flex items-center gap-6 p-6 bg-[#FDFBF9] rounded-[28px] border border-[#F5F2F0]">
                <img src={settings.professionalSignatureUrl} alt="Assinatura salva" className="h-16 bg-white rounded-xl p-2 border border-[#F5F2F0]" style={{ mixBlendMode: 'multiply' }} />
                <div className="flex-1 flex flex-wrap gap-3">
                  <button onClick={() => setShowSignaturePad(true)} className="px-5 py-2.5 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-[#EADFD4]">
                    Assinar de Novo
                  </button>
                  <label className="px-5 py-2.5 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-[#EADFD4] cursor-pointer">
                    Enviar Nova Foto
                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUploadSignaturePhoto(e.target.files[0])} />
                  </label>
                  <button onClick={handleRemoveSignature} className="px-5 py-2.5 text-red-400 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-50">
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button onClick={() => setShowSignaturePad(true)} className="px-6 py-3 bg-[#EADFD4] text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#DFCFBF]">
                  Assinar Agora
                </button>
                <label className="px-6 py-3 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:border-[#EADFD4] cursor-pointer">
                  Enviar Foto
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUploadSignaturePhoto(e.target.files[0])} />
                </label>
              </div>
            )}
          </div>
        </section>

        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="w-full py-4 bg-[#4A433D] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#5C544E] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar Nome do Profissional'}
        </button>

        <ProfessionalScheduleManager user={user} isAdminUser={!!isAdminUser} />

        {isEmailPasswordUser && (
          <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
                <KeyRound size={24} />
              </div>
              <h3 className="text-xl font-light text-[#4A433D] serif">Senha de Acesso</h3>
            </div>

            {!changingLoginPassword ? (
              <button
                onClick={() => setChangingLoginPassword(true)}
                className="w-full py-4 border border-[#F5F2F0] text-[#5C544E] rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:border-[#EADFD4]/40 transition-all"
              >
                <KeyRound size={16} /> Trocar Senha de Acesso
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  type="password"
                  value={oldLoginPassword}
                  onChange={e => setOldLoginPassword(e.target.value)}
                  placeholder="Senha atual"
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
                <input
                  type="password"
                  value={newLoginPassword}
                  onChange={e => setNewLoginPassword(e.target.value)}
                  placeholder="Nova senha"
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
                <input
                  type="password"
                  value={confirmLoginPassword}
                  onChange={e => setConfirmLoginPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setChangingLoginPassword(false); setOldLoginPassword(''); setNewLoginPassword(''); setConfirmLoginPassword(''); }}
                    className="flex-1 py-3 text-[#9CA3AF] font-bold text-[10px] uppercase"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleChangeLoginPassword}
                    disabled={savingLoginPassword}
                    className="flex-1 py-3 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#DFCFBF] transition-all disabled:opacity-50"
                  >
                    {savingLoginPassword ? 'Salvando...' : 'Salvar Nova Senha'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="bg-[#4A433D] text-white rounded-[40px] p-10 shadow-xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <Shield size={20} className="text-[#EADFD4]" />
              <h3 className="text-lg font-light serif">Segurança</h3>
            </div>
            
            <div className="space-y-4">
              <p className="text-xs text-white/60 -mt-2 mb-2">
                PIN ou biometria são obrigatórios pra abrir o app — não é possível desativar, só trocar.
              </p>
              <button
                onClick={() => { setPinDraft(''); setPinConfirm(''); setShowPinModal(true); }}
                className="w-full flex items-center gap-3 px-6 py-4 bg-white/10 rounded-2xl text-white text-xs font-semibold hover:bg-white/15 transition-all"
              >
                <Fingerprint size={16} className="text-[#EADFD4]" />
                {settings.pinHash ? 'Alterar PIN' : 'Definir PIN'}
              </button>
              {webauthnSupported && (
                <button
                  onClick={handleToggleBiometric}
                  className="w-full flex items-center gap-3 px-6 py-4 bg-white/10 rounded-2xl text-white text-xs font-semibold hover:bg-white/15 transition-all"
                >
                  <Fingerprint size={16} className="text-[#EADFD4]" />
                  {settings.webauthnCredentialId ? 'Desativar Biometria' : 'Ativar Biometria (Face ID / Digital)'}
                </button>
              )}
            </div>
          </div>
          <div className="absolute right-0 bottom-0 w-32 h-32 bg-white/5 rounded-full translate-x-1/2 translate-y-1/2" />
        </div>
      </div>
      )}

      {settingsTab === 'gestao' && isAdminUser && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Clinic Info */}
          <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
                <Building2 size={24} />
              </div>
              <h3 className="text-xl font-light text-[#4A433D] serif">Sobre o Consultório</h3>
            </div>
            
            <div className="space-y-8">
              <SettingField 
                label="Nome da Clínica" 
                value={settings.clinicName} 
                onChange={v => setSettings({...settings, clinicName: v})}
                icon={<Building2 size={18} />}
              />
              <SettingField 
                label="Endereço Completo" 
                value={settings.clinicAddress} 
                onChange={v => setSettings({...settings, clinicAddress: v})}
                icon={<MapPin size={18} />}
              />
              <SettingField 
                label="WhatsApp da Clínica (para automação)" 
                value={settings.whatsappNumber || ''} 
                onChange={v => setSettings({...settings, whatsappNumber: v})}
                icon={<Phone size={18} />}
                placeholder="Ex: 11999999999"
              />
              <SettingField 
                label="Link do Site de Emissão de Nota Fiscal" 
                value={settings.invoiceEmissionLink || ''} 
                onChange={v => setSettings({...settings, invoiceEmissionLink: v})}
                icon={<Receipt size={18} />}
                placeholder="Ex: https://minhaprefeitura.gov.br/nfse"
              />
            </div>
          </section>

          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="w-full py-4 bg-[#4A433D] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#5C544E] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar Nome da Clínica'}
          </button>

          <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
                  <FileText size={24} />
                </div>
                <h3 className="text-xl font-light text-[#4A433D] serif">Modelos Extras de Consentimento</h3>
              </div>
              <button 
                onClick={() => setIsAddingTemplate(true)}
                className="text-[#EADFD4] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:text-[#9CA3AF] transition-colors"
              >
                <Plus size={16} /> Adicionar Modelo
              </button>
            </div>
            <p className="text-xs text-[#9CA3AF] font-light mb-6 -mt-4">
              Os modelos padrão (TCLE, Autorização de Imagem, Recibo de Entrega) já aparecem automaticamente
              no prontuário de cada paciente — aqui é só pra modelos extras que você queira adicionar.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(settings.consentTemplates || []).map(template => (
                <div key={template.id} className="p-6 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-[#9CA3AF]" />
                    <span className="text-sm font-medium text-[#4A433D]">{template.title}</span>
                  </div>
                  <div className="flex items-center gap-1 transition-all">
                    <button onClick={() => setEditingTemplate(template)} className="p-2 text-[#9CA3AF] hover:text-[#4A433D]"><Edit2 size={16} /></button>
                    <button onClick={() => handleDeleteTemplate(template.id!)} className="p-2 text-[#9CA3AF] hover:text-red-400"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {(!settings.consentTemplates || settings.consentTemplates.length === 0) && (
                <p className="col-span-2 text-center py-10 text-sm text-[#9CA3AF] font-light italic">Nenhum modelo de termo cadastrado.</p>
              )}
            </div>
          </section>

          <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
                  <Pill size={24} />
                </div>
                <h3 className="text-xl font-light text-[#4A433D] serif">Modelos de Receita</h3>
              </div>
              <button 
                onClick={() => setIsAddingRxTemplate(true)}
                className="text-[#EADFD4] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:text-[#9CA3AF] transition-colors"
              >
                <Plus size={16} /> Adicionar Modelo
              </button>
            </div>
            <p className="text-xs text-[#9CA3AF] font-light mb-6 -mt-4">
              Receitas prontas pra reaproveitar — ao criar um novo receituário, dá pra escolher um desses
              modelos e já vem tudo preenchido, só ajustando o que for preciso.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(settings.prescriptionTemplates || []).map(template => (
                <div key={template.id} className="p-6 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <Pill size={18} className="text-[#9CA3AF]" />
                    <div>
                      <span className="text-sm font-medium text-[#4A433D]">{template.name}</span>
                      <p className="text-[10px] text-[#9CA3AF]">{template.medicines.length} medicamento(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 transition-all">
                    <button onClick={() => setEditingRxTemplate(template)} className="p-2 text-[#9CA3AF] hover:text-[#4A433D]"><Edit2 size={16} /></button>
                    <button onClick={() => handleDeleteRxTemplate(template.id!)} className="p-2 text-[#9CA3AF] hover:text-red-400"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {(!settings.prescriptionTemplates || settings.prescriptionTemplates.length === 0) && (
                <p className="col-span-2 text-center py-10 text-sm text-[#9CA3AF] font-light italic">Nenhum modelo de receita cadastrado.</p>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          <button
            onClick={toggleCloudBackup}
            className="w-full py-5 bg-white border border-[#F5F2F0] rounded-[28px] font-medium flex items-center justify-between px-8 hover:border-[#EADFD4] transition-all shadow-sm active:scale-[0.98]"
          >
            <span className="flex items-center gap-3 text-[#4A433D]">
              <Cloud size={20} />
              Backup em Nuvem
            </span>
            <div className={`w-11 h-6 rounded-full relative transition-colors ${settings.cloudBackupEnabled ? 'bg-[#8BA888]' : 'bg-[#F0EAE3]'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${settings.cloudBackupEnabled ? 'right-1' : 'left-1'}`} />
            </div>
          </button>

          <button 
            onClick={handleFullBackup}
            disabled={backingUp}
            className="w-full py-5 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-[28px] font-medium flex items-center justify-center gap-3 hover:border-[#EADFD4] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Download size={20} />
            <span>{backingUp ? 'Gerando backup...' : 'Backup Completo (JSON)'}</span>
          </button>

          <button 
            onClick={handleClearStuckSlots}
            disabled={clearingSlots}
            className="w-full py-5 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-[28px] font-medium flex items-center justify-center gap-3 hover:border-[#EADFD4] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Calendar size={20} />
            <span>{clearingSlots ? 'Verificando...' : 'Destravar Horários da Agenda'}</span>
          </button>
        </div>
      </div>
      )}

      {settingsTab === 'gestao' && isAdminUser && (
      <>
      <div className="mt-8 bg-white rounded-[40px] border border-[#F5F2F0] p-10">
        <h3 className="serif text-2xl text-[#4A433D] mb-2">Procedimentos</h3>
        <p className="text-xs text-[#9CA3AF] font-light mb-8">
          Cadastre aqui os procedimentos oferecidos, com o valor cobrado por cada um. Depois, vincule
          substâncias a cada procedimento na seção abaixo.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-8">
          <input
            value={newProcedureName}
            onChange={e => setNewProcedureName(e.target.value)}
            placeholder="Nome do procedimento (ex: Preenchimento Labial)"
            className="bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
          />
          <input
            value={newProcedurePrice}
            onChange={e => setNewProcedurePrice(e.target.value)}
            placeholder="R$"
            inputMode="decimal"
            className="bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm w-full md:w-28"
          />
          <button
            onClick={() => {
              const price = parseCurrencyInput(newProcedurePrice);
              if (!newProcedureName.trim() || !price || price <= 0) {
                showToast('Preencha nome e um valor válido', 'error');
                return;
              }
              handleAddProcedure({ name: newProcedureName.trim(), price });
              setNewProcedureName('');
              setNewProcedurePrice('');
            }}
            className="bg-[#EADFD4] text-white rounded-2xl px-6 py-4 text-[10px] font-bold uppercase tracking-widest hover:bg-[#DFCFBF] transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Adicionar
          </button>
        </div>

        <div className="space-y-2">
          {(settings.procedures || []).map(proc => (
            <div key={proc.id} className="flex items-center justify-between p-4 bg-[#FDFBF9] rounded-2xl">
              <div>
                <p className="text-sm text-[#4A433D] font-medium">{proc.name}</p>
                <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest">
                  R$ {proc.price.toFixed(2).replace('.', ',')}
                  {' · '}
                  {(settings.substances || []).filter(s => s.procedureIds.includes(proc.id)).length} substância(s) vinculada(s)
                  {' · '}
                  {(proc.insumoKit || []).length} insumo(s) no kit
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openKitEditor(proc)} className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-[#8BA888] hover:text-[#7C9979] border border-[#F0F7F0] rounded-xl bg-[#F0F7F0]">
                  Kit de Insumos
                </button>
                <button onClick={() => handleDeleteProcedure(proc.id)} className="p-2 text-[#9CA3AF] hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {(!settings.procedures || settings.procedures.length === 0) && (
            <p className="text-xs text-[#9CA3AF] italic text-center py-6">Nenhum procedimento cadastrado ainda.</p>
          )}
        </div>
      </div>

      <div className="mt-8 bg-white rounded-[40px] border border-[#F5F2F0] p-10">
        <h3 className="serif text-2xl text-[#4A433D] mb-2">Substâncias</h3>
        <p className="text-xs text-[#9CA3AF] font-light mb-8">
          Cadastre as substâncias (marcas, produtos) e vincule a quais procedimentos cada uma se aplica.
          Se um procedimento tiver mais de uma substância vinculada, o sistema pergunta qual foi usada
          na hora de marcar na anamnese do paciente.
        </p>

        {(settings.procedures || []).length === 0 ? (
          <p className="text-xs text-[#9CA3AF] italic text-center py-6">Cadastre ao menos um procedimento acima antes de adicionar substâncias.</p>
        ) : (
          <>
            <div className="space-y-3 mb-8 p-6 bg-[#FDFBF9] rounded-[28px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={newSubstance.name}
                  onChange={e => setNewSubstance({ ...newSubstance, name: e.target.value })}
                  placeholder="Nome da substância (ex: Restylane, Juvederm...)"
                  className="bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
                <select
                  value={newSubstance.unit}
                  onChange={e => setNewSubstance({ ...newSubstance, unit: e.target.value as any })}
                  className="bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                >
                  <option value="ml">Por ml</option>
                  <option value="unidade">Por unidade</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Vincular a quais procedimentos</p>
                <div className="flex flex-wrap gap-2">
                  {(settings.procedures || []).map(proc => {
                    const active = newSubstance.procedureIds.includes(proc.id);
                    return (
                      <button
                        key={proc.id}
                        onClick={() => {
                          const next = active
                            ? newSubstance.procedureIds.filter(id => id !== proc.id)
                            : [...newSubstance.procedureIds, proc.id];
                          setNewSubstance({ ...newSubstance, procedureIds: next });
                        }}
                        className={`text-xs px-4 py-2 rounded-xl border transition-all ${active ? 'bg-[#8BA888] border-[#8BA888] text-white' : 'bg-white border-[#F5F2F0] text-[#9CA3AF]'}`}
                      >
                        {proc.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => {
                  if (!newSubstance.name.trim()) {
                    showToast('Preencha o nome da substância', 'error');
                    return;
                  }
                  if (newSubstance.procedureIds.length === 0) {
                    showToast('Vincule a substância a ao menos um procedimento', 'error');
                    return;
                  }
                  handleAddSubstance({ name: newSubstance.name.trim(), unit: newSubstance.unit, procedureIds: newSubstance.procedureIds });
                  setNewSubstance({ name: '', unit: 'ml', procedureIds: [] });
                }}
                className="w-full bg-[#EADFD4] text-white rounded-2xl px-6 py-4 text-[10px] font-bold uppercase tracking-widest hover:bg-[#DFCFBF] transition-all flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Adicionar Substância
              </button>
            </div>

            <div className="space-y-2">
              {(settings.substances || []).map(sub => (
                <div key={sub.id} className="flex items-center justify-between p-4 bg-[#FDFBF9] rounded-2xl">
                  <div>
                    <p className="text-sm text-[#4A433D] font-medium">{sub.name}</p>
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest">
                      {sub.unit}
                      {' · '}
                      {sub.procedureIds.map(pid => (settings.procedures || []).find(p => p.id === pid)?.name).filter(Boolean).join(', ') || 'sem vínculo'}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteSubstance(sub.id)} className="p-2 text-[#9CA3AF] hover:text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {(!settings.substances || settings.substances.length === 0) && (
                <p className="text-xs text-[#9CA3AF] italic text-center py-6">Nenhuma substância cadastrada ainda.</p>
              )}
            </div>
          </>
        )}
      </div>
      </>
      )}

      {settingsTab === 'gestao' && isAdminUser && (
      <>
      <div className="mt-8">
        <AdminPanel user={user} />
      </div>

      <div className="mt-8">
        <PatientBackup user={user} />
      </div>
      </>
      )}

      <AnimatePresence>
        {(isAddingTemplate || editingTemplate) && (
          <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="serif text-2xl text-[#4A433D]">{editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Termo'}</h2>
                <button onClick={() => { setIsAddingTemplate(false); setEditingTemplate(null); }} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
              </div>
              <TemplateForm 
                template={editingTemplate} 
                onSave={handleSaveTemplate} 
                onCancel={() => { setIsAddingTemplate(false); setEditingTemplate(null); }} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isAddingRxTemplate || editingRxTemplate) && (
          <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="serif text-2xl text-[#4A433D]">{editingRxTemplate ? 'Editar Modelo de Receita' : 'Novo Modelo de Receita'}</h2>
                <button onClick={() => { setIsAddingRxTemplate(false); setEditingRxTemplate(null); }} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
              </div>
              <RxTemplateForm
                template={editingRxTemplate}
                onSave={handleSaveRxTemplate}
                onCancel={() => { setIsAddingRxTemplate(false); setEditingRxTemplate(null); }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showSignaturePad && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="serif text-2xl text-[#4A433D]">Assinar</h3>
              <button onClick={() => { setShowSignaturePad(false); profileSigPad.current?.clear(); }} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
            </div>
            <div className="bg-[#FDFBF9] rounded-[28px] border-2 border-[#F5F2F0] overflow-hidden relative mb-6">
              <SignaturePad ref={profileSigPad} canvasProps={{ className: 'w-full h-40' }} backgroundColor="#FDFBF9" />
              <button onClick={() => profileSigPad.current?.clear()} className="absolute top-3 right-3 p-2 bg-white rounded-full text-[#9CA3AF] hover:text-[#4A433D] shadow-sm">
                <RotateCcw size={16} />
              </button>
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setShowSignaturePad(false); profileSigPad.current?.clear(); }} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
              <button
                onClick={handleSaveDrawnSignature}
                disabled={savingSignature}
                className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all disabled:opacity-50"
              >
                {savingSignature ? 'Salvando...' : 'Salvar Assinatura'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {editingKitProcId && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white w-full max-w-lg max-h-[85vh] rounded-[40px] p-10 shadow-2xl overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="serif text-2xl text-[#4A433D]">Kit de Insumos</h3>
              <button onClick={() => { setEditingKitProcId(null); setKitDraft([]); }} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
            </div>
            <p className="text-xs text-[#9CA3AF] font-light mb-6">
              Marque os insumos e a substância usados por sessão desse procedimento (agulha, luva, gaze, toxina,
              preenchedor...) e a quantidade de cada um. Ao aceitar um orçamento com esse procedimento, essa
              quantidade é debitada do estoque automaticamente.
            </p>
            {inventoryItems.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] italic text-center py-10">Cadastre itens no Estoque antes de montar o kit.</p>
            ) : (
              <div className="space-y-2">
                {inventoryItems.map(item => {
                  const inKit = kitDraft.find(k => k.itemId === item.id);
                  return (
                    <div key={item.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${inKit ? 'bg-[#F0F7F0] border-[#8BA888]/30' : 'bg-[#FDFBF9] border-[#F5F2F0]'}`}>
                      <label className="flex items-center gap-3 flex-1 cursor-pointer">
                        <input type="checkbox" checked={!!inKit} onChange={() => toggleKitItem(item)} className="w-4 h-4 accent-[#8BA888]" />
                        <span className="text-sm text-[#4A433D]">{item.name}</span>
                      </label>
                      {inKit && (
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={inKit.quantity}
                          onChange={e => updateKitQuantity(item.id!, parseFloat(e.target.value) || 0.01)}
                          className="w-20 bg-white border border-[#F5F2F0] rounded-xl p-2 text-sm text-center outline-none"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-4 pt-6">
              <button onClick={() => { setEditingKitProcId(null); setKitDraft([]); }} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
              <button onClick={handleSaveKit} className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all">
                Salvar Kit
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
          >
            <h3 className="serif text-xl text-[#4A433D] mb-2">
              {settings.pinHash ? 'Alterar PIN' : 'Definir PIN'}
            </h3>
            <p className="text-xs text-[#9CA3AF] font-light mb-6">
              Escolha 6 números. Esse PIN será exigido, além do login com Google, sempre que o app abrir.
            </p>
            <div className="space-y-4">
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinDraft}
                onChange={e => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Novo PIN (6 dígitos)"
                className="w-full bg-[#FDFBF9] border border-[#F1F3F5] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-center tracking-[0.5em] text-lg"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Confirme o PIN"
                className="w-full bg-[#FDFBF9] border border-[#F1F3F5] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-center tracking-[0.5em] text-lg"
              />
            </div>
            <div className="flex gap-4 pt-6">
              <button
                onClick={() => setShowPinModal(false)}
                className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase"
              >
                Cancelar
              </button>
              <button
                disabled={savingPin}
                onClick={handleSavePin}
                className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all disabled:opacity-50"
              >
                {savingPin ? 'Salvando...' : 'Salvar PIN'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <p className="text-center text-[10px] text-[#D6C7B8] font-light pt-8 pb-4">
        Versão {APP_VERSION}
      </p>
    </div>
  );
}

function ToggleButton({ active, onClick, label, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="text-white/40 group-hover:text-white/60 transition-colors">{icon}</div>
        <span className="text-sm font-light">{label}</span>
      </div>
      <div className={`w-10 h-5 rounded-full relative transition-colors ${active ? 'bg-[#F0F7F0]' : 'bg-white/20'}`}>
        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${active ? 'right-1' : 'left-1'}`} />
      </div>
    </button>
  );
}

function RxTemplateForm({ template, onSave, onCancel }: { template: PrescriptionTemplate | null; onSave: (t: PrescriptionTemplate) => void; onCancel: () => void }) {
  const [name, setName] = useState(template?.name || '');
  const [medicines, setMedicines] = useState<{ name: string; dosage: string; instructions: string }[]>(
    template?.medicines?.length ? template.medicines : [{ name: '', dosage: '', instructions: '' }]
  );

  const updateMedicine = (i: number, field: string, value: string) => {
    const next = [...medicines];
    (next[i] as any)[field] = value;
    setMedicines(next);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      showToast('Preencha o nome do modelo', 'error');
      return;
    }
    const validMedicines = medicines.filter(m => m.name.trim());
    if (validMedicines.length === 0) {
      showToast('Adicione ao menos um medicamento', 'error');
      return;
    }
    onSave({ id: template?.id, name: name.trim(), medicines: validMedicines });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Nome do Modelo</label>
        <input
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#4A433D]"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="ex: Protocolo Pós-Toxina"
        />
      </div>

      <div className="space-y-4">
        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest ml-1">Medicamentos</label>
        {medicines.map((m, i) => (
          <div key={i} className="p-4 bg-[#FDFBF9] rounded-2xl space-y-2 relative">
            {medicines.length > 1 && (
              <button onClick={() => setMedicines(medicines.filter((_, idx) => idx !== i))} className="absolute top-3 right-3 text-[#9CA3AF] hover:text-red-400">
                <Trash2 size={14} />
              </button>
            )}
            <input
              className="w-full bg-white border border-[#F5F2F0] rounded-xl p-3 outline-none text-sm"
              value={m.name}
              onChange={e => updateMedicine(i, 'name', e.target.value)}
              placeholder="Nome do medicamento"
            />
            <input
              className="w-full bg-white border border-[#F5F2F0] rounded-xl p-3 outline-none text-sm"
              value={m.dosage}
              onChange={e => updateMedicine(i, 'dosage', e.target.value)}
              placeholder="Dosagem (ex: 500mg, 1 comprimido)"
            />
            <input
              className="w-full bg-white border border-[#F5F2F0] rounded-xl p-3 outline-none text-sm"
              value={m.instructions}
              onChange={e => updateMedicine(i, 'instructions', e.target.value)}
              placeholder="Instruções (ex: a cada 8 horas por 5 dias)"
            />
          </div>
        ))}
        <button
          onClick={() => setMedicines([...medicines, { name: '', dosage: '', instructions: '' }])}
          className="text-[#EADFD4] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:text-[#9CA3AF]"
        >
          <Plus size={14} /> Adicionar Medicamento
        </button>
      </div>

      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
        <button onClick={handleSubmit} className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all">
          Salvar Modelo
        </button>
      </div>
    </div>
  );
}

function TemplateForm({ template, onSave, onCancel }: any) {
  const [title, setTitle] = useState(template?.title || '');
  const [content, setContent] = useState(template?.content || '');

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Título do Documento</label>
        <input 
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#4A433D]"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="ex: Termo de Consentimento - Preenchimento"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Texto do Modelo</label>
        <textarea 
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#4A433D] min-h-[250px] resize-none"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Digite o texto. Use [NOME DO PACIENTE] para substituição automática."
        />
      </div>
      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase tracking-widest">Cancelar</button>
        <button 
          onClick={() => onSave({ ...template, title, content })}
          className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#DFCFBF]"
        >
          Salvar Modelo
        </button>
      </div>
    </div>
  );
}

function SettingField({ label, value, onChange, icon }: any) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest ml-1">{label}</label>
      <div className="relative flex items-center">
        <div className="absolute left-4 text-[#9CA3AF]">{icon}</div>
        <input 
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#4A433D] shadow-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

import { Settings as SettingsIcon, Phone, FileDown } from 'lucide-react';
