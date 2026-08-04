import React, { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'motion/react';
import SignaturePad from 'react-signature-canvas';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Patient } from '../types';

const PHOTO_CONSENT_TEXT = 'Autorizo a realização de documentação fotográfica referente ao procedimento realizado, que poderá ser utilizada para fins de acompanhamento do procedimento e para uso do médico em atividades científicas.';
const IMAGE_DISCLOSURE_TEXT = 'Autorizo divulgação de autorretrato (selfies) e imagens relativas ao "antes e depois" do procedimento, nos perfis pessoais nas redes sociais da CONTRATADA, conforme permissão da Resolução nº 196/2019 do Conselho Federal de Odontologia (CFO), desde que a divulgação contenha o nome da CONTRATADA, acompanhado do número de inscrição junto ao Conselho Regional de Odontologia (CRO).';

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
  const [rg, setRg] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [profession, setProfession] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [howHeard, setHowHeard] = useState('');

  // Questionário de saúde
  const [usedToxinBefore, setUsedToxinBefore] = useState<boolean | null>(null);
  const [lastToxinDate, setLastToxinDate] = useState('');
  const [toxinTimes, setToxinTimes] = useState('');
  const [hasFoodAllergy, setHasFoodAllergy] = useState<boolean | null>(null);
  const [hadFillerBefore, setHadFillerBefore] = useState<boolean | null>(null);
  const [fillerProduct, setFillerProduct] = useState('');
  const [isBreastfeeding, setIsBreastfeeding] = useState<boolean | null>(null);
  const [isPregnant, setIsPregnant] = useState<boolean | null>(null);
  const [hasCoagulationDisease, setHasCoagulationDisease] = useState<boolean | null>(null);
  const [hasAutoimmuneDisease, setHasAutoimmuneDisease] = useState<boolean | null>(null);
  const [bleedsEasily, setBleedsEasily] = useState<boolean | null>(null);
  const [hadHemorrhageOrHerpes, setHadHemorrhageOrHerpes] = useState<boolean | null>(null);
  const [hasDiabetes, setHasDiabetes] = useState<boolean | null>(null);
  const [hasAnemia, setHasAnemia] = useState<boolean | null>(null);
  const [hasMedicationAllergy, setHasMedicationAllergy] = useState<boolean | null>(null);
  const [medicationAllergyDetail, setMedicationAllergyDetail] = useState('');
  const [usesContinuousMedication, setUsesContinuousMedication] = useState<boolean | null>(null);
  const [continuousMedicationDetail, setContinuousMedicationDetail] = useState('');

  const [mainComplaint, setMainComplaint] = useState('');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [imageDisclosureConsent, setImageDisclosureConsent] = useState(false);
  const [attestTruth, setAttestTruth] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const sigPad = React.useRef<any>(null);

  const allHealthAnswered = [
    usedToxinBefore, hasFoodAllergy, hadFillerBefore, isBreastfeeding, isPregnant,
    hasCoagulationDisease, hasAutoimmuneDisease, bleedsEasily, hadHemorrhageOrHerpes,
    hasDiabetes, hasAnemia, hasMedicationAllergy, usesContinuousMedication,
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
    if (!photoConsent || !imageDisclosureConsent) {
      setErrorMsg('As duas autorizações são obrigatórias para prosseguir.');
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
        birthDate, rg, address, email, profession, maritalStatus, howHeardAboutClinic: howHeard,
        usedToxinBefore, lastToxinDate, toxinTimes,
        hasFoodAllergy: !!hasFoodAllergy,
        hadFillerBefore: !!hadFillerBefore, fillerProduct,
        isPregnant: !!isPregnant,
        isBreastfeeding: !!isBreastfeeding,
        hasCoagulationDisease: !!hasCoagulationDisease,
        hasAutoimmuneDisease: !!hasAutoimmuneDisease,
        bleedsEasily: !!bleedsEasily,
        hadHemorrhageOrHerpes: !!hadHemorrhageOrHerpes,
        hasDiabetes: !!hasDiabetes,
        hasAnemia: !!hasAnemia,
        hasMedicationAllergy: !!hasMedicationAllergy, medicationAllergyDetail,
        usesContinuousMedication: !!usesContinuousMedication, continuousMedicationDetail,
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
        <p className="text-white text-xs font-bold uppercase tracking-[0.2em]">Ficha Clínica do Paciente de Harmonização Facial</p>
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
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Data de Nascimento" value={birthDate} onChange={setBirthDate} placeholder="DD/MM/AAAA" />
            <TextField label="RG" value={rg} onChange={setRg} />
          </div>
          <TextField label="Endereço" value={address} onChange={setAddress} />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="E-mail" value={email} onChange={setEmail} />
            <TextField label="Profissão" value={profession} onChange={setProfession} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Estado Civil" value={maritalStatus} onChange={setMaritalStatus} />
            <TextField label="Por onde conheceu a clínica?" value={howHeard} onChange={setHowHeard} />
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
          <Question label="Possui alergia a algum alimento?" value={hasFoodAllergy} onChange={setHasFoodAllergy} />
          <Question label="Já realizou preenchimento facial?" value={hadFillerBefore} onChange={setHadFillerBefore}>
            <TextField label="Qual produto?" value={fillerProduct} onChange={setFillerProduct} />
          </Question>
          <Question label="(Mulheres) Está amamentando?" value={isBreastfeeding} onChange={setIsBreastfeeding} />
          <Question label="(Mulheres) Está grávida?" value={isPregnant} onChange={setIsPregnant} />
          <Question label="Tem alguma doença que interfira na coagulação?" value={hasCoagulationDisease} onChange={setHasCoagulationDisease} />
          <Question label="Tem alguma doença autoimune?" value={hasAutoimmuneDisease} onChange={setHasAutoimmuneDisease} />
          <Question label="Sangra muito depois de ferido?" value={bleedsEasily} onChange={setBleedsEasily} />
          <Question label="Já teve hemorragia ou herpes?" value={hadHemorrhageOrHerpes} onChange={setHadHemorrhageOrHerpes} />
          <Question label="Diabetes?" value={hasDiabetes} onChange={setHasDiabetes} />
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
            <p className="text-xs text-[#4A433D] leading-relaxed">{IMAGE_DISCLOSURE_TEXT}</p>
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
