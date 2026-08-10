// Páginas públicas (agendamento, ficha clínica, assinatura remota, check-in) são
// acessadas por pacientes no celular, muitas vezes logo após abrir um link vindo do
// WhatsApp — nesse momento é comum a conexão cair por um instante (troca de rede,
// sinal fraco, o navegador ainda "esquentando"). Antes, uma falha nessa hora único
// carregamento travava a pessoa numa tela de erro sem saída, precisando fechar e pedir
// o link de novo. Essa função tenta de novo automaticamente antes de desistir.
export async function fetchWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 800): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
