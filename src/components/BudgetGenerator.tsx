import React, { useState, useEffect } from 'react';
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Patient, ClinicSettings, InventoryItem } from '../types';
import { User } from 'firebase/auth';
import { Plus, Trash2, FileDown, CheckCircle2, MessageCircle, History, X, Eye, Clock, Printer, QrCode, Copy } from 'lucide-react';
import { showToast } from '../lib/toast';
import { getClinicOwnerId, parseCurrencyInput, remoteSignLink } from '../lib/slots';
import { whatsappLink, genericEmailLink, openWhatsApp } from '../lib/reminders';
import { deductFromBatchesFEFO } from '../lib/inventoryBatches';
import { buildPixPayload } from '../lib/pix';

interface BudgetItem {
  description: string;
  value: string;
  quantity?: number; // quantas vezes esse procedimento será realizado — o valor exibido
                      // já vem multiplicado por isso quando o item vem da anamnese
  fromAnamnesis?: boolean; // marca item que veio automaticamente da Conduta da anamnese —
                            // diferencia de item adicionado manualmente, pra saber o que
                            // pode remover/atualizar sozinho sem mexer no que a pessoa
                            // digitou à mão
  procedureId?: string; // referência ao procedimento, pra localizar o kit de insumos na
                         // hora de confirmar o orçamento e debitar o estoque
  insumoKit?: { itemId: string; itemName: string; quantity: number }[]; // cópia do kit,
                         // só pra exibir a lista de materiais no orçamento (sem valores
                         // separados — o preço é sempre o do pacote inteiro)
  originalValue?: string; // preço de tabela antes de qualquer desconto — guardado pra
                           // recalcular certo se o percentual de desconto for alterado
  discountPercent?: number; // desconto aplicado nesse item — o campo "value" já reflete
                             // o valor COM desconto, então gerar o orçamento não precisa
                             // saber que existe desconto nenhum, só usa o value final
  allowDiscount?: boolean; // copiado do procedimento no momento em que o item é criado
  maxDiscountPercent?: number;
}

export default function BudgetGenerator({ patient, user, liveAnamnesis, availableProcedures }: {
  patient: Patient;
  user: User;
  liveAnamnesis?: { plannedProcedures?: string[]; plannedSubstances?: Record<string, string>; plannedProcedureQuantities?: Record<string, number> };
  availableProcedures?: { id: string; name: string; price: number; insumoKit?: { itemId: string; itemName: string; quantity: number }[]; allowDiscount?: boolean; maxDiscountPercent?: number }[];
}) {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [items, setItems] = useState<BudgetItem[]>([{ description: '', value: '' }]);
  const [validityDays, setValidityDays] = useState('15');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showConfirmLaunch, setShowConfirmLaunch] = useState(false);
  const [launchingToFinance, setLaunchingToFinance] = useState(false);
  const [showBudgetSignSend, setShowBudgetSignSend] = useState(false);
  const [sendingBudgetSign, setSendingBudgetSign] = useState(false);
  const [showBudgetHistory, setShowBudgetHistory] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

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
    const quantities = liveAnamnesis.plannedProcedureQuantities || {};
    setItems(prev => {
      // Remove itens automáticos de procedimentos que não estão mais marcados
      let next = prev.filter(it => !it.fromAnamnesis || plannedNames.includes(it.description));
      // Atualiza a quantidade/valor dos itens automáticos já presentes, caso tenha
      // mudado na anamnese desde a última sincronização
      next = next.map(it => {
        if (!it.fromAnamnesis) return it;
        const qty = quantities[it.description] || 1;
        if (it.quantity === qty) return it;
        const proc = availableProcedures.find(p => p.id === it.procedureId);
        if (!proc) return it;
        return { ...it, quantity: qty, value: (proc.price * qty).toFixed(2).replace('.', ','), originalValue: (proc.price * qty).toFixed(2).replace('.', ',') };
      });
      // Adiciona os que estão marcados na anamnese mas ainda não têm item automático aqui
      const alreadyPresent = new Set(next.filter(it => it.fromAnamnesis).map(it => it.description));
      plannedNames.forEach(name => {
        if (alreadyPresent.has(name)) return;
        const proc = availableProcedures.find(p => p.name === name);
        if (!proc) return;
        const qty = quantities[name] || 1;
        // Só o nome do procedimento e o valor aparecem no orçamento — substância e
        // insumos do kit continuam guardados no item (usados no débito de estoque ao
        // confirmar), mas não aparecem pro paciente ver no orçamento.
        next.push({
          description: name,
          value: (proc.price * qty).toFixed(2).replace('.', ','),
          originalValue: (proc.price * qty).toFixed(2).replace('.', ','),
          quantity: qty,
          fromAnamnesis: true,
          procedureId: proc.id,
          insumoKit: proc.insumoKit,
          allowDiscount: proc.allowDiscount,
          maxDiscountPercent: proc.maxDiscountPercent,
        });
      });
      // Se ficou só o item em branco inicial junto com itens automáticos, remove o em branco
      if (next.length > 1) next = next.filter(it => it.fromAnamnesis || it.description.trim() || it.value.trim());
      return next;
    });
  }, [liveAnamnesis?.plannedProcedures, liveAnamnesis?.plannedSubstances, liveAnamnesis?.plannedProcedureQuantities, availableProcedures]);

  const addItem = () => setItems(prev => [...prev, { description: '', value: '' }]);

  // Descarta edições manuais (itens extras, descontos aplicados, observações) e
  // reconstrói o orçamento do zero, só com o que está marcado na anamnese agora
  const handleCancelBudget = () => {
    if (!window.confirm('Descartar as alterações feitas neste orçamento?')) return;
    const plannedNames = liveAnamnesis?.plannedProcedures || [];
    const quantities = liveAnamnesis?.plannedProcedureQuantities || {};
    const rebuilt: BudgetItem[] = [];
    plannedNames.forEach(name => {
      const proc = availableProcedures?.find(p => p.name === name);
      if (!proc) return;
      const qty = quantities[name] || 1;
      rebuilt.push({
        description: name,
        value: (proc.price * qty).toFixed(2).replace('.', ','),
        originalValue: (proc.price * qty).toFixed(2).replace('.', ','),
        quantity: qty,
        fromAnamnesis: true,
        procedureId: proc.id,
        insumoKit: proc.insumoKit,
        allowDiscount: proc.allowDiscount,
        maxDiscountPercent: proc.maxDiscountPercent,
      });
    });
    if (rebuilt.length > 0) {
      setItems(rebuilt);
      setNotes('');
      showToast('Alterações descartadas');
      return;
    }
    // Nada marcado na anamnese agora (ex: "Nova Anamnese" acabou de limpar os
    // procedimentos planejados) — antes de deixar em branco, checa se sobrou um
    // orçamento de hoje salvo como pendente (salvo automaticamente nesse momento,
    // pra não perder o que já tinha sido preparado) e traz ele de volta pra tela.
    const todayPending = (patient.pendingBudgets || [])
      .filter(b => b.status === 'pending' && b.date.startsWith(new Date().toISOString().split('T')[0]))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (todayPending) {
      setItems(todayPending.items.map(it => ({ ...it })));
      setNotes(todayPending.notes || '');
      showToast('Orçamento pendente de hoje trazido de volta pra revisão');
      return;
    }
    setItems([{ description: '', value: '' }]);
    setNotes('');
    showToast('Alterações descartadas');
  };

  const addFromCatalog = (item: { name: string; price: number }) => {
    setItems(prev => [...prev, { description: item.name, value: item.price.toFixed(2).replace('.', ',') }]);
  };
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof BudgetItem, value: string) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  // Recalcula o valor final do item a partir do preço de tabela (originalValue) — o
  // campo "value" (usado em tudo: total, PDF, assinatura) já fica com o valor COM
  // desconto aplicado, então nada mais no orçamento precisa saber que houve desconto.
  const applyDiscount = (idx: number, percent: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const cap = it.maxDiscountPercent ?? 0;
      const clamped = Math.max(0, Math.min(cap, percent));
      const original = parseCurrencyInput(it.originalValue || it.value);
      const discounted = original * (1 - clamped / 100);
      return { ...it, discountPercent: clamped, value: discounted.toFixed(2).replace('.', ',') };
    }));
  };

  const total = items.reduce((sum, it) => sum + parseCurrencyInput(it.value), 0);

  // Entrar no financeiro exige confirmar que o pagamento já foi recebido — gerar o
  // orçamento sozinho (é só um documento pro paciente levar/aprovar) nunca deveria criar
  // receita, e o lançamento existente na Conduta da anamnese usa o preço de tabela do
  // procedimento, não necessariamente o valor real negociado nesse orçamento específico
  // (que pode ter desconto, itens extras, etc). Esse aqui usa o total de verdade da lista.
  // Lógica central de "isso virou pagamento de verdade" — lança no financeiro, debita
  // estoque, e registra a receita por procedimento. Reutilizável tanto pelo fluxo de
  // pagamento imediato (Confirmar Lançamento) quanto por marcar como pago um orçamento
  // salvo antes como pendente — em ambos os casos, ESSE é o único lugar que realmente
  // faz o dinheiro "entrar no fluxo de caixa da clínica".
  const processPayment = async (validItems: BudgetItem[], totalValue: number) => {
    const description = validItems.map(it => it.description).join(', ');
    await addDoc(collection(db, 'transactions'), {
      userId: user.uid,
      amount: totalValue,
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
    // Guarda o custo por unidade de cada item lido durante o débito, pra reaproveitar
    // no cálculo de lucro por procedimento logo abaixo, sem precisar buscar de novo.
    const unitCostByItemId = new Map<string, number>();
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

      const usedBatchesLog: { itemName: string; procedureNames: string[]; lotNumber?: string; expiryDate?: string; quantity: number }[] = [];

      for (const [itemId, need] of neededByItemId.entries()) {
        try {
          const itemSnap = await getDoc(doc(db, 'inventory', itemId));
          if (!itemSnap.exists()) continue;
          const itemData = itemSnap.data() as InventoryItem;
          if (itemData.lastUnitCost) unitCostByItemId.set(itemId, itemData.lastUnitCost);
          const currentQty = itemData.quantity || 0;
          const newQty = currentQty - need.quantity;
          const { updatedBatches, usedFrom } = deductFromBatchesFEFO(itemData.batches, need.quantity);
          await updateDoc(doc(db, 'inventory', itemId), {
            quantity: Math.max(0, newQty),
            batches: updatedBatches,
          });
          // Guarda de qual lote específico saiu, pra registrar no prontuário do
          // paciente — rastreabilidade real: qual frasco/lote esse paciente recebeu,
          // não só "usou a substância X"
          const procedureNames = itemsWithKit
            .filter(it => it.insumoKit!.some(k => k.itemId === itemId))
            .map(it => it.description);
          usedFrom.forEach(u => {
            usedBatchesLog.push({ itemName: need.itemName, procedureNames, lotNumber: u.lotNumber, expiryDate: u.expiryDate, quantity: u.quantity });
          });
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

      // Registra no prontuário do paciente exatamente qual lote de cada substância ele
      // recebeu — rastreabilidade de verdade: em caso de reação ou recall de um lote
      // específico, dá pra saber na hora quem recebeu aquele frasco, sem depender de
      // planilha ou memória de quem atendeu.
      if (usedBatchesLog.length > 0) {
        try {
          const logDate = new Date().toISOString();
          const patientSnap = await getDoc(doc(db, 'patients', patient.id!));
          const currentLog = patientSnap.exists() ? ((patientSnap.data() as Patient).medicationLog || []) : [];
          const newEntries = usedBatchesLog.map(u => ({
            id: crypto.randomUUID(),
            date: logDate,
            itemName: u.itemName,
            procedureNames: u.procedureNames,
            lotNumber: u.lotNumber,
            expiryDate: u.expiryDate,
            quantity: u.quantity,
          }));
          await updateDoc(doc(db, 'patients', patient.id!), {
            medicationLog: [...currentLog, ...newEntries],
          });
        } catch { /* melhor esforço — não trava a confirmação do orçamento por isso */ }
      }
    }

    // Um registro por procedimento aceito (não por orçamento inteiro), com o custo de
    // insumos calculado agora usando o custo por unidade mais recente de cada item do
    // kit — é isso que alimenta a aba "Lucro por Procedimento" em Financeiro. Só cria
    // registro pra itens que vieram de um procedimento cadastrado (têm procedureId);
    // itens digitados manualmente no orçamento não têm como calcular custo de insumo.
    const now = new Date().toISOString();
    await Promise.all(validItems.filter(it => it.procedureId).map(it => {
      const insumoCost = (it.insumoKit || []).reduce(
        (sum, k) => sum + (unitCostByItemId.get(k.itemId) || 0) * k.quantity,
        0
      );
      return addDoc(collection(db, 'procedureRevenue'), {
        userId: user.uid,
        procedureId: it.procedureId,
        procedureName: it.description,
        value: parseCurrencyInput(it.value),
        insumoCost,
        date: now,
        patientId: patient.id,
        patientName: patient.name,
      });
    }));
  };

  const handleConfirmLaunch = async () => {
    setLaunchingToFinance(true);
    try {
      const validItems = items.filter(it => it.description.trim() && parseCurrencyInput(it.value) > 0);
      await processPayment(validItems, total);
      showToast('Lançamento financeiro confirmado — estoque atualizado');
      setShowConfirmLaunch(false);
    } catch (err) {
      showToast('Erro ao lançar no financeiro', 'error');
    }
    setLaunchingToFinance(false);
  };

  // Paciente não aceitou/pagou na hora — salva o orçamento com prazo de validade de 15
  // dias, guardado nesta aba, SEM tocar no financeiro nem no estoque. Só quando alguém
  // marcar como pago (mesmo dias depois) é que processPayment roda de verdade.
  const [savingPending, setSavingPending] = useState(false);
  const handleSaveAsPending = async () => {
    const validItems = items.filter(it => it.description.trim() && parseCurrencyInput(it.value) > 0);
    if (validItems.length === 0) {
      showToast('Adicione ao menos um item com descrição e valor', 'error');
      return;
    }
    setSavingPending(true);
    try {
      const now = new Date();
      const validUntil = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
      const entry = {
        id: crypto.randomUUID(),
        date: now.toISOString(),
        validUntil: validUntil.toISOString(),
        items: validItems.map(it => ({ description: it.description, value: it.value, procedureId: it.procedureId, insumoKit: it.insumoKit })),
        total,
        notes,
        status: 'pending' as const,
      };
      await updateDoc(doc(db, 'patients', patient.id!), {
        pendingBudgets: [...(patient.pendingBudgets || []), entry],
      });
      showToast('Orçamento salvo — válido por 15 dias, sem entrar no financeiro ainda');
    } catch (err) {
      showToast('Erro ao salvar orçamento', 'error');
    }
    setSavingPending(false);
  };

  // Marca um orçamento salvo antes como pago — SÓ AGORA o dinheiro entra no fluxo de
  // caixa da clínica e o estoque é debitado, mesmo que tenha sido salvo dias atrás.
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const handleMarkPendingAsPaid = async (entry: NonNullable<Patient['pendingBudgets']>[number]) => {
    setMarkingPaidId(entry.id);
    try {
      await processPayment(entry.items as BudgetItem[], entry.total);
      const updated = (patient.pendingBudgets || []).map(p =>
        p.id === entry.id ? { ...p, status: 'paid' as const, paidAt: new Date().toISOString() } : p
      );
      await updateDoc(doc(db, 'patients', patient.id!), { pendingBudgets: updated });
      showToast('Pagamento confirmado — entrou no fluxo de caixa e o estoque foi debitado');
    } catch (err) {
      showToast('Erro ao confirmar pagamento', 'error');
    }
    setMarkingPaidId(null);
  };

  // Texto legível do orçamento atual, pra mostrar ao paciente na tela de assinatura
  // remota — lista os itens (sem preço separado por material, só a descrição), o total
  // e a validade.
  const buildBudgetSignContent = () => {
    const validItems = items.filter(it => it.description.trim() && parseCurrencyInput(it.value) > 0);
    const lines = validItems.map(it =>
      `${it.description} — R$ ${parseCurrencyInput(it.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    );
    return [
      ...lines,
      '',
      `Valor Total: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `Validade: ${validityDays} dias a partir da data de emissão.`,
      notes ? `Observações: ${notes}` : '',
      '',
      'Ao assinar abaixo, declaro estar de acordo com os valores e procedimentos descritos neste orçamento.',
    ].filter(Boolean).join('\n');
  };

  const handleSendBudgetForSignature = async (via: 'whatsapp' | 'email') => {
    const validItems = items.filter(it => it.description.trim() && parseCurrencyInput(it.value) > 0);
    if (validItems.length === 0) {
      showToast('Adicione ao menos um item com descrição e valor antes de enviar', 'error');
      return;
    }
    const sentTo = via === 'whatsapp' ? patient.phone : patient.email;
    if (!sentTo) {
      showToast(`Cadastre um ${via === 'whatsapp' ? 'telefone' : 'e-mail'} pro paciente antes de enviar`, 'error');
      return;
    }
    setSendingBudgetSign(true);
    try {
      const ownerId = await getClinicOwnerId(db).catch(() => user.uid);
      const requestData = {
        userId: user.uid,
        patientId: patient.id,
        patientName: patient.name,
        patientCpf: patient.cpf || '',
        templateId: 'budget',
        templateTitle: 'Orçamento',
        templateContent: buildBudgetSignContent(),
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        createdBy: user.email || user.uid,
        ownerId,
        docType: 'budget' as const,
        sentVia: via,
        sentTo,
        // Guarda os dados estruturados de verdade (não só o texto resumido acima) —
        // sem isso, a mesclagem dependia do estado da tela no momento em que o
        // paciente assinasse, que podia já estar diferente (ou zerado) se o
        // profissional tivesse saído da aba de Orçamento nesse meio tempo.
        budgetItems: validItems.map(it => ({ description: it.description, value: it.value })),
        budgetTotal: total,
        budgetValidityDays: validityDays,
        budgetNotes: notes,
      };
      const docRef = await addDoc(collection(db, 'signRequests'), requestData);
      const link = remoteSignLink(docRef.id);
      // Se a clínica tem chave Pix cadastrada, inclui o código de pagamento direto na
      // mensagem — é aqui que "pagar sem sair do WhatsApp" acontece de verdade, já que
      // o paciente pode copiar o código e colar no próprio app do banco sem precisar
      // abrir mais nada.
      const pixSection = settings?.pixKey
        ? `\n\n💳 Pra pagar direto por aqui, copie o código Pix abaixo e cole no seu banco:\n${buildPixPayload({
            pixKey: settings.pixKey,
            merchantName: settings?.clinicName || settings?.professionalName || 'Clinica',
            merchantCity: 'BRASIL',
            amount: total,
            txid: `ORC${Date.now().toString().slice(-8)}`,
          })}`
        : '';
      const message = `Olá, ${patient.name}! Segue o link pra revisar e assinar seu orçamento:\n${link}${pixSection}`;
      if (via === 'whatsapp') {
        openWhatsApp(sentTo, message);
      } else {
        window.open(genericEmailLink(sentTo, 'Assinatura: Orçamento', message), '_blank');
      }
      setShowBudgetSignSend(false);
      showToast(`Link gerado — confirme o envio no ${via === 'whatsapp' ? 'WhatsApp' : 'e-mail'}`);
    } catch (err) {
      showToast('Erro ao gerar o link', 'error');
    }
    setSendingBudgetSign(false);
  };

  // Assinatura remota do orçamento: diferente de anamnese/termo, o orçamento não tinha
  // nenhum lugar pra ficar guardado permanentemente — agora, ao ser assinado, cria uma
  // entrada nova em budgetHistory, sem apagar orçamentos assinados anteriormente.
  // onSnapshot detecta a assinatura em tempo real (antes usava getDocs, só checava uma
  // vez ao abrir a tela) — e, assim que detectado, TRAVA o formulário atual: depois que
  // o paciente assina, não dá mais pra mexer nesse orçamento específico.
  // Assinatura remota do orçamento: a gravação de verdade (criar a entrada em
  // budgetHistory) agora acontece sempre, em PatientDetail — não só quando essa tela
  // específica está aberta (ver o comentário lá pra entender por quê). Esse watcher
  // aqui só cuida do travamento VISUAL da tela quando o paciente assina enquanto o
  // profissional já está com o Orçamento aberto — não escreve nada no banco, pra não
  // duplicar a entrada.
  useEffect(() => {
    if (isLocked) return;
    const q = query(
      collection(db, 'signRequests'),
      where('patientId', '==', patient.id),
      where('status', '==', 'signed')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const hasSignedBudget = snap.docs.some(d => d.data().docType === 'budget');
      if (hasSignedBudget) {
        setIsLocked(true);
        showToast('Orçamento assinado remotamente — guardado no prontuário e travado pra edição');
      }
    });
    return () => unsubscribe();
  }, [patient.id, isLocked]);

  const handleGenerate = async (
    mode: 'download' | 'view' = 'download',
    override?: { items: { description: string; value: string }[]; total: number; notes?: string; validityDays: string; budgetNumber?: number }
  ) => {
    const validItems = override ? override.items : items.filter(it => it.description.trim() && parseCurrencyInput(it.value) > 0);
    const genTotal = override ? override.total : total;
    const genNotes = override ? (override.notes || '') : notes;
    const genValidityDays = override ? override.validityDays : validityDays;
    if (validItems.length === 0) {
      if (override) {
        // Reimpressão de um orçamento assinado antes da correção que passou a guardar
        // os itens de verdade no momento do envio — pra esses mais antigos, só o total
        // ficou salvo, os itens individuais genuinamente não existem mais. Ainda assim
        // gera o documento com o que tem (total), em vez de travar com uma mensagem que
        // não faz sentido nesse contexto ("adicione um item").
        if (!genTotal) {
          showToast('Esse orçamento foi assinado antes de uma correção no sistema e não tem dados suficientes salvos pra reimprimir.', 'error');
          return;
        }
      } else {
        showToast('Adicione ao menos um item com descrição e valor', 'error');
        return;
      }
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

      // Desenha o rodapé (dados da clínica) na página atual — usado tanto ao trocar de
      // página quanto no final do documento, pra repetir em todas, não só na última
      const drawFooter = () => {
        const footerParts = [clinicName, settings?.clinicAddress, settings?.whatsappNumber].filter(Boolean);
        if (footerParts.length === 0) return;
        docPdf.setFontSize(8);
        docPdf.setTextColor(154, 144, 132);
        docPdf.setFont('helvetica', 'normal');
        docPdf.text(footerParts.join(' · '), pageWidth / 2, pageHeight - 12, { align: 'center' });
      };

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
      docPdf.text(`ORÇAMENTO DE PROCEDIMENTO${override?.budgetNumber ? ` Nº ${override.budgetNumber}` : ''}`, pageWidth / 2, y + 6.5, { align: 'center' });
      y += 20;

      // Antes de desenhar qualquer bloco de conteúdo, checa se está perto do fim da
      // página — se estiver, desenha o rodapé na página atual, cria uma nova página,
      // repete a logo pequena + faixa no topo (mesmo layout da primeira página) e volta
      // o cursor pro corpo. Sem isso, orçamentos com muitos itens ou observações longas
      // transbordavam sem nunca criar página 2, cortando conteúdo e nunca repetindo o
      // cabeçalho nem o rodapé.
      const checkPageBreak = (neededSpace: number = 20) => {
        if (y > pageHeight - 30 - neededSpace) {
          drawFooter();
          docPdf.addPage();
          y = 18;
          if (watermarkLogoUrl && watermarkLogoProps) {
            const logoWidth = 30;
            const ratioHeight = (logoWidth * watermarkLogoProps.height) / watermarkLogoProps.width;
            docPdf.addImage(watermarkLogoUrl, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, ratioHeight);
            y += ratioHeight + 6;
          }
          docPdf.setFillColor(234, 223, 212);
          docPdf.rect(0, y, pageWidth, 8, 'F');
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(8);
          docPdf.setTextColor(255, 255, 255);
          docPdf.text('ORÇAMENTO DE PROCEDIMENTO (continuação)', pageWidth / 2, y + 5.5, { align: 'center' });
          y += 16;
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(11);
          docPdf.setTextColor(92, 84, 78);
        }
      };

      // Marca onde a "caixa" de conteúdo começa — desenhada por cima no final (só a
      // borda, sem preencher, pra não cobrir o texto), envolvendo dados do paciente +
      // itens + total, igual ao enquadramento em caixa arredondada usado nos outros
      // documentos (Termos, Anamnese, etc, via buildLetterheadHtml)
      const boxStartY = y - 4;
      const boxStartPage = (docPdf as any).getNumberOfPages();

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
      if (validItems.length === 0) {
        docPdf.setFontSize(9);
        docPdf.setTextColor(154, 144, 132);
        docPdf.text('Detalhes dos itens não disponíveis (orçamento assinado antes de uma correção no sistema).', margin + 2, y);
        y += 8;
        docPdf.setFontSize(11);
        docPdf.setTextColor(92, 84, 78);
      }
      validItems.forEach(it => {
        checkPageBreak(10);
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
      docPdf.text(`R$ ${genTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: 'right' });
      y += 16;

      // Borda arredondada ao redor de tudo que foi desenhado desde o início (dados do
      // paciente, itens, total) — só o contorno, sem preencher, pra não cobrir o texto
      // que já está desenhado por baixo. Mesmo visual de "caixa" usado nos outros
      // documentos do app.
      docPdf.setDrawColor(240, 234, 227); // #F0EAE3, mesma cor de borda dos outros documentos
      docPdf.setLineWidth(0.4);
      if ((docPdf as any).getNumberOfPages() === boxStartPage) {
        docPdf.roundedRect(margin - 6, boxStartY, pageWidth - (margin - 6) * 2, y - boxStartY - 6, 4, 4, 'S');
      }

      // Observações
      if (genNotes) {
        checkPageBreak(20);
        docPdf.setFontSize(9);
        docPdf.setTextColor(154, 144, 132);
        const noteLines = docPdf.splitTextToSize(genNotes, pageWidth - margin * 2);
        docPdf.text(noteLines, margin, y);
        y += noteLines.length * 5 + 6;
      }

      // Validade
      checkPageBreak(10);
      docPdf.setFontSize(9);
      docPdf.setTextColor(154, 144, 132);
      docPdf.text(`Este orçamento é válido por ${genValidityDays} dias a partir da data de emissão.`, margin, y);
      y += 16;

      // Dados do profissional — nome e CRO, logo abaixo do orçamento, mesmo padrão dos
      // outros documentos (receituário, atestado). checkPageBreak(30) garante que o
      // bloco inteiro (linha + nome + CRO) sempre caiba junto na mesma página, nunca
      // quebrando entre a assinatura/nome e o resto — se não coubesse mais nada disso
      // na página atual, tudo vai junto pra página seguinte.
      const professionalName = settings?.professionalName || '';
      const registrationNumber = settings?.registrationNumber || '';
      if (professionalName || registrationNumber) {
        checkPageBreak(30);
        docPdf.setDrawColor(234, 223, 212);
        docPdf.line(margin, y, pageWidth - margin, y);
        y += 8;
        docPdf.setFontSize(10);
        docPdf.setTextColor(92, 84, 78);
        docPdf.setFont('helvetica', 'bold');
        if (professionalName) docPdf.text(professionalName, margin, y);
        docPdf.setFont('helvetica', 'normal');
        docPdf.setTextColor(154, 144, 132);
        docPdf.setFontSize(9);
        if (registrationNumber) docPdf.text(`CRO nº ${registrationNumber}`, margin, y + (professionalName ? 5 : 0));
      }

      drawFooter();

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
      if (mode === 'view') {
        window.open(docPdf.output('bloburl'), '_blank');
        showToast('Orçamento aberto — use o botão de impressão do visualizador');
      } else {
        docPdf.save(fileName);
        showToast('Orçamento baixado');
      }
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

      {isLocked && (
        <div className="p-6 bg-[#F0F7F0] border border-[#8BA888]/30 rounded-3xl flex items-center gap-3">
          <CheckCircle2 size={20} className="text-[#8BA888] shrink-0" />
          <p className="text-xs text-[#4A433D]">
            Este orçamento foi assinado remotamente pelo paciente e está travado — não pode mais ser editado.
            Consulte o histórico abaixo pra ver os detalhes assinados.
          </p>
        </div>
      )}

      <fieldset disabled={isLocked} className="contents">
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
                    Da anamnese{(item.quantity || 1) > 1 ? ` — ${item.quantity}x` : ''}
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
            {item.allowDiscount && (
              <div className="flex items-center gap-2 mt-2 ml-1">
                <div className="flex items-center bg-[#FDF3E7] rounded-full px-3 py-1.5 gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#C9A15A]">Desconto</span>
                  <input
                    type="number"
                    min="0"
                    max={item.maxDiscountPercent ?? 0}
                    value={item.discountPercent || ''}
                    onChange={e => applyDiscount(idx, parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-10 bg-transparent text-xs text-center outline-none text-[#C9A15A] font-bold"
                  />
                  <span className="text-[10px] text-[#C9A15A] font-bold">% (máx {item.maxDiscountPercent ?? 0}%)</span>
                </div>
                {(item.discountPercent || 0) > 0 && (
                  <span className="text-[10px] text-[#9CA3AF] line-through">
                    R$ {parseCurrencyInput(item.originalValue || '0').toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                )}
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

      </fieldset>

      <div className="flex gap-3">
        <button
          disabled={generating}
          onClick={() => handleGenerate('view')}
          className="flex-1 py-5 bg-[#EADFD4] text-white rounded-[28px] font-bold text-xs uppercase tracking-widest shadow-md hover:bg-[#DFCFBF] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <Eye size={20} />
          {generating ? 'Gerando...' : 'Visualizar e Imprimir'}
        </button>
        <button
          disabled={generating}
          onClick={() => handleGenerate('download')}
          className="flex-1 py-5 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-[28px] font-bold text-xs uppercase tracking-widest shadow-sm hover:border-[#EADFD4] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <FileDown size={20} />
          Baixar PDF
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setShowBudgetSignSend(true)}
          disabled={total <= 0 || isLocked}
          className="flex-1 py-4 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:border-[#EADFD4] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <MessageCircle size={16} /> Assinatura Remota
        </button>
        {(patient.budgetHistory?.length || 0) > 0 && (
          <button
            onClick={() => setShowBudgetHistory(true)}
            className="flex-1 py-4 bg-white border border-[#F5F2F0] text-[#9CA3AF] rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:text-[#4A433D] transition-all flex items-center justify-center gap-2"
          >
            <History size={16} /> Histórico ({patient.budgetHistory!.length})
          </button>
        )}
      </div>

      {settings?.pixKey && total > 0 && (
        <PixPaymentSection pixKey={settings.pixKey} amount={total} merchantName={settings.clinicName || settings.professionalName || 'Clinica'} />
      )}

      <div className="pt-2 border-t border-[#F5F2F0]">
        <p className="text-[10px] text-[#9CA3AF] font-light text-center mb-3 mt-4">
          Gerar o orçamento é só o documento — nada entra no financeiro até o pagamento ser confirmado.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleSaveAsPending}
            disabled={total <= 0 || savingPending || isLocked}
            className="flex-1 py-5 bg-white border-2 border-[#F5F2F0] text-[#4A433D] rounded-[28px] font-bold text-xs uppercase tracking-widest hover:border-[#EADFD4] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Clock size={18} />
            {savingPending ? 'Salvando...' : 'Paciente Não Aceitou Agora'}
          </button>
          <button
            onClick={() => setShowConfirmLaunch(true)}
            disabled={total <= 0 || isLocked}
            className="flex-1 py-5 bg-[#8BA888] text-white rounded-[28px] font-bold text-xs uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 size={18} />
            Confirmar Lançamento
          </button>
        </div>
        {!isLocked && (
          <button
            onClick={handleCancelBudget}
            className="w-full mt-3 py-3 text-[#9CA3AF] hover:text-red-400 font-bold text-[10px] uppercase tracking-widest transition-all"
          >
            Cancelar
          </button>
        )}
        <p className="text-[10px] text-[#9CA3AF] font-light text-center mt-2">
          "Paciente Não Aceitou Agora" salva o orçamento por 15 dias sem lançar nada no financeiro — quando ele
          pagar, marque como pago na lista abaixo.
        </p>
      </div>

      {(patient.pendingBudgets || []).filter(p => p.status === 'pending').length > 0 && (
        <div className="pt-6 border-t border-[#F5F2F0] space-y-4">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Orçamentos Aguardando Pagamento</p>
          {(patient.pendingBudgets || []).filter(p => p.status === 'pending').map(entry => {
            const isExpired = new Date(entry.validUntil) < new Date();
            return (
              <div key={entry.id} className={`p-6 rounded-[28px] border ${isExpired ? 'bg-red-50 border-red-100' : 'bg-[#FDFBF9] border-[#F5F2F0]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-[#4A433D]">
                      R$ {entry.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest mt-0.5">
                      Salvo em {new Date(entry.date).toLocaleDateString('pt-BR')} —{' '}
                      {isExpired
                        ? <span className="text-red-400 font-bold">Vencido em {new Date(entry.validUntil).toLocaleDateString('pt-BR')}</span>
                        : `Válido até ${new Date(entry.validUntil).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-[#9CA3AF] font-light mb-4">
                  {entry.items.map(it => it.description).join(', ')}
                </p>
                <button
                  onClick={() => handleMarkPendingAsPaid(entry)}
                  disabled={markingPaidId === entry.id}
                  className="w-full py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-md hover:bg-[#7C9979] transition-all disabled:opacity-50"
                >
                  {markingPaidId === entry.id ? 'Confirmando...' : 'Marcar como Pago'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showBudgetSignSend && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white/85 backdrop-blur-xl w-full max-w-md rounded-[40px] p-10 shadow-2xl">
            <div className="w-14 h-14 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4] mb-6">
              <MessageCircle size={24} />
            </div>
            <h3 className="serif text-2xl text-[#4A433D] mb-3">Enviar Orçamento pra Assinatura</h3>
            <p className="text-sm text-[#9CA3AF] font-light leading-relaxed mb-8">
              O paciente vai receber um link pra revisar e assinar o orçamento do próprio celular. A assinatura
              fica guardada permanentemente no prontuário, junto com qualquer orçamento assinado antes.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setShowBudgetSignSend(false)} className="flex-1 py-4 text-[#9CA3AF] font-bold text-[10px] uppercase">Cancelar</button>
              <button
                onClick={() => handleSendBudgetForSignature('whatsapp')}
                disabled={sendingBudgetSign}
                className="flex-1 py-4 bg-[#8BA888] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#7A9877] transition-all disabled:opacity-50"
              >
                WhatsApp
              </button>
              <button
                onClick={() => handleSendBudgetForSignature('email')}
                disabled={sendingBudgetSign}
                className="flex-1 py-4 bg-[#B8846E] text-white rounded-2xl font-bold text-[10px] uppercase shadow-md hover:bg-[#A6735E] transition-all disabled:opacity-50"
              >
                E-mail
              </button>
            </div>
          </div>
        </div>
      )}

      {showBudgetHistory && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white/85 backdrop-blur-xl w-full max-w-2xl max-h-[85vh] rounded-[40px] p-10 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h3 className="serif text-2xl text-[#4A433D]">Histórico de Orçamentos Assinados</h3>
              <button onClick={() => setShowBudgetHistory(false)} className="text-[#9CA3AF] hover:text-[#4A433D]"><X size={24} /></button>
            </div>
            <div className="space-y-4">
              {[...(patient.budgetHistory || [])].reverse().map((entry, i) => (
                <details key={i} className="bg-[#FDFBF9] rounded-3xl border border-[#F5F2F0] overflow-hidden">
                  <summary className="p-6 cursor-pointer flex items-center justify-between text-sm font-semibold text-[#4A433D]">
                    <span>{entry.budgetNumber ? `Nº ${entry.budgetNumber} — ` : ''}{new Date(entry.date).toLocaleDateString('pt-BR')} — R$ {entry.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </summary>
                  <div className="p-6 pt-0 space-y-3 text-xs text-[#4A433D] font-light">
                    {entry.items.map((it, idx) => (
                      <p key={idx}>{it.description} — R$ {parseCurrencyInput(it.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    ))}
                    {entry.notes && <p className="italic pt-2">{entry.notes}</p>}
                    <div className="pt-3 border-t border-[#F5F2F0] text-center">
                      <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-1">Assinatura do Paciente</p>
                      <img src={entry.signatureUrl} alt="Assinatura" style={{ maxHeight: 70, margin: '0 auto', mixBlendMode: 'multiply' }} />
                      {entry.sentVia && (
                        <p className="text-[10px] text-[#9CA3AF] mt-1">
                          Assinado remotamente — link enviado por {entry.sentVia === 'whatsapp' ? 'WhatsApp' : 'e-mail'} para {entry.sentTo}
                        </p>
                      )}
                      <p className="text-[10px] text-[#9CA3AF] mt-1">Assinado em {new Date(entry.signedAt).toLocaleString('pt-BR')}</p>
                    </div>
                    {settings?.professionalSignatureUrl && (
                      <div className="pt-3 border-t border-[#F5F2F0] text-center">
                        <p className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-1">Assinatura do Profissional</p>
                        <img src={settings.professionalSignatureUrl} alt="Assinatura do Profissional" style={{ maxHeight: 60, margin: '0 auto', mixBlendMode: 'multiply' }} />
                        <p className="text-[10px] text-[#4A433D] mt-1">
                          {settings?.professionalName || ''}{settings?.registrationNumber ? ` — CRO nº ${settings.registrationNumber}` : ''}
                        </p>
                      </div>
                    )}
                    <button
                      onClick={() => handleGenerate('view', { items: entry.items, total: entry.total, notes: entry.notes, validityDays: entry.validityDays, budgetNumber: entry.budgetNumber })}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-[#B8846E] hover:text-[#A6735E] uppercase tracking-widest pt-2"
                    >
                      <Printer size={12} /> Reimprimir
                    </button>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}

      {showConfirmLaunch && (
        <div className="fixed inset-0 bg-[#4A433D]/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white/85 backdrop-blur-xl w-full max-w-md rounded-[40px] p-10 shadow-2xl">
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

// Mostra o QR Code Pix pro valor exato do orçamento — o paciente escaneia com o próprio
// banco (ou copia o código) e paga sem sair do WhatsApp/celular. Gerado 100% no
// navegador (sem gateway de pagamento pago por trás), então o app não sabe sozinho
// quando o Pix cai — continue confirmando manualmente como já era feito antes.
function PixPaymentSection({ pixKey, amount, merchantName }: { pixKey: string; amount: number; merchantName: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [showPix, setShowPix] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatePix = async () => {
    try {
      const QRCode = await import('qrcode');
      const payload = buildPixPayload({
        pixKey,
        merchantName,
        merchantCity: 'BRASIL',
        amount,
        txid: `ORC${Date.now().toString().slice(-8)}`,
      });
      const dataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 1 });
      setQrDataUrl(dataUrl);
      setPixCode(payload);
      setShowPix(true);
    } catch (err) {
      showToast('Erro ao gerar o QR Code Pix', 'error');
    }
  };

  const handleCopy = async () => {
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Não foi possível copiar — selecione o código manualmente', 'error');
    }
  };

  if (!showPix) {
    return (
      <button
        onClick={generatePix}
        className="w-full py-4 bg-[#F0F7F0] text-[#8BA888] rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-[#E5EFE5] transition-all flex items-center justify-center gap-2"
      >
        <QrCode size={16} /> Gerar Pix pra Pagamento — R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </button>
    );
  }

  return (
    <div className="p-6 bg-[#FDFBF9] rounded-3xl border border-[#F5F2F0] text-center">
      <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-4">
        Pix — R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
      {qrDataUrl && <img src={qrDataUrl} alt="QR Code Pix" className="mx-auto rounded-2xl border border-[#F5F2F0]" />}
      <button
        onClick={handleCopy}
        className="w-full mt-4 py-3 bg-white border border-[#F5F2F0] text-[#4A433D] rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:border-[#8BA888] transition-all flex items-center justify-center gap-2"
      >
        {copied ? <CheckCircle2 size={14} className="text-[#8BA888]" /> : <Copy size={14} />}
        {copied ? 'Copiado!' : 'Copiar Código Pix'}
      </button>
      <p className="text-[9px] text-[#9CA3AF] mt-3">
        Depois de confirmar o pagamento no seu banco, marque o orçamento como pago normalmente.
      </p>
    </div>
  );
}
