// Hash simples do PIN de 6 dígitos usando a Web Crypto API nativa do navegador (SHA-256).
// Isso não é uma segurança "de verdade" no sentido de senha de banco — é uma segunda
// checagem local, pra evitar que alguém com acesso físico ao celular já logado no Google
// abra o app direto sem saber o PIN. O controle de acesso real continua sendo as regras
// do Firestore. Por isso um hash simples (sem salt/iterações) já é suficiente aqui — só
// evita guardar o PIN em texto puro no banco.
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}
