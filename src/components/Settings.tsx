import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
  CreditCard
} from 'lucide-react';
import { showToast } from '../lib/toast';

export default function Settings({ user }: { user: User }) {
  const [settings, setSettings] = useState<ClinicSettings>({
    professionalName: 'Dra. Vitória Oliveira',
    registrationNumber: '',
    clinicName: 'Dra. Vitória Oliveira',
    clinicAddress: '',
    contactEmail: user.email || '',
    consentTemplates: [],
    biometricEnabled: false,
    cloudBackupEnabled: true,
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
          setSettings(docSnap.data() as ClinicSettings);
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

  const toggleBiometric = () => persist({ ...settings, biometricEnabled: !settings.biometricEnabled });
  const toggleCloudBackup = () => persist({ ...settings, cloudBackupEnabled: !settings.cloudBackupEnabled });

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', user.uid), settings);
      showToast('Configurações atualizadas');
    } catch (err) {
      showToast('Erro ao salvar', 'error');
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="py-20 text-center text-[#B4A08C] font-light italic">Carregando configurações...</div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div className="flex items-center gap-6">
        <div className="p-4 bg-[#FAF7F2] rounded-3xl text-[#D1C7BD] border border-[#F2EEE9]">
          <SettingsIcon className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-light text-[#4A4644] serif">Configurações</h1>
          <p className="text-[#B4A08C] font-light text-xs uppercase tracking-widest mt-1">Personalização & Segurança da Clínica</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Professional Profile */}
          <section className="bg-white rounded-[40px] p-10 border border-[#F2EEE9] card-shadow">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FAF7F2] rounded-2xl text-[#B4A08C]">
                <UserIcon size={24} />
              </div>
              <h3 className="text-xl font-light text-[#4A4644] serif">Identificação Profissional</h3>
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
          <section className="bg-white rounded-[40px] p-10 border border-[#F2EEE9] card-shadow">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FAF7F2] rounded-2xl text-[#B4A08C]">
                <Building2 size={24} />
              </div>
              <h3 className="text-xl font-light text-[#4A4644] serif">Sobre o Consultório</h3>
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
            </div>
          </section>

          {/* Consent Templates */}
          <section className="bg-white rounded-[40px] p-10 border border-[#F2EEE9] card-shadow">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#FAF7F2] rounded-2xl text-[#B4A08C]">
                  <FileText size={24} />
                </div>
                <h3 className="text-xl font-light text-[#4A4644] serif">Modelos de Consentimento</h3>
              </div>
              <button 
                onClick={() => setIsAddingTemplate(true)}
                className="text-[#D1C7BD] text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:text-[#B4A08C] transition-colors"
              >
                <Plus size={16} /> Adicionar Modelo
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(settings.consentTemplates || []).map(template => (
                <div key={template.id} className="p-6 bg-[#FAF7F2] border border-[#F2EEE9] rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-[#B4A08C]" />
                    <span className="text-sm font-medium text-[#4A4644]">{template.title}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => setEditingTemplate(template)} className="p-2 text-[#B4A08C] hover:text-[#4A4644]"><Edit2 size={16} /></button>
                    <button onClick={() => handleDeleteTemplate(template.id!)} className="p-2 text-[#B4A08C] hover:text-[#8D6B6B]"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {(!settings.consentTemplates || settings.consentTemplates.length === 0) && (
                <p className="col-span-2 text-center py-10 text-sm text-[#B4A08C] font-light italic">Nenhum modelo de termo cadastrado.</p>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          <div className="bg-[#4A4644] text-white rounded-[40px] p-10 shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <Shield size={20} className="text-[#D1C7BD]" />
                <h3 className="text-lg font-light serif">Segurança</h3>
              </div>
              
              <div className="space-y-4">
                <ToggleButton 
                  active={settings.biometricEnabled} 
                  onClick={toggleBiometric}
                  label="Acesso Biométrico"
                  icon={<Fingerprint size={18} />}
                />
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
            className="w-full py-5 bg-[#D1C7BD] text-white rounded-[28px] font-medium flex items-center justify-center gap-3 hover:bg-[#D1C7BD]/90 transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            <Save size={20} />
            <span>{saving ? 'Gravando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {(isAddingTemplate || editingTemplate) && (
          <div className="fixed inset-0 bg-[#4A443F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-2xl rounded-[40px] p-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="serif text-2xl text-[#4A4644]">{editingTemplate ? 'Editar Modelo' : 'Novo Modelo de Termo'}</h2>
                <button onClick={() => { setIsAddingTemplate(false); setEditingTemplate(null); }} className="text-[#B4A08C] hover:text-[#4A4644]"><X size={24} /></button>
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
      <div className={`w-10 h-5 rounded-full relative transition-colors ${active ? 'bg-[#D4E2D4]' : 'bg-white/20'}`}>
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
        <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Título do Documento</label>
        <input 
          className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light text-[#4A4644]"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="ex: Termo de Consentimento - Preenchimento"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest mb-2 ml-1">Texto do Modelo</label>
        <textarea 
          className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-2xl p-4 outline-none focus:border-[#D1C7BD] transition-all font-light text-[#4A4644] min-h-[250px] resize-none"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Digite o texto. Use [NOME DO PACIENTE] para substituição automática."
        />
      </div>
      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 py-4 text-[#B4A08C] font-bold text-[10px] uppercase tracking-widest">Cancelar</button>
        <button 
          onClick={() => onSave({ ...template, title, content })}
          className="flex-1 py-4 bg-[#D1C7BD] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#D1C7BD]/90"
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
      <label className="block text-[10px] font-bold text-[#B4A08C] uppercase tracking-widest ml-1">{label}</label>
      <div className="relative flex items-center">
        <div className="absolute left-4 text-[#B4A08C]">{icon}</div>
        <input 
          className="w-full bg-[#FAF7F2] border border-[#F2EEE9] rounded-2xl p-4 pl-12 outline-none focus:border-[#D1C7BD] transition-all font-light text-[#4A4644] shadow-inner"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

import { Settings as SettingsIcon } from 'lucide-react';
