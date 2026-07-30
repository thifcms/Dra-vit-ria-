import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
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
// Sem isso, o Google costuma pular direto pra última conta usada nesse aparelho, sem
// mostrar a lista de contas pra escolher. Isso força sempre aparecer a tela de escolha.
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Voltou a usar signInWithPopup: signInWithRedirect causava um loop de login nesse app
// (a volta do redirecionamento não estava sendo reconhecida em alguns navegadores/contas,
// mandando de volta pra tela de login em vez de completar o acesso). Popup é o método
// mais previsível aqui, dado esse comportamento observado.
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

// Login por e-mail e senha — pra quem não tem conta Google. signInEmail tenta entrar;
// signUpEmail cria a conta na primeira vez (a autorização de acesso continua sendo
// checada depois, pela lista system/authorized_admins ou authorized_staff, do mesmo
// jeito que já acontece com login por Google — ter conta aqui não dá acesso sozinho).
export const signInEmail = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
export const signUpEmail = (email: string, password: string) => createUserWithEmailAndPassword(auth, email, password);
export const resetPasswordEmail = (email: string) => sendPasswordResetEmail(auth, email);

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
