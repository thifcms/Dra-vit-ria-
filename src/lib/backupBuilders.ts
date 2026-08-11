// Lógica compartilhada de construir os dois tipos de backup — usada tanto pela tela
// manual (Configurações → Gestão → Backup) quanto pelo aviso automático de fim de dia
// (AutoBackupPrompt). Ficar num lugar só evita duplicar a lista de coleções exportadas
// entre os dois lugares (e esquecer de atualizar um deles no futuro).
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Patient, ClinicSettings } from '../types';
import { generatePatientPdf, patientPdfFileName } from './patientPdf';
import { getClinicOwnerId } from './slots';

export async function buildFullBackupBlob(userUid: string): Promise<{ blob: Blob; filename: string }> {
  const ownerId = await getClinicOwnerId(db).catch(() => userUid);
  const collectionsToExport = [
    'patients', 'transactions', 'fixedCosts', 'inventory',
    'inventory_movements', 'procedureRevenue', 'appointments', 'stockAlerts',
  ];
  const exportData: Record<string, any> = {
    geradoEm: new Date().toISOString(),
    clinica: ownerId,
  };
  for (const c of collectionsToExport) {
    const snap = await getDocs(collection(db, c));
    exportData[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  const settingsSnap = await getDoc(doc(db, 'settings', ownerId));
  exportData.settings = settingsSnap.exists() ? settingsSnap.data() : null;
  const json = JSON.stringify(exportData, null, 2);
  return {
    blob: new Blob([json], { type: 'application/json' }),
    filename: `backup-completo-${new Date().toISOString().split('T')[0]}.json`,
  };
}

export async function buildPatientsZipBlob(
  patients: Patient[],
  clinicSettings: ClinicSettings | null,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; filename: string }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (let i = 0; i < patients.length; i++) {
    const pdfBlob = await generatePatientPdf(patients[i], clinicSettings);
    zip.file(patientPdfFileName(patients[i]), pdfBlob);
    onProgress?.(Math.round(((i + 1) / patients.length) * 100));
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    filename: `prontuarios-backup-${new Date().toISOString().split('T')[0]}.zip`,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// E-mail da conta Google da própria clínica — usado como sugestão (login_hint) na hora
// de autenticar no Drive, pra não autorizar sem querer com a conta pessoal de quem
// estiver operando o sistema
export const CLINIC_GOOGLE_ACCOUNT = 'contato.dravitoriaoliveira@gmail.com';
