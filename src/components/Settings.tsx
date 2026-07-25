import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ClinicSettings, ConsentTemplate } from '../types';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
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
  CreditCard,
  Download
} from 'lucide-react';
import { showToast } from '../lib/toast';
import { hashPin, isValidPinFormat } from '../lib/pin';

export default function Settings({ user }: { user: User }) {
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
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ConsentTemplate | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as ClinicSettings;
          setSettings(data);
          // Garante que a página pública de agendamento sempre tenha o nome atualizado,
          // mesmo que o usuário nunca clique em "Salvar" depois desta atualização.
          await setDoc(doc(db, 'publicConfig', 'booking'), {
            ownerId: user.uid,
            clinicName: data.clinicName || data.professionalName || 'Clínica',
            professionalName: data.professionalName || '',
            whatsappNumber: data.whatsappNumber || ''
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
      await setDoc(doc(db, 'settings', user.uid), next);
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

  const toggleCloudBackup = () => persist({ ...settings, cloudBackupEnabled: !settings.cloudBackupEnabled });

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', user.uid), settings);
      // Mantém o config público (usado pela página de agendamento sem login) sincronizado
      await setDoc(doc(db, 'publicConfig', 'booking'), {
        ownerId: user.uid,
        clinicName: settings.clinicName || settings.professionalName || 'Clínica',
        professionalName: settings.professionalName || '',
        whatsappNumber: settings.whatsappNumber || ''
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
      const collections = ['patients', 'appointments', 'transactions', 'inventory', 'inventoryMovements'];
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
        const q = query(collection(db, col), where('userId', '==', user.uid));
        const snap = await getDocs(q);
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

  if (loading) return (
    <div className="py-20 text-center text-[#9CA3AF] font-light italic">Carregando configurações...</div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div className="flex items-center gap-6">
        <div className="p-4 bg-[#FDFBF9] rounded-3xl text-[#EADFD4] border border-[#F5F2F0]">
          <SettingsIcon className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-light text-[#5C544E] serif">Configurações</h1>
          <p className="text-[#9CA3AF] font-light text-xs uppercase tracking-widest mt-1">Personalização & Segurança da Clínica</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Professional Profile */}
          <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
                <UserIcon size={24} />
              </div>
              <h3 className="text-xl font-light text-[#5C544E] serif">Identificação Profissional</h3>
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

          {/* Clinic Info */}
          <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
                <Building2 size={24} />
              </div>
              <h3 className="text-xl font-light text-[#5C544E] serif">Sobre o Consultório</h3>
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

          {/* Consent Templates */}
          <section className="bg-white rounded-[40px] p-10 border border-[#F5F2F0] shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#FDFBF9] rounded-2xl text-[#9CA3AF]">
                  <FileText size={24} />
                </div>
                <h3 className="text-xl font-light text-[#5C544E] serif">Modelos de Consentimento</h3>
              </div>
              <button 
                onClick={() => setIsAddingTemplate(true)}
                className="text-[#EADFD4] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:text-[#9CA3AF] transition-colors"
              >
                <Plus size={16} /> Adicionar Modelo
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(settings.consentTemplates || []).map(template => (
                <div key={template.id} className="p-6 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-[#9CA3AF]" />
                    <span className="text-sm font-medium text-[#5C544E]">{template.title}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => setEditingTemplate(template)} className="p-2 text-[#9CA3AF] hover:text-[#5C544E]"><Edit2 size={16} /></button>
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
          <div className="bg-[#5C544E] text-white rounded-[40px] p-10 shadow-xl relative overflow-hidden">
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
              </div>
            </div>
            <div className="absolute right-0 bottom-0 w-32 h-32 bg-white/5 rounded-full translate-x-1/2 translate-y-1/2" />
          </div>

          <button 
            onClick={handleSaveAll}
            disabled={saving}
            className="w-full py-5 bg-[#EADFD4] text-white rounded-[28px] font-medium flex items-center justify-center gap-3 hover:bg-[#DFCFBF] transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            <Save size={20} />
            <span>{saving ? 'Gravando...' : 'Salvar Alterações'}</span>
          </button>

          <button 
            onClick={handleFullBackup}
            disabled={backingUp}
            className="w-full py-5 bg-white border border-[#F5F2F0] text-[#5C544E] rounded-[28px] font-medium flex items-center justify-center gap-3 hover:border-[#EADFD4] transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Download size={20} />
            <span>{backingUp ? 'Gerando backup...' : 'Backup Completo (JSON)'}</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {(isAddingTemplate || editingTemplate) && (
          <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="serif text-2xl text-[#5C544E]">{editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Termo'}</h2>
                <button onClick={() => { setIsAddingTemplate(false); setEditingTemplate(null); }} className="text-[#9CA3AF] hover:text-[#5C544E]"><X size={24} /></button>
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
        <div className="fixed inset-0 bg-[#5C544E]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
          >
            <h3 className="serif text-xl text-[#5C544E] mb-2">
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
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#5C544E]"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="ex: Termo de Consentimento - Preenchimento"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Texto do Modelo</label>
        <textarea 
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#5C544E] min-h-[250px] resize-none"
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
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#5C544E] shadow-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

import { Settings as SettingsIcon, Phone } from 'lucide-react';
