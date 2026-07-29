import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Patient, ClinicSettings } from '../types';
import { User } from 'firebase/auth';
import { Plus, Trash2, FileDown } from 'lucide-react';
import { showToast } from '../lib/toast';

interface BudgetItem {
  description: string;
  value: string;
}

export default function BudgetGenerator({ patient, user }: { patient: Patient; user: User }) {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([{ description: '', value: '' }]);
  const [validityDays, setValidityDays] = useState('15');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', user.uid)).then(snap => {
      if (snap.exists()) setSettings(snap.data() as ClinicSettings);
    });
  }, [user.uid]);

  const addItem = () => setItems(prev => [...prev, { description: '', value: '' }]);
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
      const margin = 20;
      let y = 28;

      const clinicName = settings?.clinicName || settings?.professionalName || 'Clínica';
      const professionalName = settings?.professionalName || '';
      const registrationNumber = settings?.registrationNumber || '';
      const clinicAddress = settings?.clinicAddress || '';

      // Cabeçalho
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(20);
      docPdf.setTextColor(92, 84, 78); // #4A433D
      docPdf.text(clinicName, margin, y);
      y += 7;
      if (professionalName) {
        docPdf.setFontSize(10);
        docPdf.setTextColor(154, 144, 132);
        docPdf.text(`${professionalName}${registrationNumber ? ' — ' + registrationNumber : ''}`, margin, y);
        y += 5;
      }
      if (clinicAddress) {
        docPdf.setFontSize(9);
        docPdf.text(clinicAddress, margin, y);
        y += 5;
      }

      y += 6;
      docPdf.setDrawColor(234, 223, 212); // #EADFD4
      docPdf.setLineWidth(0.5);
      docPdf.line(margin, y, pageWidth - margin, y);
      y += 12;

      // Título
      docPdf.setFontSize(15);
      docPdf.setTextColor(92, 84, 78);
      docPdf.text('Orçamento de Procedimento', margin, y);
      y += 10;

      // Dados do paciente e data
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
            <input
              value={item.description}
              onChange={e => updateItem(idx, 'description', e.target.value)}
              placeholder="Ex: Toxina Botulínica — Terço Superior"
              className="flex-1 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm"
            />
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
