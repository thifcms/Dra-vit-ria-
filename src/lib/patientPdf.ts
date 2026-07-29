import { Patient, ClinicSettings } from '../types';

const CONDITION_LABELS: Record<string, string> = {
  diabetes: 'Diabetes',
  hypertension: 'Hipertensão',
  heartProblems: 'Problemas Cardíacos',
  autoimmune: 'Doença Autoimune',
  cancerHistory: 'Histórico de Câncer',
  keloid: 'Queloide',
  herpes: 'Herpes',
  epilepsy: 'Epilepsia',
  hivHepatitis: 'HIV/Hepatite',
  pacemaker: 'Marca-passo',
  pregnant: 'Gestante',
  breastfeeding: 'Amamentando',
  anticoagulant: 'Uso de Anticoagulante',
  isotretinoin: 'Uso de Isotretinoína',
  contraceptive: 'Uso de Anticoncepcional',
};

const HABIT_LABELS: Record<string, string> = {
  smoking: 'Fumante',
  alcohol: 'Consome Álcool',
  exercise: 'Pratica Exercícios',
  sunExposure: 'Exposição Solar Frequente',
  sunscreen: 'Usa Protetor Solar',
};

// Gera um PDF completo de um prontuário — dados cadastrais, anamnese (rascunho e todo o
// histórico liberado) e evolução clínica (rascunhos e histórico liberado). Pensado pra
// backup/leitura fora do sistema, não pra impressão bonita — prioriza ter TUDO, não design.
export async function generatePatientPdf(patient: Patient, clinicSettings: ClinicSettings | null): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  const checkPageBreak = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addSectionTitle = (title: string) => {
    checkPageBreak(14);
    y += 4;
    doc.setFillColor(245, 242, 240);
    doc.rect(margin, y - 5, pageWidth - margin * 2, 8, 'F');
    doc.setFontSize(10);
    doc.setTextColor(74, 67, 61);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin + 2, y);
    y += 10;
    doc.setFont('helvetica', 'normal');
  };

  const addField = (label: string, value?: string | number | boolean | null) => {
    if (value === undefined || value === null || value === '') return;
    checkPageBreak(7);
    doc.setFontSize(8.5);
    doc.setTextColor(154, 144, 132);
    doc.text(label.toUpperCase(), margin, y);
    doc.setFontSize(10);
    doc.setTextColor(74, 67, 61);
    const displayValue = typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value);
    const lines = doc.splitTextToSize(displayValue, pageWidth - margin * 2);
    doc.text(lines, margin, y + 5);
    y += 5 + lines.length * 5 + 2;
  };

  const addDivider = () => {
    checkPageBreak(6);
    doc.setDrawColor(234, 223, 212);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };

  // Cabeçalho
  doc.setFontSize(16);
  doc.setTextColor(74, 67, 61);
  doc.setFont('helvetica', 'bold');
  doc.text(clinicSettings?.clinicName || clinicSettings?.professionalName || 'Clínica', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(154, 144, 132);
  doc.text(`Prontuário exportado em ${new Date().toLocaleString('pt-BR')}`, margin, y);
  y += 10;

  // Dados Cadastrais
  addSectionTitle('DADOS CADASTRAIS');
  addField('Nome', patient.name);
  addField('CPF', patient.cpf);
  addField('Telefone', patient.phone);
  addField('E-mail', patient.email);
  addField('Data de Nascimento', patient.birthDate);
  addField('Sexo', patient.sex === 'F' ? 'Feminino' : patient.sex === 'M' ? 'Masculino' : undefined);
  addField('Endereço', patient.address);
  addField('Consentimento LGPD Aceito em', patient.privacyConsentAt ? new Date(patient.privacyConsentAt).toLocaleString('pt-BR') : undefined);

  // Anamnese atual (rascunho ou liberada)
  const a = patient.anamnesis;
  if (a) {
    addDivider();
    addSectionTitle(`ANAMNESE ATUAL ${patient.anamnesisReleased ? '(LIBERADA)' : '(RASCUNHO)'}`);
    if (patient.anamnesisReleased) {
      addField('Liberada em', patient.anamnesisReleasedAt ? new Date(patient.anamnesisReleasedAt).toLocaleString('pt-BR') : undefined);
      addField('Liberada por', patient.anamnesisReleasedBy);
    }
    addField('Queixa Principal', a.mainComplaint);
    addField('Expectativas', a.expectations);
    const activeConditions = Object.entries(a.conditions || {}).filter(([, v]) => v).map(([k]) => CONDITION_LABELS[k] || k);
    addField('Condições de Saúde', activeConditions.length ? activeConditions.join(', ') : 'Nenhuma relatada');
    addField('Outras Condições', a.otherConditions);
    addField('Alergias', a.hasAllergies ? a.allergiesDetails || 'Sim (sem detalhes)' : 'Não relatadas');
    addField('Medicação Contínua', a.hasContinuousMedication ? a.medicationsDetails || 'Sim (sem detalhes)' : 'Não relatada');
    addField('Histórico Familiar', a.familyHistory);
    const activeHabits = Object.entries(a.habits || {}).filter(([k, v]) => k !== 'diet' && v).map(([k]) => HABIT_LABELS[k] || k);
    addField('Hábitos', activeHabits.length ? activeHabits.join(', ') : undefined);
    addField('Alimentação', a.habits?.diet);
    addField('Fototipo (Fitzpatrick)', a.fitzpatrickType);
    addField('Avaliação da Pele', a.skinEvaluation);
    addField('Avaliação Facial/Corporal', a.faceEvaluation);
  }

  // Histórico de anamneses liberadas anteriormente
  if (patient.anamnesisHistory && patient.anamnesisHistory.length > 0) {
    addDivider();
    addSectionTitle(`HISTÓRICO DE ANAMNESES LIBERADAS (${patient.anamnesisHistory.length})`);
    patient.anamnesisHistory.forEach((h, i) => {
      checkPageBreak(10);
      doc.setFontSize(9);
      doc.setTextColor(184, 132, 110);
      doc.text(`${i + 1}. Liberada em ${new Date(h.releasedAt).toLocaleString('pt-BR')} por ${h.releasedBy}`, margin, y);
      y += 6;
      addField('Queixa Principal', h.snapshot?.mainComplaint);
      addField('Avaliação da Pele', h.snapshot?.skinEvaluation);
      addField('Avaliação Facial', h.snapshot?.faceEvaluation);
    });
  }

  // Evolução — rascunhos
  if (patient.evolution && patient.evolution.length > 0) {
    addDivider();
    addSectionTitle(`EVOLUÇÃO CLÍNICA — RASCUNHOS (${patient.evolution.length})`);
    patient.evolution.forEach(e => {
      checkPageBreak(14);
      doc.setFontSize(9.5);
      doc.setTextColor(74, 67, 61);
      doc.setFont('helvetica', 'bold');
      doc.text(`${new Date(e.date).toLocaleDateString('pt-BR')} — ${e.procedure}`, margin, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      addField('Observações', e.notes);
      addField('Detalhes Técnicos', e.bucoMaxiloNotes);
      addField('Valor Numérico', e.numericValue);
    });
  }

  // Evolução — histórico liberado
  if (patient.evolutionHistory && patient.evolutionHistory.length > 0) {
    addDivider();
    addSectionTitle(`EVOLUÇÃO CLÍNICA — HISTÓRICO LIBERADO (${patient.evolutionHistory.length})`);
    patient.evolutionHistory.forEach(e => {
      checkPageBreak(16);
      doc.setFontSize(9.5);
      doc.setTextColor(74, 67, 61);
      doc.setFont('helvetica', 'bold');
      doc.text(`${new Date(e.date).toLocaleDateString('pt-BR')} — ${e.procedure}`, margin, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      addField('Observações', e.notes);
      addField('Detalhes Técnicos', e.bucoMaxiloNotes);
      addField('Liberado em', new Date(e.releasedAt).toLocaleString('pt-BR'));
      addField('Liberado por', e.releasedBy);
    });
  }

  return doc.output('blob');
}

export function patientPdfFileName(patient: Patient): string {
  const safeName = (patient.name || 'paciente').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  return `prontuario-${safeName}-${patient.id?.slice(0, 6) || ''}.pdf`;
}
