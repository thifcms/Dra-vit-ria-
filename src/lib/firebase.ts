import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// ignoreUndefinedProperties: sem isso, o Firestore recusa (lança erro) qualquer escrita que
// tenha um campo com valor `undefined` — o que acontece toda vez que um campo opcional
// (ex: e-mail, CPF, valor do procedimento) é deixado em branco e cai como `undefined` no
// objeto salvo. Isso já causava falha silenciosa em vários formulários do app.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true }, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Voltou a usar signInWithPopup: signInWithRedirect causava um loop de login nesse app
// (a volta do redirecionamento não estava sendo reconhecida em alguns navegadores/contas,
// mandando de volta pra tela de login em vez de completar o acesso). Popup é o método
// mais previsível aqui, dado esse comportamento observado.
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
