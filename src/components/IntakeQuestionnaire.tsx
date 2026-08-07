import React, { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';
import SignaturePad from 'react-signature-canvas';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Patient } from '../types';

const PHOTO_CONSENT_TEXT = 'Autorizo a realização de documentação fotográfica referente ao procedimento realizado, que poderá ser utilizada para fins de acompanhamento do procedimento e para uso do médico em atividades científicas.';
const IMAGE_DISCLOSURE_TEXT = 'Autorizo divulgação de autorretrato (selfies) e imagens relativas ao "antes e depois" do procedimento, nos perfis pessoais nas redes sociais da CONTRATADA, conforme permissão da Resolução nº 196/2019 do Conselho Federal de Odontologia (CFO), desde que a divulgação contenha o nome da CONTRATADA, acompanhado do número de inscrição junto ao Conselho Regional de Odontologia (CRO).';

interface MedicalConditions {
  diabetes: boolean; hypertension: boolean; heartProblems: boolean; autoimmune: boolean;
  cancerHistory: boolean; keloid: boolean; herpes: boolean; epilepsy: boolean;
  hivHepatitis: boolean; pacemaker: boolean; anticoagulant: boolean; isotretinoin: boolean;
}
interface Lifestyle {
  smoking: boolean; alcohol: boolean; exercise: boolean; sunExposure: boolean; sunscreen: boolean;
}
const emptyConditions: MedicalConditions = {
  diabetes: false, hypertension: false, heartProblems: false, autoimmune: false,
  cancerHistory: false, keloid: false, herpes: false, epilepsy: false,
  hivHepatitis: false, pacemaker: false, anticoagulant: false, isotretinoin: false,
};
const emptyLifestyle: Lifestyle = {
  smoking: false, alcohol: false, exercise: false, sunExposure: false, sunscreen: false,
};

function YesNoToggle({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-2 shrink-0">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
          value === true ? 'bg-[#8BA888] border-[#8BA888] text-white' : 'bg-white border-[#F5F2F0] text-[#9CA3AF] hover:border-[#8BA888]/40'
        }`}
      >
        Sim
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
          value === false ? 'bg-[#B8846E] border-[#B8846E] text-white' : 'bg-white border-[#F5F2F0] text-[#9CA3AF] hover:border-[#B8846E]/40'
        }`}
      >
        Não
      </button>
    </div>
  );
}

function Question({ label, value, onChange, children }: { label: string; value: boolean | null; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="py-4 border-b border-[#F5F2F0] last:border-0">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[#4A433D]">{label}</p>
        <YesNoToggle value={value} onChange={onChange} />
      </div>
      {value === true && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

// Aplica a máscara DD/MM/AAAA automaticamente enquanto a pessoa digita — só números,
// barras inseridas sozinhas nas posições certas. Evita qualquer confusão de formato
// (mês/dia trocados, digitação livre) numa data que precisa estar em português certinho.
function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/40 transition-all text-sm"
      />
    </div>
  );
}

interface CheckPillProps {
  active: boolean;
  onClick: () => void;
  label: string;
}
function CheckPill({ active, onClick, label }: CheckPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 rounded-2xl text-xs font-medium border transition-all text-left ${
        active ? 'bg-[#8BA888] border-[#8BA888] text-white' : 'bg-[#FDFBF9] border-[#F5F2F0] text-[#9CA3AF] hover:border-[#8BA888]/40'
      }`}
    >
      {label}
    </button>
  );
}

// Ficha clínica preenchida pelo próprio paciente, depois de confirmar a chegada
// (check-in) — sem login. O token do check-in (já validado nessa mesma sessão) autoriza
// o envio. Todas as respostas ficam pendentes até o profissional abrir o prontuário
// desse paciente, quando são mescladas automaticamente na anamnese e nos termos.
export default function IntakeQuestionnaire({ appointmentId, patientId, patientName, ownerId }: {
  appointmentId: string;
  patientId: string;
  patientName: string;
  ownerId: string;
}) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);

  React.useEffect(() => {
    getDoc(doc(db, 'patients', patientId))
      .then(snap => { if (snap.exists()) setPatient(snap.data() as Patient); })
      .finally(() => setLoadingPatient(false));
  }, [patientId]);

  // Dados de cadastro complementares
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [profession, setProfession] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [howHeard, setHowHeard] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Assim que carrega o cadastro do paciente, pré-preenche tudo que já se sabe — evita
  // pedir de novo o que o paciente já informou antes (no agendamento online, por
  // exemplo). Só preenche campos que ainda estão vazios, nunca sobrescreve o que a
  // pessoa já tiver digitado nessa tela.
  React.useEffect(() => {
    if (!patient) return;
    setBirthDate(prev => prev || patient.birthDate || '');
    setAddress(prev => prev || patient.address || '');
    setEmail(prev => prev || patient.email || '');
    setProfession(prev => prev || patient.profession || '');
    setMaritalStatus(prev => prev || patient.maritalStatus || '');
    setHowHeard(prev => prev || patient.howHeardAboutClinic || '');
    setEmergencyContactName(prev => prev || patient.emergencyContactName || '');
    setEmergencyContactPhone(prev => prev || patient.emergencyContactPhone || '');
  }, [patient]);

  // Questionário de saúde
  const [usedToxinBefore, setUsedToxinBefore] = useState<boolean | null>(null);
  const [lastToxinDate, setLastToxinDate] = useState('');
  const [toxinTimes, setToxinTimes] = useState('');
  const [usedPMMA, setUsedPMMA] = useState<boolean | null>(null);
  const [hadPastComplications, setHadPastComplications] = useState<boolean | null>(null);
  const [pastComplicationsDetail, setPastComplicationsDetail] = useState('');
  const [hasFoodAllergy, setHasFoodAllergy] = useState<boolean | null>(null);
  const [foodAllergyDetail, setFoodAllergyDetail] = useState('');
  const [hasInsectAllergy, setHasInsectAllergy] = useState<boolean | null>(null);
  const [insectAllergyDetail, setInsectAllergyDetail] = useState('');
  const [hadFillerBefore, setHadFillerBefore] = useState<boolean | null>(null);
  const [fillerProduct, setFillerProduct] = useState('');
  const [isBreastfeeding, setIsBreastfeeding] = useState<boolean | null>(null);
  const [isPregnant, setIsPregnant] = useState<boolean | null>(null);
  const [hasMedicalConditions, setHasMedicalConditions] = useState<boolean | null>(null);
  const [medicalConditions, setMedicalConditions] = useState<MedicalConditions>(emptyConditions);
  const [hasCoagulationDisease, setHasCoagulationDisease] = useState<boolean | null>(null);
  const [coagulationDiseaseDetail, setCoagulationDiseaseDetail] = useState('');
  const [bleedsEasily, setBleedsEasily] = useState<boolean | null>(null);
  const [hadHemorrhageOrHerpes, setHadHemorrhageOrHerpes] = useState<boolean | null>(null);
  const [hemorrhageOrHerpesDetail, setHemorrhageOrHerpesDetail] = useState('');
  const [hasAnemia, setHasAnemia] = useState<boolean | null>(null);
  const [hasMedicationAllergy, setHasMedicationAllergy] = useState<boolean | null>(null);
  const [medicationAllergyDetail, setMedicationAllergyDetail] = useState('');
  const [usesContinuousMedication, setUsesContinuousMedication] = useState<boolean | null>(null);
  const [continuousMedicationDetail, setContinuousMedicationDetail] = useState('');
  const [lifestyle, setLifestyle] = useState<Lifestyle>(emptyLifestyle);

  const [mainComplaint, setMainComplaint] = useState('');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [imageDisclosureConsent, setImageDisclosureConsent] = useState(false);
  const [attestTruth, setAttestTruth] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sem isso, quem estivesse rolado lá embaixo (perto do botão "Enviar") não via a
  // mensagem de erro aparecer no topo — clicava, nada parecia acontecer, e parecia que o
  // formulário estava travado mesmo com tudo certo. Agora, ao aparecer um erro, rola a
  // tela pro topo automaticamente pra garantir que a pessoa veja o que falta.
  React.useEffect(() => {
    if (errorMsg) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [errorMsg]);

  const sigPad = React.useRef<any>(null);

  const allHealthAnswered = [
    usedToxinBefore, usedPMMA, hadPastComplications, hasFoodAllergy, hasInsectAllergy,
    hadFillerBefore, isBreastfeeding, isPregnant, hasMedicalConditions,
    hasCoagulationDisease, bleedsEasily, hadHemorrhageOrHerpes,
    hasAnemia, hasMedicationAllergy, usesContinuousMedication,
  ].every(v => v !== null);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!allHealthAnswered) {
      setErrorMsg('Responda todas as perguntas do questionário de saúde (Sim ou Não).');
      return;
    }
    if (!attestTruth) {
      setErrorMsg('Confirme que as informações fornecidas são verdadeiras.');
      return;
    }
    if (!photoConsent) {
      setErrorMsg('A autorização de documentação fotográfica é obrigatória para prosseguir.');
      return;
    }
    if (!sigPad.current || sigPad.current.isEmpty()) {
      setErrorMsg('A assinatura é obrigatória.');
      return;
    }
    setSubmitting(true);
    try {
      const signatureUrl = sigPad.current.toDataURL();
      await setDoc(doc(db, 'intakeSubmissions', appointmentId), {
        patientId,
        patientName,
        ownerId,
        submittedAt: new Date().toISOString(),
        mergedIntoRecord: false,
        birthDate, address, email, profession, maritalStatus, howHeardAboutClinic: howHeard,
        emergencyContactName, emergencyContactPhone,
        usedToxinBefore, lastToxinDate, toxinTimes,
        usedPMMA: !!usedPMMA,
        hadPastComplications: !!hadPastComplications, pastComplicationsDetail,
        hasFoodAllergy: !!hasFoodAllergy, foodAllergyDetail,
        hasInsectAllergy: !!hasInsectAllergy, insectAllergyDetail,
        hadFillerBefore: !!hadFillerBefore, fillerProduct,
        isPregnant: !!isPregnant,
        isBreastfeeding: !!isBreastfeeding,
        hasCoagulationDisease: !!hasCoagulationDisease, coagulationDiseaseDetail,
        bleedsEasily: !!bleedsEasily,
        hadHemorrhageOrHerpes: !!hadHemorrhageOrHerpes, hemorrhageOrHerpesDetail,
        hasAnemia: !!hasAnemia,
        hasMedicationAllergy: !!hasMedicationAllergy, medicationAllergyDetail,
        usesContinuousMedication: !!usesContinuousMedication, continuousMedicationDetail,
        hasMedicalConditions: !!hasMedicalConditions,
        medicalConditions: hasMedicalConditions ? medicalConditions : emptyConditions,
        lifestyle,
        mainComplaint,
        photoDocumentationConsent: photoConsent,
        imageDisclosureConsent: imageDisclosureConsent,
        signatureUrl,
      });
      setDone(true);
    } catch (err) {
      setErrorMsg('Não foi possível enviar. Tente novamente em instantes.');
    }
    setSubmitting(false);
  };

  if (loadingPatient) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#FDFBF9]">
        <div className="w-8 h-8 border-2 border-[#EADFD4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#FDFBF9] p-6 text-center gap-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <CheckCircle2 size={48} className="text-[#8BA888]" />
        </motion.div>
        <p className="text-[#4A433D] font-medium text-lg serif">Ficha enviada com sucesso!</p>
        <p className="text-sm text-[#9CA3AF] font-light max-w-xs">Avise a recepção. Você será chamado(a) em breve.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9] pb-16" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="text-center pt-10 pb-6 px-6">
        <img src="/logo/logo-full-v2.png" alt="Dra. Vitória Oliveira" className="h-20 w-auto mx-auto object-contain" />
      </div>
      <div className="bg-[#EADFD4] py-3 px-6 text-center mb-8">
        <p className="text-white text-xs font-bold uppercase tracking-[0.2em]">Ficha Clínica do Paciente</p>
      </div>

      <div className="max-w-lg mx-auto px-6 space-y-6">
        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-500 font-medium text-center">
            {errorMsg}
          </div>
        )}

        {/* Dados pessoais */}
        <div className="bg-white rounded-[28px] border border-[#F5F2F0] p-6 space-y-4">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">Dados Pessoais</p>
          <div>
            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
            <p className="p-4 bg-[#FDFBF9] rounded-2xl text-sm text-[#4A433D]">{patientName}</p>
          </div>
          <TextField label="Data de Nascimento" value={birthDate} onChange={v => setBirthDate(formatDateInput(v))} placeholder="DD/MM/AAAA" />
          <TextField label="Endereço" value={address} onChange={setAddress} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="E-mail" value={email} onChange={setEmail} />
            <TextField label="Profissão" value={profession} onChange={setProfession} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Estado Civil" value={maritalStatus} onChange={setMaritalStatus} />
            <TextField label="Por onde conheceu a clínica?" value={howHeard} onChange={setHowHeard} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Contato de Emergência (nome)" value={emergencyContactName} onChange={setEmergencyContactName} />
            <TextField label="Contato de Emergência (telefone)" value={emergencyContactPhone} onChange={setEmergencyContactPhone} />
          </div>
        </div>

        {/* Questionário de saúde */}
        <div className="bg-white rounded-[28px] border border-[#F5F2F0] p-6">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-1">Questionário de Saúde</p>
          <p className="text-[10px] text-[#9CA3AF] font-light mb-2">Para sua segurança, responda corretamente as perguntas abaixo</p>

          <Question label="Você já utilizou toxina botulínica (Botox, Dysport, Xeomim, Prosigne, etc.)?" value={usedToxinBefore} onChange={setUsedToxinBefore}>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Quando foi a última aplicação?" value={lastToxinDate} onChange={setLastToxinDate} />
              <TextField label="Quantas vezes?" value={toxinTimes} onChange={setToxinTimes} />
            </div>
          </Question>
          <Question label="Já fez procedimento com uso de PMMA?" value={usedPMMA} onChange={setUsedPMMA} />
          <Question label="Já teve intercorrências passadas (nódulo, edema tardio intermitente persistente - ETIPE)?" value={hadPastComplications} onChange={setHadPastComplications}>
            <TextField label="Descreva a intercorrência" value={pastComplicationsDetail} onChange={setPastComplicationsDetail} />
          </Question>
          <Question label="Possui alergia a algum alimento?" value={hasFoodAllergy} onChange={setHasFoodAllergy}>
            <TextField label="Qual alimento?" value={foodAllergyDetail} onChange={setFoodAllergyDetail} />
          </Question>
          <Question label="Possui alergia a picada de inseto?" value={hasInsectAllergy} onChange={setHasInsectAllergy}>
            <TextField label="Qual inseto / qual reação?" value={insectAllergyDetail} onChange={setInsectAllergyDetail} />
          </Question>
          <Question label="Já realizou preenchimento facial?" value={hadFillerBefore} onChange={setHadFillerBefore}>
            <TextField label="Qual produto?" value={fillerProduct} onChange={setFillerProduct} />
          </Question>
          {patient?.sex !== 'M' && (
            <>
              <Question label="(Mulheres) Está amamentando?" value={isBreastfeeding} onChange={setIsBreastfeeding} />
              <Question label="(Mulheres) Está grávida?" value={isPregnant} onChange={setIsPregnant} />
            </>
          )}
          <Question label="Tem alguma condição médica?" value={hasMedicalConditions} onChange={setHasMedicalConditions}>
            <p className="text-[10px] text-[#9CA3AF] mb-2">Marque todas que se aplicam:</p>
            <div className="grid grid-cols-2 gap-2">
              <CheckPill active={medicalConditions.diabetes} onClick={() => setMedicalConditions({ ...medicalConditions, diabetes: !medicalConditions.diabetes })} label="Diabetes" />
              <CheckPill active={medicalConditions.hypertension} onClick={() => setMedicalConditions({ ...medicalConditions, hypertension: !medicalConditions.hypertension })} label="Hipertensão" />
              <CheckPill active={medicalConditions.heartProblems} onClick={() => setMedicalConditions({ ...medicalConditions, heartProblems: !medicalConditions.heartProblems })} label="Problemas Cardíacos" />
              <CheckPill active={medicalConditions.autoimmune} onClick={() => setMedicalConditions({ ...medicalConditions, autoimmune: !medicalConditions.autoimmune })} label="Doença Autoimune" />
              <CheckPill active={medicalConditions.cancerHistory} onClick={() => setMedicalConditions({ ...medicalConditions, cancerHistory: !medicalConditions.cancerHistory })} label="Histórico de Câncer" />
              <CheckPill active={medicalConditions.keloid} onClick={() => setMedicalConditions({ ...medicalConditions, keloid: !medicalConditions.keloid })} label="Queloide" />
              <CheckPill active={medicalConditions.herpes} onClick={() => setMedicalConditions({ ...medicalConditions, herpes: !medicalConditions.herpes })} label="Herpes" />
              <CheckPill active={medicalConditions.epilepsy} onClick={() => setMedicalConditions({ ...medicalConditions, epilepsy: !medicalConditions.epilepsy })} label="Epilepsia" />
              <CheckPill active={medicalConditions.hivHepatitis} onClick={() => setMedicalConditions({ ...medicalConditions, hivHepatitis: !medicalConditions.hivHepatitis })} label="HIV/Hepatite" />
              <CheckPill active={medicalConditions.pacemaker} onClick={() => setMedicalConditions({ ...medicalConditions, pacemaker: !medicalConditions.pacemaker })} label="Marca-passo" />
              <CheckPill active={medicalConditions.anticoagulant} onClick={() => setMedicalConditions({ ...medicalConditions, anticoagulant: !medicalConditions.anticoagulant })} label="Anticoagulante" />
              <CheckPill active={medicalConditions.isotretinoin} onClick={() => setMedicalConditions({ ...medicalConditions, isotretinoin: !medicalConditions.isotretinoin })} label="Isotretinoína (Roacutan)" />
            </div>
          </Question>
          <Question label="Tem alguma doença que interfira na coagulação?" value={hasCoagulationDisease} onChange={setHasCoagulationDisease}>
            <TextField label="Qual doença?" value={coagulationDiseaseDetail} onChange={setCoagulationDiseaseDetail} />
          </Question>
          <Question label="Sangra muito depois de ferido?" value={bleedsEasily} onChange={setBleedsEasily} />
          <Question label="Já teve hemorragia ou herpes?" value={hadHemorrhageOrHerpes} onChange={setHadHemorrhageOrHerpes}>
            <TextField label="Descreva" value={hemorrhageOrHerpesDetail} onChange={setHemorrhageOrHerpesDetail} />
          </Question>
          <Question label="Anemia?" value={hasAnemia} onChange={setHasAnemia} />
          <Question label="Já teve reação alérgica a algum medicamento ou substância?" value={hasMedicationAllergy} onChange={setHasMedicationAllergy}>
            <TextField label="Se sim, quais?" value={medicationAllergyDetail} onChange={setMedicationAllergyDetail} />
          </Question>
          <Question label="Você está fazendo uso de alguma medicação?" value={usesContinuousMedication} onChange={setUsesContinuousMedication}>
            <TextField label="Qual?" value={continuousMedicationDetail} onChange={setContinuousMedicationDetail} />
          </Question>

          <div className="mt-4 pt-4 border-t border-[#F5F2F0] flex items-start gap-3">
            <input type="checkbox" checked={attestTruth} onChange={e => setAttestTruth(e.target.checked)} className="mt-1 accent-[#8BA888] w-4 h-4 shrink-0" />
            <p className="text-xs text-[#9CA3AF]">Atesto que são verdadeiras as informações acima fornecidas.</p>
          </div>
        </div>

        {/* Estilo de vida */}
        <div className="bg-white rounded-[28px] border border-[#F5F2F0] p-6">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-1">Estilo de Vida</p>
          <p className="text-[10px] text-[#9CA3AF] font-light mb-4">Marque o que se aplica</p>
          <div className="grid grid-cols-2 gap-2">
            <CheckPill active={lifestyle.smoking} onClick={() => setLifestyle({ ...lifestyle, smoking: !lifestyle.smoking })} label="Fuma" />
            <CheckPill active={lifestyle.alcohol} onClick={() => setLifestyle({ ...lifestyle, alcohol: !lifestyle.alcohol })} label="Consome álcool" />
            <CheckPill active={lifestyle.exercise} onClick={() => setLifestyle({ ...lifestyle, exercise: !lifestyle.exercise })} label="Pratica exercícios" />
            <CheckPill active={lifestyle.sunExposure} onClick={() => setLifestyle({ ...lifestyle, sunExposure: !lifestyle.sunExposure })} label="Exposição solar frequente" />
            <CheckPill active={lifestyle.sunscreen} onClick={() => setLifestyle({ ...lifestyle, sunscreen: !lifestyle.sunscreen })} label="Usa protetor solar" />
          </div>
        </div>

        {/* Queixa principal */}
        <div className="bg-white rounded-[28px] border border-[#F5F2F0] p-6">
          <TextField label="Queixa Principal" value={mainComplaint} onChange={setMainComplaint} placeholder="O que te trouxe até aqui hoje?" />
        </div>

        {/* Autorizações */}
        <div className="bg-white rounded-[28px] border border-[#F5F2F0] p-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={photoConsent} onChange={e => setPhotoConsent(e.target.checked)} className="mt-1 accent-[#8BA888] w-4 h-4 shrink-0" />
            <p className="text-xs text-[#4A433D] leading-relaxed">{PHOTO_CONSENT_TEXT}</p>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={imageDisclosureConsent} onChange={e => setImageDisclosureConsent(e.target.checked)} className="mt-1 accent-[#8BA888] w-4 h-4 shrink-0" />
            <p className="text-xs text-[#4A433D] leading-relaxed">
              <span className="text-[9px] font-bold text-[#9CA3AF] uppercase tracking-widest block mb-1">Opcional</span>
              {IMAGE_DISCLOSURE_TEXT}
            </p>
          </label>
        </div>

        {/* Assinatura */}
        <div className="bg-white rounded-[28px] border border-[#F5F2F0] p-6">
          <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">Assinatura (obrigatória)</p>
          <div className="bg-[#FDFBF9] rounded-2xl border-2 border-[#F5F2F0] overflow-hidden relative">
            <SignaturePad ref={sigPad} canvasProps={{ className: 'w-full h-40' }} backgroundColor="#FDFBF9" />
            <button onClick={() => sigPad.current?.clear()} className="absolute top-3 right-3 p-2 bg-white rounded-full text-[#9CA3AF] hover:text-[#4A433D] shadow-sm">
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-500 font-medium text-center">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-[#4A433D] text-white rounded-2xl font-bold text-[11px] uppercase tracking-widest shadow-lg hover:bg-[#5C544E] transition-all disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Enviar Ficha Clínica'}
        </button>
      </div>
    </div>
  );
}
