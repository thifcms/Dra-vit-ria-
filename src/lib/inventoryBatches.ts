import { InventoryBatch } from '../types';

// Desconta uma quantidade dos lotes de um item, sempre tirando primeiro do lote que
// vence mais cedo (FEFO — First Expire, First Out) — prática padrão em clínicas pra
// insumos injetáveis, evita que um lote mais novo seja usado enquanto um mais antigo
// (que vence antes) fica parado até vencer sem ser aproveitado.
// Lotes sem validade cadastrada vão pro final da fila (assume-se que não vencem, ou que
// a validade simplesmente não foi informada ainda).
// Devolve tanto os lotes atualizados (pra gravar no estoque) quanto quais lotes/
// quantidades específicas foram consumidos agora (pra registrar no prontuário do
// paciente qual lote exato ele recebeu — rastreabilidade em caso de recall/reação).
export function deductFromBatchesFEFO(
  batches: InventoryBatch[] | undefined,
  amount: number
): { updatedBatches: InventoryBatch[]; usedFrom: { lotNumber?: string; expiryDate?: string; quantity: number }[] } {
  if (!batches || batches.length === 0) return { updatedBatches: [], usedFrom: [] };
  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate.localeCompare(b.expiryDate);
  });
  let remaining = amount;
  const result: InventoryBatch[] = [];
  const usedFrom: { lotNumber?: string; expiryDate?: string; quantity: number }[] = [];
  for (const batch of sorted) {
    if (remaining <= 0) {
      result.push(batch);
      continue;
    }
    const deduct = Math.min(batch.quantity, remaining);
    remaining -= deduct;
    if (deduct > 0) usedFrom.push({ lotNumber: batch.lotNumber, expiryDate: batch.expiryDate, quantity: deduct });
    const newQty = batch.quantity - deduct;
    if (newQty > 0) result.push({ ...batch, quantity: newQty });
    // lotes que zeraram somem da lista — não tem mais nada ali
  }
  return { updatedBatches: result, usedFrom };
}

// Soma um novo lote (de uma compra) à lista de lotes existente
export function addBatch(batches: InventoryBatch[] | undefined, newBatch: InventoryBatch): InventoryBatch[] {
  return [...(batches || []), newBatch];
}

// Quantos frascos/ampolas ainda serão necessários pra atender uma demanda total, dado o
// que já resta em estoque e o tamanho de cada frasco — considera primeiro o que já está
// disponível nos lotes existentes antes de contar frascos novos. Também informa quanto
// sobraria no último frasco usado, útil pra saber se dá pra atender mais um paciente sem
// abrir um frasco novo.
export function estimateContainersNeeded(
  batches: InventoryBatch[] | undefined,
  totalNeeded: number
): { containersNeeded: number; leftoverInStock: number; leftoverAfterUse: number } {
  const availableInStock = (batches || []).reduce((sum, b) => sum + b.quantity, 0);
  const shortfall = Math.max(0, totalNeeded - availableInStock);
  // Usa o tamanho de frasco do lote mais recente cadastrado como referência, já que é o
  // mais provável de refletir o produto que continua sendo comprado
  const referenceBatch = [...(batches || [])].reverse().find(b => b.volumePerContainer && b.volumePerContainer > 0);
  const containerSize = referenceBatch?.volumePerContainer || 0;
  const containersNeeded = containerSize > 0 ? Math.ceil(shortfall / containerSize) : 0;
  const leftoverAfterUse = availableInStock - Math.min(availableInStock, totalNeeded) + (containersNeeded * containerSize) - shortfall;
  return { containersNeeded, leftoverInStock: availableInStock, leftoverAfterUse };
}

// Lote mais próximo de vencer entre todos os lotes de um item — usado pra mostrar o
// aviso na listagem do estoque sem precisar abrir cada item
export function nearestExpiry(batches: InventoryBatch[] | undefined): string | undefined {
  if (!batches || batches.length === 0) return undefined;
  const withExpiry = batches.filter(b => b.expiryDate && b.quantity > 0);
  if (withExpiry.length === 0) return undefined;
  return withExpiry.reduce((earliest, b) => (b.expiryDate! < earliest ? b.expiryDate! : earliest), withExpiry[0].expiryDate!);
}

// Quantos dias faltam até uma data de validade (negativo = já venceu)
export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
