import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ClinicSettings } from '../types';
import { User } from 'firebase/auth';
import { motion } from 'motion/react';
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
  Trash2
} from 'lucide-react';

export default function Settings({ user }: { user: User }) {
  const [settings, setSettings] = useState<ClinicSettings>({
    professionalName: 'Dra. Vitória Oliveira',
    registrationNumber: '',
    clinicName: 'Clínica Digital',
    clinicAddress: '',
    contactEmail: 'contato.dravitoriaoliveira@gmail.com'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const docRef = doc(db, 'settings', 'profile');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSettings(docSnap.data() as ClinicSettings);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'profile'), settings);
      alert('Configurações salvas!');
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extralight text-[#4A4644]">Configurações</h1>
        <p className="text-[#B4A08C] font-light mt-1">Personalize sua clínica e gerencie sua conta.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          {/* Profile Section */}
          <div className="bg-white rounded-[32px] p-8 border border-[#F2EEE9] shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FAF7F2] rounded-2xl text-[#B4A08C]">
                <UserIcon size={24} />
              </div>
              <h3 className="text-xl font-light text-[#4A4644]">Identificação Profissional</h3>
            </div>
            
            <div className="space-y-6">
              <SettingField 
                label="Nome do Profissional" 
                value={settings.professionalName} 
                onChange={v => setSettings({...settings, professionalName: v})}
                icon={<UserIcon size={18} />}
              />
              <SettingField 
                label="Registro Profissional (CRM/CRO)" 
                value={settings.registrationNumber} 
                onChange={v => setSettings({...settings, registrationNumber: v})}
                icon={<Hash size={18} />}
              />
            </div>
          </div>

          {/* Clinic Section */}
          <div className="bg-white rounded-[32px] p-8 border border-[#F2EEE9] shadow-sm">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-[#FAF7F2] rounded-2xl text-[#B4A08C]">
                <Building2 size={24} />
              </div>
              <h3 className="text-xl font-light text-[#4A4644]">Informações da Clínica</h3>
            </div>
            
            <div className="space-y-6">
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
          </div>

          {/* Consent Templates Section */}
          <div className="bg-white rounded-[32px] p-8 border border-[#F2EEE9] shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#FAF7F2] rounded-2xl text-[#B4A08C]">
                  <FileText size={24} />
                </div>
                <h3 className="text-xl font-light text-[#4A4644]">Modelos de Consentimento</h3>
              </div>
              <button className="text-[#D1C7BD] text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Plus size={16} /> Adicionar Modelo
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-[#B4A08C]" />
                  <span className="text-sm font-light text-[#4A4644]">Cirurgia Buco-Maxilo</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 text-[#B4A08C] hover:text-[#4A4644]"><Edit2 size={16} /></button>
                  <button className="p-2 text-[#B4A08C] hover:text-[#8D6B6B]"><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="p-4 bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-[#B4A08C]" />
                  <span className="text-sm font-light text-[#4A4644]">Bioestimuladores de Colágeno</span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 text-[#B4A08C] hover:text-[#4A4644]"><Edit2 size={16} /></button>
                  <button className="p-2 text-[#B4A08C] hover:text-[#8D6B6B]"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security & System */}
        <div className="space-y-6">
          <div className="bg-[#4A4644] text-white rounded-[32px] p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <Shield size={20} className="text-white/60" />
              <h3 className="text-lg font-light">Segurança</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                <div className="flex items-center gap-3">
                  <Fingerprint size={18} className="text-white/40" />
                  <span className="text-sm font-light">Biometria</span>
                </div>
                <div className="w-10 h-5 bg-white/20 rounded-full relative">
                  <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                <div className="flex items-center gap-3">
                  <Cloud size={18} className="text-white/40" />
                  <span className="text-sm font-light">Backup Nuvem</span>
                </div>
                <div className="w-10 h-5 bg-[#D4E2D4] rounded-full relative">
                  <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-[#D1C7BD] text-white rounded-[24px] font-light flex items-center justify-center gap-3 hover:bg-[#D1C7BD]/90 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Save size={20} />
            <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingField({ label, value, onChange, icon }: any) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-[#B4A08C] uppercase tracking-[0.2em] mb-2 ml-1">{label}</label>
      <div className="relative flex items-center">
        <div className="absolute left-4 text-[#B4A08C]">{icon}</div>
        <input 
          className="w-full bg-[#FDFBF9] border border-[#F2EEE9] rounded-2xl p-4 pl-12 outline-none focus:border-[#D1C7BD] transition-colors font-light text-[#4A4644]"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
