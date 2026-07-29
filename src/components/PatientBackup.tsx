import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { ref, listAll, getDownloadURL, getMetadata } from 'firebase/storage';
import { Patient, ClinicSettings } from '../types';
import { User } from 'firebase/auth';
import { generatePatientPdf, patientPdfFileName } from '../lib/patientPdf';
import { FileDown, Search, Download, Loader2, Cloud } from 'lucide-react';
import { showToast } from '../lib/toast';

// Só aparece pra administrador — mesma checagem usada no AdminPanel. Deixa baixar o
// prontuário de um paciente específico, ou todos de uma vez (num .zip), em PDF — pensado
// pra guardar uma cópia de segurança fora do sistema (num HD, por exemplo).
export default function PatientBackup({ user }: { user: User }) {
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [allProgress, setAllProgress] = useState(0);

  const [cloudBackups, setCloudBackups] = useState<{ path: string; name: string; patientId: string; created: string; url: string }[] | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);

  const loadCloudBackups = async () => {
    setLoadingCloud(true);
    try {
      const rootRef = ref(storage, 'backups');
      const rootList = await listAll(rootRef);
      const files: { path: string; name: string; patientId: string; created: string; url: string }[] = [];
      // Cada subpasta é um patientId — lista os arquivos dentro de cada uma
      for (const patientFolder of rootList.prefixes) {
        const folderList = await listAll(patientFolder);
        for (const item of folderList.items) {
          const [meta, url] = await Promise.all([getMetadata(item), getDownloadURL(item)]);
          files.push({
            path: item.fullPath,
            name: item.name,
            patientId: patientFolder.name,
            created: meta.timeCreated,
            url,
          });
        }
      }
      files.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      setCloudBackups(files);
    } catch {
      showToast('Erro ao listar backups na nuvem', 'error');
      setCloudBackups([]);
    }
    setLoadingCloud(false);
  };

  useEffect(() => {
    getDoc(doc(db, 'system', 'authorized_admins')).then(snap => {
      const emails: string[] = snap.exists() ? (snap.data().emails || []) : [];
      setIsAdminUser(!!user.email && emails.includes(user.email));
    }).catch(() => setIsAdminUser(false));
  }, [user.email]);

  useEffect(() => {
    if (!isAdminUser) return;
    getDocs(collection(db, 'patients')).then(snap => {
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
    });
    getDoc(doc(db, 'publicConfig', 'booking')).then(bookingSnap => {
      const ownerId = bookingSnap.exists() ? bookingSnap.data().ownerId : null;
      if (ownerId) {
        getDoc(doc(db, 'settings', ownerId)).then(snap => {
          if (snap.exists()) setClinicSettings(snap.data() as ClinicSettings);
        });
      }
    });
  }, [isAdminUser]);

  if (!isAdminUser) return null;

  const filtered = patients.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.cpf?.includes(search)
  );

  const handleDownloadOne = async (patient: Patient) => {
    setDownloadingId(patient.id!);
    try {
      const blob = await generatePatientPdf(patient, clinicSettings);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = patientPdfFileName(patient);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Erro ao gerar PDF', 'error');
    }
    setDownloadingId(null);
  };

  const handleDownloadAll = async () => {
    if (patients.length === 0) return;
    setDownloadingAll(true);
    setAllProgress(0);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (let i = 0; i < patients.length; i++) {
        const blob = await generatePatientPdf(patients[i], clinicSettings);
        zip.file(patientPdfFileName(patients[i]), blob);
        setAllProgress(Math.round(((i + 1) / patients.length) * 100));
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prontuarios-backup-${new Date().toISOString().split('T')[0]}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      showToast(`${patients.length} prontuário(s) baixado(s)`);
    } catch (err) {
      showToast('Erro ao gerar backup', 'error');
    }
    setDownloadingAll(false);
  };

  return (
    <div className="bg-white rounded-[40px] border border-[#F5F2F0] p-10 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4]">
          <FileDown size={20} />
        </div>
        <div>
          <h3 className="serif text-2xl text-[#4A433D]">Backup de Prontuários (PDF)</h3>
          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-0.5">
            Pra guardar fora do sistema — HD, nuvem própria, etc.
          </p>
        </div>
      </div>

      <button
        onClick={handleDownloadAll}
        disabled={downloadingAll || patients.length === 0}
        className="w-full py-5 bg-[#4A433D] text-white rounded-2xl font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-[#5C544E] transition-all disabled:opacity-50 mb-8"
      >
        {downloadingAll ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Gerando... {allProgress}%
          </>
        ) : (
          <>
            <Download size={16} /> Baixar Todos os Prontuários ({patients.length}) — .zip
          </>
        )}
      </button>

      <div className="pt-6 border-t border-[#F5F2F0]">
        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-4">Ou baixe um paciente específico</p>
        <div className="relative mb-4">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CPF..."
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-12 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
          />
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.slice(0, 30).map(p => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-[#FDFBF9] rounded-xl">
              <div>
                <p className="text-sm text-[#4A433D]">{p.name}</p>
                {p.cpf && <p className="text-[10px] text-[#9CA3AF]">{p.cpf}</p>}
              </div>
              <button
                onClick={() => handleDownloadOne(p)}
                disabled={downloadingId === p.id}
                className="p-2 text-[#9CA3AF] hover:text-[#4A433D] transition-all disabled:opacity-50"
              >
                {downloadingId === p.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
          ))}
          {search && filtered.length === 0 && (
            <p className="text-xs text-[#9CA3AF] italic text-center py-4">Nenhum paciente encontrado.</p>
          )}
        </div>
      </div>

      <div className="pt-6 mt-6 border-t border-[#F5F2F0]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cloud size={16} className="text-[#9CA3AF]" />
            <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Backups automáticos na nuvem</p>
          </div>
          {cloudBackups === null && (
            <button
              onClick={loadCloudBackups}
              disabled={loadingCloud}
              className="text-[10px] font-bold text-[#B8846E] uppercase tracking-widest hover:text-[#A6735E] transition-all disabled:opacity-50"
            >
              {loadingCloud ? 'Carregando...' : 'Ver lista'}
            </button>
          )}
        </div>
        {cloudBackups !== null && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {cloudBackups.length === 0 && (
              <p className="text-xs text-[#9CA3AF] italic text-center py-4">Nenhum backup automático ainda — aparece aqui assim que alguma anamnese/evolução for liberada.</p>
            )}
            {cloudBackups.map(b => (
              <a
                key={b.path}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-[#FDFBF9] rounded-xl hover:bg-[#F5F2F0] transition-all"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[#4A433D] truncate">{b.name}</p>
                  <p className="text-[10px] text-[#9CA3AF]">{new Date(b.created).toLocaleString('pt-BR')}</p>
                </div>
                <Download size={16} className="text-[#9CA3AF] shrink-0 ml-3" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
