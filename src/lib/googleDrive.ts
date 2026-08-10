// Envia arquivos de backup direto pro Google Drive do administrador, sem precisar de
// servidor próprio — usa o "modelo de token" do Google Identity Services, que é o
// método atualmente recomendado pelo Google pra apps sem backend como esse (diferente
// do fluxo antigo "implicit grant", que o próprio Google já desaconselha). O token pedido
// só dá acesso a arquivos que ESSE app cria (escopo drive.file) — nunca ao Drive inteiro
// da pessoa, mesmo com consentimento dado.
//
// Exige um Client ID OAuth configurado em Configurações → Gestão (criado pelo próprio
// administrador no Google Cloud Console — não é algo que o código consegue gerar sozinho).

declare global {
  interface Window {
    google?: any;
  }
}

let gisScriptLoaded: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisScriptLoaded) return gisScriptLoaded;
  gisScriptLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Identity Services'));
    document.head.appendChild(script);
  });
  return gisScriptLoaded;
}

// Abre o popup de consentimento do Google (só na primeira vez, ou quando o token expira
// — dura 1h) e devolve um access_token válido pra usar nas próximas chamadas à API do
// Drive nesse mesmo clique. loginHint sugere a conta certa (a da clínica) já
// pré-selecionada na tela do Google, evitando autorizar sem querer com a conta pessoal
// de quem estiver logado no navegador na hora.
function requestAccessToken(clientId: string, loginHint?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        hint: loginHint || undefined,
        callback: (response: any) => {
          if (response.error) { reject(new Error(response.error)); return; }
          resolve(response.access_token);
        },
      });
      tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

// Envia um Blob pro Google Drive — pensado pra usar a conta do e-mail próprio da
// clínica (contato.dravitoriaoliveira@gmail.com), não a conta pessoal de quem estiver
// operando o sistema. loginHint pré-seleciona essa conta na tela de login do Google.
export async function uploadToGoogleDrive(blob: Blob, filename: string, clientId: string, loginHint?: string): Promise<void> {
  if (!clientId) {
    throw new Error('Google Drive ainda não foi configurado — cadastre o Client ID em Configurações → Gestão.');
  }
  await loadGisScript();
  const accessToken = await requestAccessToken(clientId, loginHint);

  // Acha (ou cria, na primeira vez) a pasta de backups, pra não espalhar os arquivos
  // soltos na raiz do Drive
  const folderName = 'Backups — Clínica Digital';
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  let folderId = searchData.files?.[0]?.id;

  if (!folderId) {
    const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
    });
    const createFolderData = await createFolderRes.json();
    folderId = createFolderData.id;
  }

  // Upload multipart — metadata (nome, pasta) + o conteúdo do arquivo, numa única
  // requisição, sem precisar carregar a biblioteca gapi inteira
  const metadata = { name: filename, parents: folderId ? [folderId] : undefined };
  const boundary = 'clinica_digital_backup_boundary';
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileBuffer = await blob.arrayBuffer();
  const closeDelim = `\r\n--${boundary}--`;

  const bodyParts = [
    new Blob([metadataPart], { type: 'text/plain' }),
    new Blob([`--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`], { type: 'text/plain' }),
    new Blob([fileBuffer]),
    new Blob([closeDelim], { type: 'text/plain' }),
  ];
  const requestBody = new Blob(bodyParts);

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: requestBody,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`Falha no envio ao Drive (${uploadRes.status}): ${errText}`);
  }
}
