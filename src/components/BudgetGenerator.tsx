import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Patient, ClinicSettings } from '../types';
import { User } from 'firebase/auth';
import { Plus, Trash2, FileDown } from 'lucide-react';
import { showToast } from '../lib/toast';
import { getClinicOwnerId } from '../lib/slots';

interface BudgetItem {
  description: string;
  value: string;
  fromAnamnesis?: boolean; // marca item que veio automaticamente da Conduta da anamnese —
                            // diferencia de item adicionado manualmente, pra saber o que
                            // pode remover/atualizar sozinho sem mexer no que a pessoa
                            // digitou à mão
  fromFaceMarking?: boolean; // marca item vindo do total calculado no mapa de aplicação
}

export default function BudgetGenerator({ patient, user, liveAnamnesis, availableProcedures }: {
  patient: Patient;
  user: User;
  liveAnamnesis?: { plannedProcedures?: string[]; plannedSubstances?: Record<string, string> };
  availableProcedures?: { id: string; name: string; price: number }[];
}) {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([{ description: '', value: '' }]);
  const [validityDays, setValidityDays] = useState('15');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    getClinicOwnerId(db).then(ownerId => getDoc(doc(db, 'settings', ownerId))).then(snap => {
      if (snap.exists()) setSettings(snap.data() as ClinicSettings);
    }).catch(() => {});
  }, [user.uid]);

  // Sincroniza automaticamente com o que está marcado na Conduta da anamnese — mesmo sem
  // salvar/liberar nada, já que lê direto do estado ao vivo da tela de anamnese (que fica
  // no componente pai). Só mexe nos itens marcados como "fromAnamnesis": adiciona quando
  // um procedimento é marcado lá, remove se for desmarcado, sem tocar em nada que a
  // pessoa tenha digitado manualmente aqui no orçamento.
  useEffect(() => {
    if (!liveAnamnesis || !availableProcedures) return;
    const plannedNames = liveAnamnesis.plannedProcedures || [];
    setItems(prev => {
      // Remove itens automáticos de procedimentos que não estão mais marcados
      let next = prev.filter(it => !it.fromAnamnesis || plannedNames.includes(it.description.split(' — ')[0]));
      // Adiciona os que estão marcados na anamnese mas ainda não têm item automático aqui
      const alreadyPresent = new Set(next.filter(it => it.fromAnamnesis).map(it => it.description.split(' — ')[0]));
      plannedNames.forEach(name => {
        if (alreadyPresent.has(name)) return;
        const proc = availableProcedures.find(p => p.name === name);
        if (!proc) return;
        const substanceName = liveAnamnesis.plannedSubstances?.[name];
        next.push({
          description: substanceName ? `${name} — ${substanceName}` : name,
          value: proc.price.toFixed(2).replace('.', ','),
          fromAnamnesis: true,
        });
      });
      // Se ficou só o item em branco inicial junto com itens automáticos, remove o em branco
      if (next.length > 1) next = next.filter(it => it.fromAnamnesis || it.description.trim() || it.value.trim());
      return next;
    });
  }, [liveAnamnesis?.plannedProcedures, liveAnamnesis?.plannedSubstances, availableProcedures]);

  // Sincroniza com o total calculado na última sessão salva do mapa de aplicação —
  // quantos ml/UI de cada substância foram usados nos pontos marcados, já convertido em
  // ampolas e custo. Só olha a sessão mais recente (a corrente); sessões antigas do
  // histórico não entram aqui de novo.
  useEffect(() => {
    const sessions = patient.faceMarkings || [];
    if (sessions.length === 0) return;
    const latest = [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const usage = latest.substanceUsage || [];
    setItems(prev => {
      const usageNames = usage.map(u => u.substanceName);
      let next = prev.filter(it => !it.fromFaceMarking || usageNames.includes(it.description.split(' (Mapa')[0]));
      const alreadyPresent = new Set(next.filter(it => it.fromFaceMarking).map(it => it.description.split(' (Mapa')[0]));
      usage.forEach(u => {
        if (alreadyPresent.has(u.substanceName)) return;
        next.push({
          description: `${u.substanceName} (Mapa: ${u.totalMl.toFixed(2).replace('.', ',')} ml/UI${u.ampoulesNeeded ? `, ${u.ampoulesNeeded} amp.` : ''})`,
          value: u.totalCost.toFixed(2).replace('.', ','),
          fromFaceMarking: true,
        });
      });
      if (next.length > 1) next = next.filter(it => it.fromFaceMarking || it.fromAnamnesis || it.description.trim() || it.value.trim());
      return next;
    });
  }, [patient.faceMarkings]);

  const addItem = () => setItems(prev => [...prev, { description: '', value: '' }]);
  const addFromCatalog = (item: { name: string; price: number }) => {
    setItems(prev => [...prev, { description: item.name, value: item.price.toFixed(2).replace('.', ',') }]);
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof BudgetItem, value: string) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const total = items.reduce((sum, it) => sum + (parseFloat(it.value.replace(',', '.')) || 0), 0);

  const handleGenerate = async () => {
    const validItems = items.filter(it => it.description.trim() && parseFloat(it.value.replace(',', '.')) > 0);
    if (validItems.length === 0) {
      showToast('Adicione ao menos um item com descrição e valor', 'error');
      return;
    }
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const docPdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = docPdf.internal.pageSize.getWidth();
      const margin = 24;
      let y = 18;

      const clinicName = settings?.clinicName || settings?.professionalName || 'Clínica';

      // Logo centralizada no topo — mesmo espírito visual dos documentos impressos
      // (Atestados, Receituário, Termos): busca a imagem e converte pra base64, já que
      // o jsPDF não consegue referenciar um caminho de arquivo direto.
      try {
        const logoDataUrl: string = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d')!.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = reject;
          img.src = '/logo/logo-full-v2.png';
        });
        const logoWidth = 55;
        const props = docPdf.getImageProperties(logoDataUrl);
        const ratioHeight = (logoWidth * props.height) / props.width;
        docPdf.addImage(logoDataUrl, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, ratioHeight);
        y += ratioHeight + 8;
      } catch {
        // Se a logo não carregar por algum motivo, segue sem travar a geração do PDF
        y += 4;
      }

      // Faixa colorida com o título, de ponta a ponta — igual à dos outros documentos
      docPdf.setFillColor(234, 223, 212); // #EADFD4
      docPdf.rect(0, y, pageWidth, 10, 'F');
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(10);
      docPdf.setTextColor(255, 255, 255);
      docPdf.text('ORÇAMENTO DE PROCEDIMENTO', pageWidth / 2, y + 6.5, { align: 'center' });
      y += 20;

      // Dados do paciente e data
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(10);
      docPdf.setTextColor(92, 84, 78);
      docPdf.text(`Paciente: ${patient.name}`, margin, y);
      y += 6;
      docPdf.setTextColor(154, 144, 132);
      docPdf.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, margin, y);
      y += 14;

      // Cabeçalho da tabela
      docPdf.setFillColor(253, 251, 249); // #FDFBF9
      docPdf.rect(margin, y - 5, pageWidth - margin * 2, 8, 'F');
      docPdf.setFontSize(9);
      docPdf.setTextColor(154, 144, 132);
      docPdf.text('PROCEDIMENTO', margin + 2, y);
      docPdf.text('VALOR', pageWidth - margin - 2, y, { align: 'right' });
      y += 10;

      // Itens
      docPdf.setFontSize(11);
      docPdf.setTextColor(92, 84, 78);
      validItems.forEach(it => {
        const value = parseFloat(it.value.replace(',', '.')) || 0;
        docPdf.text(it.description, margin + 2, y);
        docPdf.text(`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: 'right' });
        y += 8;
      });

      y += 4;
      docPdf.setDrawColor(234, 223, 212);
      docPdf.line(margin, y, pageWidth - margin, y);
      y += 10;

      // Total
      docPdf.setFontSize(13);
      docPdf.setTextColor(92, 84, 78);
      docPdf.text('Total', margin, y);
      docPdf.text(`R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: 'right' });
      y += 16;

      // Observações
      if (notes) {
        docPdf.setFontSize(9);
        docPdf.setTextColor(154, 144, 132);
        const noteLines = docPdf.splitTextToSize(notes, pageWidth - margin * 2);
        docPdf.text(noteLines, margin, y);
        y += noteLines.length * 5 + 6;
      }

      // Validade
      docPdf.setFontSize(9);
      docPdf.setTextColor(154, 144, 132);
      docPdf.text(`Este orçamento é válido por ${validityDays} dias a partir da data de emissão.`, margin, y);

      const fileName = `orcamento-${patient.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;
      docPdf.save(fileName);
      showToast('Orçamento gerado');
    } catch (err) {
      console.error(err);
      showToast('Erro ao gerar orçamento', 'error');
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between pb-6 border-b border-[#F5F2F0]">
        <h3 className="serif text-2xl text-[#4A433D]">Gerar Orçamento</h3>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                value={item.description}
                onChange={e => updateItem(idx, 'description', e.target.value)}
                placeholder="Ex: Toxina Botulínica — Terço Superior"
                className={`w-full bg-[#FDFBF9] border rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm ${(item.fromAnamnesis || item.fromFaceMarking) ? 'border-[#8BA888]/40 pr-28' : 'border-[#F5F2F0]'}`}
              />
              {item.fromAnamnesis && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#8BA888] uppercase tracking-widest bg-[#F0F7F0] px-2 py-1 rounded-lg">
                  Da anamnese
                </span>
              )}
              {item.fromFaceMarking && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#5B8DEF] uppercase tracking-widest bg-[#EEF3FD] px-2 py-1 rounded-lg">
                  Do Mapa
                </span>
              )}
            </div>
            <div className="relative w-36 shrink-0">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm">R$</span>
              <input
                value={item.value}
                onChange={e => updateItem(idx, 'value', e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 pl-10 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
              />
            </div>
            <button onClick={() => removeItem(idx)} className="text-[#9CA3AF] hover:text-red-400 shrink-0 p-2">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addItem}
        className="flex items-center gap-2 text-[#4A433D] text-xs font-bold uppercase tracking-widest hover:text-[#EADFD4] transition-all"
      >
        <Plus size={16} /> Adicionar Item
      </button>

      {settings?.procedures && settings.procedures.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">Ou escolha um procedimento cadastrado</p>
          <div className="flex flex-wrap gap-2">
            {settings.procedures.map(proc => (
              <button
                key={proc.id}
                onClick={() => addFromCatalog(proc)}
                className="text-xs bg-[#FDFBF9] border border-[#F5F2F0] text-[#4A433D] px-4 py-2 rounded-xl hover:border-[#EADFD4] transition-all"
              >
                {proc.name} <span className="text-[#9CA3AF]">— R$ {proc.price.toFixed(2).replace('.', ',')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end items-center gap-3 py-4 border-t border-[#F5F2F0]">
        <span className="text-xs text-[#9CA3AF] font-bold uppercase tracking-widest">Total</span>
        <span className="serif text-2xl text-[#4A433D]">
          R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Validade (dias)</label>
          <input
            type="number"
            value={validityDays}
            onChange={e => setValidityDays(e.target.value)}
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Observações (opcional)</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ex: Valores sujeitos a alteração conforme avaliação presencial"
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light"
          />
        </div>
      </div>

      <button
        disabled={generating}
        onClick={handleGenerate}
        className="w-full py-5 bg-[#EADFD4] text-white rounded-[28px] font-bold text-xs uppercase tracking-widest shadow-md hover:bg-[#DFCFBF] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
      >
        <FileDown size={20} />
        {generating ? 'Gerando...' : 'Gerar PDF do Orçamento'}
      </button>
    </div>
  );
}
