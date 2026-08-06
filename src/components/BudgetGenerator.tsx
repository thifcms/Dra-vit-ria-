import React, { useState, useEffect } from 'react';
import { doc, getDoc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Patient, ClinicSettings, InventoryItem } from '../types';
import { User } from 'firebase/auth';
import { Plus, Trash2, FileDown, CheckCircle2, Package, AlertTriangle } from 'lucide-react';
import { showToast } from '../lib/toast';
import { getClinicOwnerId, parseCurrencyInput } from '../lib/slots';

interface BudgetItem {
  description: string;
  value: string;
  fromAnamnesis?: boolean; // marca item que veio automaticamente da Conduta da anamnese —
                            // diferencia de item adicionado manualmente, pra saber o que
                            // pode remover/atualizar sozinho sem mexer no que a pessoa
                            // digitou à mão
  procedureId?: string; // referência ao procedimento, pra localizar o kit de insumos na
                         // hora de confirmar o orçamento e debitar o estoque
  insumoKit?: { itemId: string; itemName: string; quantity: number }[]; // cópia do kit,
                         // só pra exibir a lista de materiais no orçamento (sem valores
                         // separados — o preço é sempre o do pacote inteiro)
}

export default function BudgetGenerator({ patient, user, liveAnamnesis, availableProcedures }: {
  patient: Patient;
  user: User;
  liveAnamnesis?: { plannedProcedures?: string[]; plannedSubstances?: Record<string, string> };
  availableProcedures?: { id: string; name: string; price: number; insumoKit?: { itemId: string; itemName: string; quantity: number }[] }[];
}) {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([{ description: '', value: '' }]);
  const [validityDays, setValidityDays] = useState('15');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showConfirmLaunch, setShowConfirmLaunch] = useState(false);
  const [launchingToFinance, setLaunchingToFinance] = useState(false);

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
          procedureId: proc.id,
          insumoKit: proc.insumoKit,
        });
      });
      // Se ficou só o item em branco inicial junto com itens automáticos, remove o em branco
      if (next.length > 1) next = next.filter(it => it.fromAnamnesis || it.description.trim() || it.value.trim());
      return next;
    });
  }, [liveAnamnesis?.plannedProcedures, liveAnamnesis?.plannedSubstances, availableProcedures]);

  const addItem = () => setItems(prev => [...prev, { description: '', value: '' }]);
  const addFromCatalog = (item: { name: string; price: number }) => {
    setItems(prev => [...prev, { description: item.name, value: item.price.toFixed(2).replace('.', ',') }]);
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof BudgetItem, value: string) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const total = items.reduce((sum, it) => sum + parseCurrencyInput(it.value), 0);

  // Entrar no financeiro exige confirmar que o pagamento já foi recebido — gerar o
  // orçamento sozinho (é só um documento pro paciente levar/aprovar) nunca deveria criar
  // receita, e o lançamento existente na Conduta da anamnese usa o preço de tabela do
  // procedimento, não necessariamente o valor real negociado nesse orçamento específico
  // (que pode ter desconto, itens extras, etc). Esse aqui usa o total de verdade da lista.
  const handleConfirmLaunch = async () => {
    setLaunchingToFinance(true);
    try {
      const validItems = items.filter(it => it.description.trim() && parseCurrencyInput(it.value) > 0);
      const description = validItems.map(it => it.description).join(', ');
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        amount: total,
        type: 'income',
        date: new Date(),
        category: 'Orçamento',
        description: `${description || 'Orçamento'} — ${patient.name}`,
        patientId: patient.id,
        autoGenerated: true,
      });

      // Aceitar o orçamento debita do estoque os insumos/substância de cada procedimento
      // aceito, de acordo com o kit cadastrado. Mesmo sem estoque suficiente, o débito e
      // o orçamento seguem em frente (não trava o atendimento) — só fica registrado um
      // aviso pro administrador saber que precisa comprar.
      const itemsWithKit = validItems.filter(it => it.insumoKit && it.insumoKit.length > 0);
      if (itemsWithKit.length > 0) {
        // Soma quantidades caso o mesmo insumo apareça em mais de um procedimento do
        // mesmo orçamento, pra debitar uma vez só, com o total correto
        const neededByItemId = new Map<string, { itemName: string; quantity: number }>();
        itemsWithKit.forEach(it => {
          it.insumoKit!.forEach(k => {
            const existing = neededByItemId.get(k.itemId);
            neededByItemId.set(k.itemId, {
              itemName: k.itemName,
              quantity: (existing?.quantity || 0) + k.quantity,
            });
          });
        });

        for (const [itemId, need] of neededByItemId.entries()) {
          try {
            const itemSnap = await getDoc(doc(db, 'inventory', itemId));
            if (!itemSnap.exists()) continue;
            const currentQty = (itemSnap.data() as InventoryItem).quantity || 0;
            const newQty = currentQty - need.quantity;
            await updateDoc(doc(db, 'inventory', itemId), { quantity: Math.max(0, newQty) });
            await addDoc(collection(db, 'inventory_movements'), {
              userId: user.uid,
              itemId,
              itemName: need.itemName,
              quantity: need.quantity,
              type: 'consumption',
              date: new Date().toISOString(),
            });
            if (newQty < 0) {
              await addDoc(collection(db, 'stockAlerts'), {
                userId: user.uid,
                itemId,
                itemName: need.itemName,
                quantityNeeded: Math.abs(newQty),
                patientName: patient.name,
                patientId: patient.id,
                date: new Date().toISOString(),
                resolved: false,
              });
            }
          } catch { /* segue tentando os outros itens mesmo se um falhar */ }
        }
      }

      showToast('Lançamento financeiro confirmado — estoque atualizado');
      setShowConfirmLaunch(false);
    } catch (err) {
      showToast('Erro ao lançar no financeiro', 'error');
    }
    setLaunchingToFinance(false);
  };

  const handleGenerate = async () => {
    const validItems = items.filter(it => it.description.trim() && parseCurrencyInput(it.value) > 0);
    if (validItems.length === 0) {
      showToast('Adicione ao menos um item com descrição e valor', 'error');
      return;
    }
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const docPdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = docPdf.internal.pageSize.getWidth();
      const pageHeight = docPdf.internal.pageSize.getHeight();
      const margin = 24;
      let y = 18;
      let watermarkLogoUrl: string | null = null;
      let watermarkLogoProps: { width: number; height: number } | null = null;

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

        // Guarda o logo pra desenhar a marca d'água por cima de tudo, no final —
        // desenhar agora deixaria ela por baixo do resto do conteúdo, que ainda nem
        // existe nesse ponto
        watermarkLogoUrl = logoDataUrl;
        watermarkLogoProps = { width: props.width, height: props.height };

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
        const value = parseCurrencyInput(it.value);
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

      // Marca d'água grande e bem clara, por cima de todo o resto — desenhada por
      // último de propósito, já que no jsPDF quem desenha depois fica visualmente em
      // cima (não existe z-index; a ordem de desenho é o que decide)
      if (watermarkLogoUrl && watermarkLogoProps) {
        const wmWidth = pageWidth * 0.95625; // 0.75 original × 1.5 × 0.85 (redução de 15%)
        const wmHeight = (wmWidth * watermarkLogoProps.height) / watermarkLogoProps.width;
        docPdf.saveGraphicsState();
        (docPdf as any).setGState(new (docPdf as any).GState({ opacity: 0.06 }));
        docPdf.addImage(watermarkLogoUrl, 'PNG', (pageWidth - wmWidth) / 2, (pageHeight - wmHeight) / 2, wmWidth, wmHeight);
        docPdf.restoreGraphicsState();
      }

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
          <div key={idx}>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  value={item.description}
                  onChange={e => updateItem(idx, 'description', e.target.value)}
                  placeholder="Ex: Toxina Botulínica — Terço Superior"
                  className={`w-full bg-[#FDFBF9] border rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all font-light text-sm ${item.fromAnamnesis ? 'border-[#8BA888]/40 pr-28' : 'border-[#F5F2F0]'}`}
                />
                {item.fromAnamnesis && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-[#8BA888] uppercase tracking-widest bg-[#F0F7F0] px-2 py-1 rounded-lg">
                    Da anamnese
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
            {item.insumoKit && item.insumoKit.length > 0 && (
              <div className="flex items-start gap-2 mt-2 ml-1 p-3 bg-[#FDFBF9] rounded-xl">
                <Package size={14} className="text-[#9CA3AF] shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#9CA3AF] font-light leading-relaxed">
                  <span className="font-bold uppercase tracking-widest text-[9px]">Materiais inclusos: </span>
                  {item.insumoKit.map(k => `${k.itemName} (${k.quantity})`).join(', ')}
                </p>
              </div>
            )}
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

      <div className="pt-2 border-t border-[#F5F2F0]">
        <p className="text-[10px] text-[#9CA3AF] font-light text-center mb-3 mt-4">
          Gerar o orçamento é só o documento — nada entra no financeiro até o pagamento ser confirmado.
        </p>
        <button
          onClick={() => setShowConfirmLaunch(true)}
          disabled={total <= 0}
          className="w-full py-5 bg-[#8BA888] text-white rounded-[28px] font-bold text-xs uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <CheckCircle2 size={20} />
          Confirmar Lançamento
        </button>
      </div>

      {showConfirmLaunch && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl">
            <div className="w-14 h-14 bg-[#F0F7F0] rounded-2xl flex items-center justify-center text-[#8BA888] mb-6">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="serif text-2xl text-[#4A433D] mb-3">Confirmar Pagamento?</h3>
            <p className="text-sm text-[#9CA3AF] font-light leading-relaxed mb-8">
              Confirma que <strong className="text-[#4A433D]">{patient.name}</strong> pagou o valor de{' '}
              <strong className="text-[#4A433D]">
                R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </strong>{' '}
              referente a este orçamento? Isso vai lançar a receita no Financeiro
              {items.some(it => it.insumoKit && it.insumoKit.length > 0) ? ' e debitar os insumos/substância do estoque' : ''}.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmLaunch(false)}
                className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLaunch}
                disabled={launchingToFinance}
                className="flex-1 py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#7C9979] transition-all disabled:opacity-50"
              >
                {launchingToFinance ? 'Confirmando...' : 'Confirmar Recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
