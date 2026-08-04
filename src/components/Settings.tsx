import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ClinicSettings, ConsentTemplate } from '../types';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
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
  Download
} from 'lucide-react';
import { showToast } from '../lib/toast';
import { hashPin, isValidPinFormat } from '../lib/pin';
import { getClinicOwnerId } from '../lib/slots';
import { isPlatformAuthenticatorAvailable, registerBiometric } from '../lib/webauthn';
import AdminPanel from './AdminPanel';
import ProfessionalScheduleManager from './ProfessionalScheduleManager';
import PatientBackup from './PatientBackup';

export default function Settings({ user }: { user: User }) {
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [settingsTab, setSettingsTab] = useState<'perfil' | 'gestao'>('perfil');
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
  const [newProcedureName, setNewProcedureName] = useState('');
  const [newProcedurePrice, setNewProcedurePrice] = useState('');
  const [newSubstance, setNewSubstance] = useState<{ name: string; unit: 'ml' | 'unidade'; pricePerUnit: string; ampouleSize: string; procedureIds: string[] }>({ name: '', unit: 'ml', pricePerUnit: '', ampouleSize: '', procedureIds: [] });

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

  const handleDeleteTemplate = (id: string) => {
    if (!window.confirm('Excluir este modelo de termo?')) return;
    persist({ ...settings, consentTemplates: (settings.consentTemplates || []).filter(t => t.id !== id) });
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

  const handleAddSubstance = (item: { name: string; unit: 'ml' | 'unidade'; pricePerUnit: number; ampouleSize?: number; procedureIds: string[] }) => {
    const next = [...(settings.substances || []), { ...item, id: crypto.randomUUID() }];
    persist({ ...settings, substances: next });
    showToast('Substância adicionada');
  };

  const handleDeleteSubstance = (id: string) => {
    if (!window.confirm('Excluir esta substância?')) return;
    persist({ ...settings, substances: (settings.substances || []).filter(s => s.id !== id) });
    showToast('Substância removida');
  };


  const handleToggleSecurityPin = () => {
    if (!settings.biometricEnabled && !settings.pinHash) {
      showToast('Defina um PIN antes de ativar', 'error');
      setPinDraft('');
      setPinConfirm('');
      setShowPinModal(true);
      return;
    }
    persist({ ...settings, biometricEnabled: !settings.biometricEnabled });
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

  const toggleCloudBackup = () => persist({ ...settings, cloudBackupEnabled: !settings.cloudBackupEnabled });

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

      <div className="flex gap-3">
        <button
          onClick={() => setSettingsTab('perfil')}
          className={`px-6 py-3 rounded-2xl text-sm font-medium transition-all ${
            settingsTab === 'perfil' ? 'bg-[#4A433D] text-white' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
          }`}
        >
          Perfil
        </button>
        {isAdminUser && (
          <button
            onClick={() => setSettingsTab('gestao')}
            className={`px-6 py-3 rounded-2xl text-sm font-medium transition-all ${
              settingsTab === 'gestao' ? 'bg-[#4A433D] text-white' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0] hover:border-[#EADFD4]/40'
            }`}
          >
            Gestão da Clínica
          </button>
        )}
      </div>

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
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
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
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          <div className="bg-[#4A433D] text-white rounded-[40px] p-10 shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <Shield size={20} className="text-[#EADFD4]" />
                <h3 className="text-lg font-light serif">Segurança</h3>
              </div>
              
              <div className="space-y-4">
                <ToggleButton 
                  active={settings.biometricEnabled} 
                  onClick={handleToggleSecurityPin}
                  label="PIN de Segurança"
                  icon={<Fingerprint size={18} />}
                />
                <button
                  onClick={() => { setPinDraft(''); setPinConfirm(''); setShowPinModal(true); }}
                  className="w-full flex items-center gap-3 px-6 py-4 bg-white/10 rounded-2xl text-white text-xs font-semibold hover:bg-white/15 transition-all"
                >
                  <Fingerprint size={16} className="text-[#EADFD4]" />
                  {settings.pinHash ? 'Alterar PIN' : 'Definir PIN'}
                </button>
                <ToggleButton 
                  active={settings.cloudBackupEnabled} 
                  onClick={toggleCloudBackup}
                  label="Backup em Nuvem"
                  icon={<Cloud size={18} />}
                />
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
              const price = parseFloat(newProcedurePrice.replace(',', '.'));
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
                </p>
              </div>
              <button onClick={() => handleDeleteProcedure(proc.id)} className="p-2 text-[#9CA3AF] hover:text-red-400">
                <Trash2 size={16} />
              </button>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                <input
                  value={newSubstance.pricePerUnit}
                  onChange={e => setNewSubstance({ ...newSubstance, pricePerUnit: e.target.value })}
                  placeholder="R$ por ml/unidade"
                  inputMode="decimal"
                  className="bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
                <input
                  value={newSubstance.ampouleSize}
                  onChange={e => setNewSubstance({ ...newSubstance, ampouleSize: e.target.value })}
                  placeholder="Quantos ml/UI tem a ampola? (opcional)"
                  inputMode="decimal"
                  className="bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
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
                  const price = parseFloat(newSubstance.pricePerUnit.replace(',', '.'));
                  if (!newSubstance.name.trim() || !price || price <= 0) {
                    showToast('Preencha nome e um valor válido', 'error');
                    return;
                  }
                  if (newSubstance.procedureIds.length === 0) {
                    showToast('Vincule a substância a ao menos um procedimento', 'error');
                    return;
                  }
                  const ampouleSize = newSubstance.ampouleSize ? parseFloat(newSubstance.ampouleSize.replace(',', '.')) : undefined;
                  handleAddSubstance({ name: newSubstance.name.trim(), unit: newSubstance.unit, pricePerUnit: price, ampouleSize: ampouleSize && ampouleSize > 0 ? ampouleSize : undefined, procedureIds: newSubstance.procedureIds });
                  setNewSubstance({ name: '', unit: 'ml', pricePerUnit: '', ampouleSize: '', procedureIds: [] });
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
                      R$ {sub.pricePerUnit.toFixed(2).replace('.', ',')} por {sub.unit}
                      {sub.ampouleSize ? ` · ampola com ${sub.ampouleSize} ${sub.unit}` : ''}
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
