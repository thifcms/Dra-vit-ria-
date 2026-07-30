// Rascunho de Política de Privacidade — escrito pra cobrir o básico exigido pela LGPD
// (finalidade, dados coletados, direitos do titular, retenção, terceiros envolvidos).
// IMPORTANTE: isso é um ponto de partida, não um documento jurídico revisado. Antes de
// considerar isso definitivo, vale ter um advogado conferindo a base legal e os termos
// exatos — principalmente o prazo de guarda (o CFM exige no mínimo 10 anos de prontuário,
// o que limita o direito de exclusão normalmente garantido pela LGPD).

export const PRIVACY_POLICY_TEXT = `
Última atualização: ${new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' })}

1. QUEM SOMOS
Esta política se aplica ao uso do sistema de agendamento e prontuário desta clínica. Ao aceitar este termo, você concorda com a coleta e o uso dos seus dados pessoais conforme descrito abaixo.

2. QUAIS DADOS COLETAMOS
Ao agendar uma consulta ou ser atendido(a), podemos coletar: nome completo, CPF, telefone, e-mail, data de nascimento, e — durante o atendimento clínico — informações de saúde (anamnese, condições médicas, alergias, medicações em uso, avaliações, fotos clínicas e evolução do tratamento).

3. PARA QUE USAMOS SEUS DADOS
- Agendar, confirmar e gerenciar suas consultas
- Manter seu prontuário clínico, conforme exigido pelas normas do Conselho Federal de Medicina
- Enviar lembretes e confirmações de consulta (e-mail e/ou WhatsApp)
- Gerar registros financeiros relacionados ao seu atendimento

4. BASE LEGAL
O tratamento dos seus dados de saúde é realizado com base no seu consentimento explícito e na tutela da saúde, conduzida por profissional de saúde, conforme previsto na Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

5. COM QUEM SEUS DADOS SÃO COMPARTILHADOS
Seus dados são armazenados em serviços de infraestrutura (Google Firebase) e, quando aplicável, processados por serviços de envio de e-mail (Resend) apenas para as finalidades acima. Não vendemos nem compartilhamos seus dados com terceiros para fins de marketing.

5.1. ARMAZENAMENTO EM NUVEM PARA CONSULTAS FUTURAS
Seus dados ficam guardados na nuvem da clínica, de forma segura, justamente para que seu histórico esteja disponível em consultas futuras — sem precisar refazer seu cadastro ou repetir informações já fornecidas anteriormente.

5.2. ESTE DOCUMENTO ASSINADO
Este documento, uma vez assinado, fica arquivado permanentemente no seu prontuário e pode ser consultado depois pela equipe da clínica na área de documentos assinados pelo paciente. Depois de assinado, o conteúdo deste documento não pode mais ser editado — nem pelo paciente, nem pela equipe da clínica.

6. POR QUANTO TEMPO GUARDAMOS SEUS DADOS
Seu prontuário é mantido por, no mínimo, 10 anos, conforme exigência do Conselho Federal de Medicina, mesmo após o encerramento do tratamento.

7. SEUS DIREITOS
Você pode, a qualquer momento, solicitar: confirmação de que tratamos seus dados, acesso aos dados, correção de informações incorretas, e informações sobre com quem compartilhamos seus dados. Solicitações de exclusão são atendidas na medida em que não conflitem com a obrigação legal de guarda do prontuário.

8. CONTATO
Para exercer seus direitos ou tirar dúvidas sobre o tratamento dos seus dados, entre em contato diretamente com a clínica.
`.trim();
