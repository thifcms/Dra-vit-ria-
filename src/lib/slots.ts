// Horário de atendimento padrão usado tanto na agenda interna quanto na página pública
export const CLINIC_HOURS = Array.from({ length: 14 }, (_, i) => {
  const h = i + 8;
  return `${h < 10 ? '0' + h : h}:00`;
});

// ID determinístico do documento em busySlots — usado pra "reservar" um horário de forma
// atômica: se o slot já existir, a escrita cai na regra de update (sempre negada), então
// duas pessoas nunca conseguem ocupar o mesmo horário ao mesmo tempo.
export function slotId(clinicId: string, date: string, time: string): string {
  return `${clinicId}_${date}_${time.replace(':', '')}`;
}
