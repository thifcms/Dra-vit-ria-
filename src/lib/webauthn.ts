// Biometria (Face ID / Touch ID / impressão digital / Windows Hello) via WebAuthn — o
// padrão nativo dos navegadores pra isso. A checagem biométrica em si acontece dentro do
// próprio aparelho (o navegador nunca vê nem envia a digital/rosto pra lugar nenhum); o
// que a gente guarda é só um identificador de credencial, sem nenhum dado biométrico.
//
// Assim como o PIN, isso é uma trava de conveniência no dispositivo — não substitui o
// login do Google, que continua sendo o controle de acesso de verdade. Por isso a
// verificação aqui é só "a cerimônia do WebAuthn completou com sucesso?", sem precisar de
// um backend validando assinatura criptográfica (o que seria necessário pra um login
// biométrico "de verdade", sozinho, sem outro fator).

function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Cadastra a biometria do aparelho, retornando o ID da credencial (guardado no Firestore)
export async function registerBiometric(userId: string, userEmail: string, displayName: string): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBuffer = new TextEncoder().encode(userId);

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Clínica Digital' },
      user: {
        id: userIdBuffer,
        name: userEmail,
        displayName: displayName || userEmail,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Face ID/Touch ID/impressão digital do próprio aparelho, não chave externa
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  }) as PublicKeyCredential;

  if (!credential) throw new Error('Cadastro de biometria cancelado');
  return bufferToBase64(credential.rawId);
}

// Verifica a biometria do aparelho contra a credencial já cadastrada
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64ToBuffer(credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
