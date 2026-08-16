import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, addDoc, updateDoc, deleteField, writeBatch } from 'firebase/firestore';
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
  RotateCcw,
  QrCode,
  ExternalLink,
  Receipt
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
  const [newSubstance, setNewSubstance] = useState<{ name: string; unit: 'ml' | 'unidade'; procedureIds: string[]; sharedAcrossPatients: boolean }>({ name: '', unit: 'ml', procedureIds: [], sharedAcrossPatients: false });
  const [catalogTab, setCatalogTab] = useState<'substancias' | 'insumos'>('substancias');
  const [newInsumo, setNewInsumo] = useState({ name: '', category: '', unit: 'Unidades', purchasedByBox: false, unitsPerBox: '', minThreshold: '' });
  const [savingInsumo, setSavingInsumo] = useState(false);
  const [editingInsumoId, setEditingInsumoId] = useState<string | null>(null);
  const [editInsumo, setEditInsumo] = useState({ name: '', category: '', unit: 'Unidades', purchasedByBox: false, unitsPerBox: '', minThreshold: '' });
  const [savingEditInsumo, setSavingEditInsumo] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);

  // Apaga TODOS os documentos de uma coleção, em lotes de até 450 (limite do Firestore é
  // 500 operações por lote) — usado só pelo "zerar dados de teste", nunca em nenhum
  // outro fluxo normal do app.
  const deleteAllInCollection = async (collectionName: string): Promise<number> => {
    const snap = await getDocs(collection(db, collectionName));
    const docs = snap.docs;
    let deleted = 0;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + 450);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deleted += chunk.length;
    }
    return deleted;
  };

  // Zera pacientes/prontuários e financeiro (era ambiente de teste) — mantém intactos
  // Estoque, Configurações (procedimentos/kits/dados da clínica) e login/administradores,
  // exatamente como confirmado. Inclui as coleções auxiliares ligadas a paciente
  // (agendamentos, índices de CPF/telefone, pedidos de assinatura, ficha enviada, avisos
  // de estoque por paciente, receita por procedimento) — sem isso, ficariam órfãs
  // referenciando pacientes que não existem mais, e os índices de CPF/telefone
  // impediriam recadastrar o mesmo CPF/telefone de teste de novo.
  const handleResetTestData = async () => {
    if (resetConfirmText !== 'APAGAR TUDO') return;
    setResetting(true);
    setResetResult(null);
    const collections = [
      'patients', 'appointments', 'busySlots', 'patientCpfIndex', 'patientPhoneIndex',
      'signRequests', 'intakeSubmissions', 'stockAlerts', 'procedureRevenue',
      'transactions', 'fixedCosts',
    ];
    const results: string[] = [];
    for (const c of collections) {
      try {
        const count = await deleteAllInCollection(c);
        results.push(`${c}: ${count} apagado(s)`);
      } catch (err: any) {
        results.push(`${c}: ERRO — ${err?.message || 'falhou'}`);
      }
    }
    setResetResult(results.join('\n'));
    setResetting(false);
    setShowResetConfirm(false);
    setResetConfirmText('');
    showToast('Dados de teste zerados — pacientes e financeiro apagados');
  };


  const openEditInsumo = (item: InventoryItem) => {
    setEditingInsumoId(item.id!);
    setEditInsumo({
      name: item.name,
      category: item.category,
      unit: item.unit,
      purchasedByBox: !!item.purchasedByBox,
      unitsPerBox: item.unitsPerBox ? String(item.unitsPerBox) : '',
      minThreshold: String(item.minThreshold),
    });
  };

  const handleSaveEditInsumo = async () => {
    if (!editingInsumoId) return;
    if (!editInsumo.name.trim()) {
      showToast('Preencha o nome do insumo', 'error');
      return;
    }
    const parsedUnitsPerBox = parseFloat(editInsumo.unitsPerBox) || 0;
    if (editInsumo.purchasedByBox && parsedUnitsPerBox <= 0) {
      showToast('Informe quantas unidades vêm em cada caixa', 'error');
      return;
    }
    setSavingEditInsumo(true);
    try {
      const updates: any = {
        name: editInsumo.name.trim(),
        category: editInsumo.category.trim() || 'Insumo',
        unit: editInsumo.unit,
        minThreshold: parseFloat(editInsumo.minThreshold) || 0,
      };
      if (editInsumo.purchasedByBox && parsedUnitsPerBox > 0) {
        updates.purchasedByBox = true;
        updates.unitsPerBox = parsedUnitsPerBox;
      } else {
        updates.purchasedByBox = false;
        updates.unitsPerBox = deleteField();
      }
      await updateDoc(doc(db, 'inventory', editingInsumoId), updates);
      showToast('Insumo atualizado');
      setEditingInsumoId(null);
    } catch (err) {
      showToast('Erro ao atualizar insumo', 'error');
    }
    setSavingEditInsumo(false);
  };

  const handleAddInsumo = async () => {
    if (!newInsumo.name.trim()) {
      showToast('Preencha o nome do insumo', 'error');
      return;
    }
    const parsedUnitsPerBox = parseFloat(newInsumo.unitsPerBox) || 0;
    if (newInsumo.purchasedByBox && parsedUnitsPerBox <= 0) {
      showToast('Informe quantas unidades vêm em cada caixa', 'error');
      return;
    }
    setSavingInsumo(true);
    try {
      // Nenhum valor (dinheiro nem caixa/unidade) é definido aqui no cadastro — isso só
      // é decidido no ato da compra, na aba Estoque. O aviso de estoque baixo já entra
      // direto em unidades, como a quantidade sempre é.
      await addDoc(collection(db, 'inventory'), {
        userId: user.uid,
        name: newInsumo.name.trim(),
        category: newInsumo.category.trim() || 'Insumo',
        quantity: 0,
        minThreshold: parseFloat(newInsumo.minThreshold) || 0,
        unit: newInsumo.unit,
        ...(newInsumo.purchasedByBox && parsedUnitsPerBox > 0 ? { purchasedByBox: true, unitsPerBox: parsedUnitsPerBox } : {}),
        updatedAt: new Date().toISOString(),
      });
      showToast('Insumo cadastrado — já disponível no Estoque');
      setNewInsumo({ name: '', category: '', unit: 'Unidades', purchasedByBox: false, unitsPerBox: '', minThreshold: '' });
    } catch (err) {
      showToast('Erro ao cadastrar insumo', 'error');
    }
    setSavingInsumo(false);
  };

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [editingKitProcId, setEditingKitProcId] = useState<string | null>(null);
  const [editingProcId, setEditingProcId] = useState<string | null>(null);
  const [editProcName, setEditProcName] = useState('');
  const [editProcPrice, setEditProcPrice] = useState('');
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

  const updateKitQuantity = (itemId: string, rawValue: string) => {
    // Aceita o campo vazio ou em digitação (ex: "0.") sem forçar de volta pro mínimo —
    // isso só é validado no blur. Sem isso, apagar o "1" pra digitar outro número virava
    // NaN, caía no fallback e prendia o campo em "0.01" a cada tecla.
    setKitDraft(prev => prev.map(k => k.itemId === itemId ? { ...k, quantity: rawValue as any } : k));
  };

  const handleKitQuantityBlur = (itemId: string) => {
    setKitDraft(prev => prev.map(k => {
      if (k.itemId !== itemId) return k;
      const parsed = parseFloat(String(k.quantity));
      return { ...k, quantity: !parsed || parsed <= 0 ? 0.01 : parsed };
    }));
  };

  // Custo do kit = soma do custo por unidade mais recente (última compra) de cada item,
  // vezes a quantidade que o kit usa dele. Usado pra validar a margem de lucro mínima
  // configurada, tanto ao salvar o kit quanto ao editar o preço do procedimento.
  const calculateKitCost = (kit: { itemId: string; quantity: number }[]) => {
    return kit.reduce((sum, k) => {
      const item = inventoryItems.find(i => i.id === k.itemId);
      return sum + (item?.lastUnitCost || 0) * k.quantity;
    }, 0);
  };

  const handleSaveKit = () => {
    if (!editingKitProcId) return;
    const proc = (settings.procedures || []).find(p => p.id === editingKitProcId);
    if (proc && settings.minProfitMarginPercent != null && proc.price > 0) {
      const cost = calculateKitCost(kitDraft);
      const margin = ((proc.price - cost) / proc.price) * 100;
      if (margin < settings.minProfitMarginPercent) {
        showToast(`Esse kit deixa a margem em ${margin.toFixed(1)}% (custo de insumos: R$ ${cost.toFixed(2)}) — abaixo do mínimo de ${settings.minProfitMarginPercent}% configurado. Ajuste o kit ou aumente o preço do procedimento.`, 'error');
        return;
      }
    }
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
            bookingFeeAmount: data.bookingFeeAmount ?? null,
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
    if (!window.confirm('Excluir este procedimento?')) return;
    persist({
      ...settings,
      procedures: (settings.procedures || []).filter(p => p.id !== id),
    });
    showToast('Procedimento removido');
  };

  const handleUpdateProcedure = (id: string, name: string, price: number) => {
    const proc = (settings.procedures || []).find(p => p.id === id);
    if (proc?.insumoKit && proc.insumoKit.length > 0 && settings.minProfitMarginPercent != null && price > 0) {
      const cost = calculateKitCost(proc.insumoKit);
      const margin = ((price - cost) / price) * 100;
      if (margin < settings.minProfitMarginPercent) {
        showToast(`Esse preço deixa a margem em ${margin.toFixed(1)}% (custo de insumos: R$ ${cost.toFixed(2)}) — abaixo do mínimo de ${settings.minProfitMarginPercent}% configurado.`, 'error');
        return;
      }
    }
    persist({
      ...settings,
      procedures: (settings.procedures || []).map(p => p.id === id ? { ...p, name, price } : p),
    });
    showToast('Procedimento atualizado');
    setEditingProcId(null);
  };

  const handleToggleProcedureDiscount = (id: string, allow: boolean) => {
    persist({
      ...settings,
      procedures: (settings.procedures || []).map(p => p.id === id ? { ...p, allowDiscount: allow } : p),
    });
  };

  const handleUpdateMaxDiscount = (id: string, percent: number) => {
    persist({
      ...settings,
      procedures: (settings.procedures || []).map(p => p.id === id ? { ...p, maxDiscountPercent: Math.max(0, Math.min(100, percent)) } : p),
    });
  };

  const handleAddSubstance = async (item: { name: string; unit: 'ml' | 'unidade'; procedureIds: string[]; sharedAcrossPatients?: boolean }) => {
    const id = crypto.randomUUID();
    const next = [...(settings.substances || []), { ...item, id }];
    persist({ ...settings, substances: next });
    // Toda substância cadastrada aqui também aparece no Estoque automaticamente, com
    // quantidade zerada até alguém comprar de verdade — assim ela já fica disponível
    // pro Kit de Insumos do procedimento e pra "Compra" na aba de Estoque, sem precisar
    // cadastrar ela duas vezes em dois lugares diferentes.
    try {
      await addDoc(collection(db, 'inventory'), {
        userId: user.uid,
        name: item.name,
        category: 'Substância',
        quantity: 0,
        minThreshold: 0,
        unit: item.unit === 'ml' ? 'Ml' : 'Unidades',
        linkedSubstanceId: id,
        ...(item.sharedAcrossPatients ? { sharedAcrossPatients: true } : {}),
        updatedAt: new Date().toISOString(),
      });
    } catch { /* a substância já foi salva nas configurações mesmo se isso falhar */ }
    showToast('Substância adicionada — já disponível no Estoque');
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

  // Converte o desenho do quadro de assinatura pra um arquivo binário (Blob) pronto
  // pra subir no Storage. Prioriza o método nativo do canvas (toBlob) — mais confiável
  // entre navegadores/celulares diferentes — com o método anterior (via fetch numa
  // URL de dados) como reforço, caso o navegador específico não suporte o primeiro.
  const canvasToBlob = (dataUrl: string, canvasEl?: HTMLCanvasElement | null): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (canvasEl && canvasEl.toBlob) {
        canvasEl.toBlob(blob => {
          if (blob) resolve(blob);
          else fetch(dataUrl).then(res => res.blob()).then(resolve).catch(reject);
        }, 'image/png');
      } else {
        fetch(dataUrl).then(res => res.blob()).then(resolve).catch(reject);
      }
    });
  };

  const handleSaveDrawnSignature = async () => {
    if (!profileSigPad.current || profileSigPad.current.isEmpty()) {
      showToast('Assine no quadro antes de salvar', 'error');
      return;
    }
    setSavingSignature(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const canvasEl = profileSigPad.current.getCanvas?.();
      const signatureBlob = await canvasToBlob(profileSigPad.current.toDataURL(), canvasEl);
      const sRef = ref(storage, `signatures/${ownerId}/professional.png`);
      await uploadBytes(sRef, signatureBlob);
      // Reassinar sobrescreve o mesmo arquivo — o Firebase costuma devolver a mesma URL
      // de antes (mesmo token), e o navegador acaba mostrando a imagem antiga em cache.
      // O parâmetro extra força o navegador a buscar a versão nova.
      const url = `${await getDownloadURL(sRef)}&v=${Date.now()}`;
      const updated = { ...settings, professionalSignatureUrl: url };
      setSettings(updated);
      await setDoc(doc(db, 'settings', ownerId), updated);
      showToast('Assinatura salva — será usada automaticamente nos documentos');
      setShowSignaturePad(false);
      profileSigPad.current?.clear();
    } catch (err: any) {
      console.error('Erro ao salvar assinatura:', err);
      showToast(`Erro ao salvar assinatura: ${err?.code || err?.message || 'desconhecido'}`, 'error');
    }
    setSavingSignature(false);
  };

  const handleUploadSignaturePhoto = async (file: File) => {
    setSavingSignature(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const sRef = ref(storage, `signatures/${ownerId}/professional.png`);
      await uploadBytes(sRef, file);
      const url = `${await getDownloadURL(sRef)}&v=${Date.now()}`;
      const updated = { ...settings, professionalSignatureUrl: url };
      setSettings(updated);
      await setDoc(doc(db, 'settings', ownerId), updated);
      showToast('Assinatura salva — será usada automaticamente nos documentos');
    } catch (err: any) {
      console.error('Erro ao salvar assinatura:', err);
      showToast(`Erro ao salvar assinatura: ${err?.code || err?.message || 'desconhecido'}`, 'error');
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
        bookingFeeAmount: settings.bookingFeeAmount ?? null,
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
              <div>
                <SettingField 
                  label="Margem de Lucro Mínima (%)" 
                  value={settings.minProfitMarginPercent != null ? String(settings.minProfitMarginPercent) : ''} 
                  onChange={v => setSettings({...settings, minProfitMarginPercent: v ? Math.max(0, Math.min(100, parseFloat(v) || 0)) : undefined})}
                  icon={<TrendingUp size={18} />}
                  placeholder="Ex: 30"
                  type="number"
                />
                <p className="text-[10px] text-[#9CA3AF] font-light mt-2 ml-1">
                  Ao editar o preço de um procedimento que já tem Kit de Insumos, o sistema não deixa salvar um
                  valor que dê uma margem de lucro menor que essa, considerando o custo dos insumos.
                </p>
              </div>
              <div>
                <SettingField
                  label="Chave Pix da Clínica"
                  value={settings.pixKey || ''}
                  onChange={v => setSettings({ ...settings, pixKey: v })}
                  icon={<QrCode size={18} />}
                  placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                />
                <p className="text-[10px] text-[#9CA3AF] font-light mt-2 ml-1">
                  Usada pra gerar o QR Code de pagamento nos orçamentos — o dinheiro cai direto na conta dessa
                  chave, sem intermediário. O app não confirma pagamento sozinho: continue marcando manualmente
                  quando o Pix cair.
                </p>
              </div>
              <div>
                <SettingField
                  label="Taxa de Marcação (R$)"
                  value={settings.bookingFeeAmount != null ? String(settings.bookingFeeAmount) : ''}
                  onChange={v => setSettings({ ...settings, bookingFeeAmount: v ? parseCurrencyInput(v) : undefined })}
                  icon={<Receipt size={18} />}
                  placeholder="0"
                />
                <p className="text-[10px] text-[#9CA3AF] font-light mt-2 ml-1">
                  Informada ao paciente já no agendamento. Se ele fizer algum procedimento depois, esse valor
                  é descontado do orçamento; se não fizer, não é reembolsável. Deixe em branco pra não cobrar.
                </p>
              </div>
              <div>
                <SettingField
                  label="Retorno Não Cobrado Até (dias)"
                  value={settings.returnVisitDays != null ? String(settings.returnVisitDays) : ''}
                  onChange={v => setSettings({ ...settings, returnVisitDays: v ? parseInt(v) || undefined : undefined })}
                  icon={<Clock size={18} />}
                  placeholder="Ex: 15"
                />
                <p className="text-[10px] text-[#9CA3AF] font-light mt-2 ml-1">
                  Se o paciente marcar o mesmo procedimento de novo dentro desse prazo, o sistema avisa que é
                  retorno (não deveria ser cobrado de novo). Deixe em branco pra desativar esse aviso.
                </p>
              </div>
              <div>
                <SettingField 
                  label="Google Drive — Client ID (OAuth)" 
                  value={settings.googleDriveClientId || ''} 
                  onChange={v => setSettings({...settings, googleDriveClientId: v})}
                  icon={<Cloud size={18} />}
                  placeholder="xxxxxxxxxx.apps.googleusercontent.com"
                />
                <p className="text-[10px] text-[#9CA3AF] font-light mt-2 ml-1">
                  Usado pra enviar os backups direto pro Google Drive. Precisa ser criado uma vez no Google Cloud
                  Console (peça o passo a passo).
                </p>
              </div>
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
          <p className="text-[10px] text-[#9CA3AF] font-light -mt-3 px-2">
            Ativado: assim que o último atendimento do dia é concluído, salva sozinho no Firebase e (se
            configurado) pede 1 clique pra enviar ao Google Drive também. Nunca baixa nada no computador — pra
            isso, use os botões de baixar abaixo.
          </p>

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
            <div key={proc.id} className="p-4 bg-[#FDFBF9] rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#4A433D] font-medium">{proc.name}</p>
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest">
                    R$ {proc.price.toFixed(2).replace('.', ',')}
                    {' · '}
                    {(proc.insumoKit || []).length} insumo(s)/substância(s) no kit
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingProcId(proc.id); setEditProcName(proc.name); setEditProcPrice(proc.price.toFixed(2).replace('.', ',')); }}
                    className="p-2 text-[#9CA3AF] hover:text-[#EADFD4]"
                    title="Editar Procedimento"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => openKitEditor(proc)} className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-[#8BA888] hover:text-[#7C9979] border border-[#F0F7F0] rounded-xl bg-[#F0F7F0]">
                    Kit de Insumos
                  </button>
                  <button onClick={() => handleDeleteProcedure(proc.id)} className="p-2 text-[#9CA3AF] hover:text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-3 border-t border-[#F0EAE3]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!proc.allowDiscount}
                    onChange={e => handleToggleProcedureDiscount(proc.id, e.target.checked)}
                    className="w-4 h-4 accent-[#8BA888]"
                  />
                  <span className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest">Permite desconto no Orçamento</span>
                </label>
                {proc.allowDiscount && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#9CA3AF]">Máximo:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={proc.maxDiscountPercent ?? 10}
                      onBlur={e => handleUpdateMaxDiscount(proc.id, parseFloat(e.target.value) || 0)}
                      className="w-16 bg-white border border-[#F5F2F0] rounded-xl p-2 text-xs text-center outline-none"
                    />
                    <span className="text-[10px] text-[#9CA3AF]">%</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!settings.procedures || settings.procedures.length === 0) && (
            <p className="text-xs text-[#9CA3AF] italic text-center py-6">Nenhum procedimento cadastrado ainda.</p>
          )}
        </div>
      </div>

      <div className="mt-8 bg-white rounded-[40px] border border-[#F5F2F0] p-10">
        <h3 className="serif text-2xl text-[#4A433D] mb-2">Substância e Insumos</h3>
        <p className="text-xs text-[#9CA3AF] font-light mb-6">
          Cadastre aqui tanto as substâncias (marcas, produtos) quanto os insumos (agulha, luva, gaze...). Assim
          que cadastrado, o item já aparece no Estoque com quantidade zerada — a compra de verdade (quantidade e
          valor gasto) é feita lá, na aba Estoque.
        </p>

        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setCatalogTab('substancias')}
            className={`px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${catalogTab === 'substancias' ? 'bg-[#EADFD4] text-white shadow-md' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0]'}`}
          >
            Substâncias
          </button>
          <button
            onClick={() => setCatalogTab('insumos')}
            className={`px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${catalogTab === 'insumos' ? 'bg-[#EADFD4] text-white shadow-md' : 'bg-white text-[#9CA3AF] border border-[#F5F2F0]'}`}
          >
            Insumos
          </button>
        </div>

        {catalogTab === 'insumos' ? (
          <div className="space-y-6">
            <div className="space-y-3 p-6 bg-[#FDFBF9] rounded-[28px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={newInsumo.name}
                  onChange={e => setNewInsumo({ ...newInsumo, name: e.target.value })}
                  placeholder="Nome do insumo (ex: Agulha 30G, Luva de Procedimento...)"
                  className="bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
                <input
                  value={newInsumo.category}
                  onChange={e => setNewInsumo({ ...newInsumo, category: e.target.value })}
                  placeholder="Categoria (ex: Descartáveis)"
                  className="bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
              </div>
              <select
                value={newInsumo.unit}
                onChange={e => setNewInsumo({ ...newInsumo, unit: e.target.value })}
                className="w-full bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
              >
                <option value="Unidades">Unidades (un)</option>
                <option value="Ml">Mililitros (ml)</option>
                <option value="Pares">Pares (pr)</option>
              </select>
              <label className="flex items-center gap-3 p-4 bg-white rounded-2xl cursor-pointer border border-[#F5F2F0]">
                <input type="checkbox" checked={newInsumo.purchasedByBox} onChange={e => setNewInsumo({ ...newInsumo, purchasedByBox: e.target.checked })} className="w-4 h-4 accent-[#8BA888]" />
                <span className="text-sm text-[#4A433D]">Este material é comprado por caixa</span>
              </label>
              {newInsumo.purchasedByBox && (
                <input
                  value={newInsumo.unitsPerBox}
                  onChange={e => setNewInsumo({ ...newInsumo, unitsPerBox: e.target.value })}
                  placeholder="Unidades por caixa (ex: 100)"
                  type="number"
                  className="w-full bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
              )}
              <div>
                <input
                  value={newInsumo.minThreshold}
                  onChange={e => setNewInsumo({ ...newInsumo, minThreshold: e.target.value })}
                  placeholder="Aviso de estoque baixo (em unidades)"
                  type="number"
                  className="w-full bg-white border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
              </div>
              <button
                onClick={handleAddInsumo}
                disabled={savingInsumo}
                className="w-full bg-[#EADFD4] text-white rounded-2xl px-6 py-4 text-[10px] font-bold uppercase tracking-widest hover:bg-[#DFCFBF] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Plus size={16} /> {savingInsumo ? 'Cadastrando...' : 'Cadastrar Insumo'}
              </button>
            </div>
            <p className="text-[10px] text-[#9CA3AF] font-light text-center">
              Todos os insumos cadastrados aparecem na aba Estoque — vá lá pra ver a lista completa e registrar
              compras.
            </p>

            <div className="space-y-2">
              {inventoryItems.filter(item => item.category !== 'Substância').map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-[#FDFBF9] rounded-2xl">
                  <div>
                    <p className="text-sm text-[#4A433D] font-medium">{item.name}</p>
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest">
                      {item.category} · {item.unit}
                      {item.purchasedByBox && item.unitsPerBox ? ` · ${item.unitsPerBox} un/caixa` : ''}
                    </p>
                  </div>
                  <button onClick={() => openEditInsumo(item)} className="p-2 text-[#9CA3AF] hover:text-[#EADFD4]">
                    <Edit2 size={16} />
                  </button>
                </div>
              ))}
              {inventoryItems.filter(item => item.category !== 'Substância').length === 0 && (
                <p className="text-xs text-[#9CA3AF] italic text-center py-6">Nenhum insumo cadastrado ainda.</p>
              )}
            </div>
          </div>
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
              <label className="flex items-center gap-3 px-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSubstance.sharedAcrossPatients}
                  onChange={e => setNewSubstance({ ...newSubstance, sharedAcrossPatients: e.target.checked })}
                  className="w-4 h-4 accent-[#8BA888]"
                />
                <span className="text-xs text-[#4A433D]">Um frasco/ampola rende pra mais de um paciente (ex: toxina diluída)</span>
              </label>
              <button
                onClick={() => {
                  if (!newSubstance.name.trim()) {
                    showToast('Preencha o nome da substância', 'error');
                    return;
                  }
                  handleAddSubstance({ name: newSubstance.name.trim(), unit: newSubstance.unit, procedureIds: [], sharedAcrossPatients: newSubstance.sharedAcrossPatients });
                  setNewSubstance({ name: '', unit: 'ml', procedureIds: [], sharedAcrossPatients: false });
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
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest">{sub.unit}</p>
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

      <div className="mt-8 bg-red-50 border-2 border-red-200 rounded-[40px] p-10">
        <h3 className="serif text-2xl text-red-500 mb-2">Zona de Perigo</h3>
        <p className="text-xs text-red-400 font-light mb-6">
          Apaga permanentemente todos os pacientes/prontuários e todo o financeiro (transações, custos fixos e
          variáveis) — usado só pra encerrar um período de testes e começar do zero. Estoque, Configurações
          (procedimentos, kits, dados da clínica) e login/administradores <strong>não</strong> são afetados. Essa
          ação não pode ser desfeita.
        </p>
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="bg-red-500 text-white px-8 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all"
          >
            Zerar Pacientes e Financeiro (Dados de Teste)
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-red-500 font-bold">
              Digite exatamente "APAGAR TUDO" abaixo pra confirmar. Isso é irreversível.
            </p>
            <input
              value={resetConfirmText}
              onChange={e => setResetConfirmText(e.target.value)}
              placeholder="APAGAR TUDO"
              className="w-full bg-white border border-red-200 rounded-2xl p-4 outline-none focus:border-red-400 transition-all text-sm"
            />
            <div className="flex gap-4">
              <button
                onClick={() => { setShowResetConfirm(false); setResetConfirmText(''); }}
                className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetTestData}
                disabled={resetConfirmText !== 'APAGAR TUDO' || resetting}
                className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting ? 'Apagando...' : 'Confirmar e Apagar Permanentemente'}
              </button>
            </div>
          </div>
        )}
        {resetResult && (
          <div className="mt-6 p-4 bg-white rounded-2xl">
            <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2">Resultado:</p>
            <pre className="text-[10px] text-[#4A433D] whitespace-pre-wrap font-mono">{resetResult}</pre>
          </div>
        )}
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
              className="bg-white/85 backdrop-blur-xl w-full max-w-2xl rounded-[40px] p-10 shadow-2xl"
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
              className="bg-white/85 backdrop-blur-xl w-full max-w-2xl rounded-[40px] p-10 shadow-2xl max-h-[85vh] overflow-y-auto"
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
            className="bg-white/85 backdrop-blur-xl w-full max-w-md rounded-[40px] p-10 shadow-2xl"
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

      {editingInsumoId && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white/85 backdrop-blur-xl w-full max-w-md rounded-[40px] p-10 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="serif text-2xl text-[#4A433D]">Editar Insumo</h3>
              <button onClick={() => setEditingInsumoId(null)} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <input
                value={editInsumo.name}
                onChange={e => setEditInsumo({ ...editInsumo, name: e.target.value })}
                placeholder="Nome do insumo"
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
              />
              <input
                value={editInsumo.category}
                onChange={e => setEditInsumo({ ...editInsumo, category: e.target.value })}
                placeholder="Categoria"
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
              />
              <select
                value={editInsumo.unit}
                onChange={e => setEditInsumo({ ...editInsumo, unit: e.target.value })}
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
              >
                <option value="Unidades">Unidades (un)</option>
                <option value="Ml">Mililitros (ml)</option>
                <option value="Pares">Pares (pr)</option>
              </select>
              <label className="flex items-center gap-3 p-4 bg-[#FDFBF9] rounded-2xl cursor-pointer border border-[#F5F2F0]">
                <input type="checkbox" checked={editInsumo.purchasedByBox} onChange={e => setEditInsumo({ ...editInsumo, purchasedByBox: e.target.checked })} className="w-4 h-4 accent-[#8BA888]" />
                <span className="text-sm text-[#4A433D]">Este material é comprado por caixa</span>
              </label>
              {editInsumo.purchasedByBox && (
                <input
                  value={editInsumo.unitsPerBox}
                  onChange={e => setEditInsumo({ ...editInsumo, unitsPerBox: e.target.value })}
                  placeholder="Unidades por caixa"
                  type="number"
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
              )}
              <input
                value={editInsumo.minThreshold}
                onChange={e => setEditInsumo({ ...editInsumo, minThreshold: e.target.value })}
                placeholder="Aviso de estoque baixo (em unidades)"
                type="number"
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
              />
            </div>
            <div className="flex gap-4 pt-8">
              <button onClick={() => setEditingInsumoId(null)} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
              <button
                onClick={handleSaveEditInsumo}
                disabled={savingEditInsumo}
                className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all disabled:opacity-50"
              >
                {savingEditInsumo ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {editingProcId && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white/85 backdrop-blur-xl w-full max-w-md rounded-[40px] p-10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="serif text-2xl text-[#4A433D]">Editar Procedimento</h3>
              <button onClick={() => setEditingProcId(null)} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Nome do Procedimento</label>
                <input
                  value={editProcName}
                  onChange={e => setEditProcName(e.target.value)}
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Valor</label>
                <input
                  value={editProcPrice}
                  onChange={e => setEditProcPrice(e.target.value)}
                  placeholder="R$"
                  className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
                />
              </div>
            </div>
            <div className="flex gap-4 pt-8">
              <button onClick={() => setEditingProcId(null)} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
              <button
                onClick={() => {
                  const price = parseCurrencyInput(editProcPrice);
                  if (!editProcName.trim() || !price || price <= 0) {
                    showToast('Preencha nome e valor válidos', 'error');
                    return;
                  }
                  handleUpdateProcedure(editingProcId, editProcName.trim(), price);
                }}
                className="flex-1 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#DFCFBF] transition-all"
              >
                Salvar Alterações
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
            className="bg-white/85 backdrop-blur-xl w-full max-w-lg max-h-[85vh] rounded-[40px] p-10 shadow-2xl overflow-y-auto"
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
                          min="0"
                          step="0.01"
                          value={inKit.quantity}
                          onChange={e => updateKitQuantity(item.id!, e.target.value)}
                          onBlur={() => handleKitQuantityBlur(item.id!)}
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
            className="bg-white/85 backdrop-blur-xl w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
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

function SettingField({ label, value, onChange, icon, type, placeholder }: any) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest ml-1">{label}</label>
      <div className="relative flex items-center">
        <div className="absolute left-4 text-[#9CA3AF]">{icon}</div>
        <input 
          type={type || 'text'}
          placeholder={placeholder}
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-[#4A433D] shadow-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

import { Settings as SettingsIcon, Phone, FileDown, TrendingUp } from 'lucide-react';
