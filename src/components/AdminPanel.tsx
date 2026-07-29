import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db, googleProvider } from '../lib/firebase';
import { reauthenticateWithPopup } from 'firebase/auth';
import { User } from 'firebase/auth';
import { hashPin } from '../lib/pin';
import { registerBiometric, verifyBiometric, isPlatformAuthenticatorAvailable } from '../lib/webauthn';
import { AdminSecurity } from '../types';
import { Shield, Plus, Trash2, Fingerprint, Lock, KeyRound } from 'lucide-react';
import { showToast } from '../lib/toast';

const SESSION_KEY = 'adminPanelUnlocked';

export default function AdminPanel({ user }: { user: User }) {
  const [security, setSecurity] = useState<AdminSecurity | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [staffEmails, setStaffEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newEmailRole, setNewEmailRole] = useState<'admin' | 'staff'>('staff');

  useEffect(() => {
    getDoc(doc(db, 'admin_security', user.uid)).then(snap => {
      setSecurity(snap.exists() ? (snap.data() as AdminSecurity) : {});
      setLoading(false);
    });
    isPlatformAuthenticatorAvailable().then(setBiometricAvailable);
  }, [user.uid]);

  useEffect(() => {
    if (!unlocked) return;
    getDoc(doc(db, 'system', 'authorized_admins')).then(snap => {
      setAdminEmails(snap.exists() ? (snap.data().emails || []) : []);
    });
    getDoc(doc(db, 'system', 'authorized_staff')).then(snap => {
      setStaffEmails(snap.exists() ? (snap.data().emails || []) : []);
    });
  }, [unlocked]);

  const handleSetInitialPassword = async () => {
    if (newPassword.length < 6) {
      showToast('A senha precisa ter pelo menos 6 caracteres', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('As senhas não coincidem', 'error');
      return;
    }
    const passwordHash = await hashPin(newPassword);
    await setDoc(doc(db, 'admin_security', user.uid), { passwordHash }, { merge: true });
    setSecurity(prev => ({ ...prev, passwordHash }));
    sessionStorage.setItem(SESSION_KEY, 'true');
    setUnlocked(true);
    showToast('Senha de administrador definida');
  };

  const handleUnlock = async () => {
    const hash = await hashPin(passwordInput);
    if (hash === security?.passwordHash) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setUnlocked(true);
    } else {
      showToast('Senha incorreta', 'error');
    }
    setPasswordInput('');
  };

  const handleBiometricUnlock = async () => {
    if (!security?.webauthnCredentialId) return;
    const ok = await verifyBiometric(security.webauthnCredentialId);
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setUnlocked(true);
    } else {
      showToast('Biometria não reconhecida', 'error');
    }
  };

  const handleRegisterBiometric = async () => {
    try {
      const credentialId = await registerBiometric(user.uid, user.email || '', user.displayName || 'Administrador');
      await setDoc(doc(db, 'admin_security', user.uid), { webauthnCredentialId: credentialId }, { merge: true });
      setSecurity(prev => ({ ...prev, webauthnCredentialId: credentialId }));
      showToast('Biometria ativada pro painel de administração');
    } catch {
      showToast('Não foi possível ativar a biometria', 'error');
    }
  };

  // "Esqueci a senha" — como a pessoa já precisa estar logada com Google pra chegar até
  // aqui, pedir pra confirmar de novo o login do Google (reautenticação) serve como
  // segundo fator pra provar que é ela mesma antes de deixar redefinir a senha
  const handleForgotPassword = async () => {
    try {
      await reauthenticateWithPopup(user, googleProvider);
      setRecovering(true);
      showToast('Identidade confirmada — defina uma nova senha');
    } catch {
      showToast('Não foi possível confirmar sua identidade', 'error');
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      showToast('A senha precisa ter pelo menos 6 caracteres', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('As senhas não coincidem', 'error');
      return;
    }
    const passwordHash = await hashPin(newPassword);
    await setDoc(doc(db, 'admin_security', user.uid), { passwordHash }, { merge: true });
    setSecurity(prev => ({ ...prev, passwordHash }));
    sessionStorage.setItem(SESSION_KEY, 'true');
    setUnlocked(true);
    setRecovering(false);
    setNewPassword('');
    setConfirmPassword('');
    showToast('Senha redefinida com sucesso');
  };

  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('Digite um e-mail válido', 'error');
      return;
    }
    if (adminEmails.includes(email) || staffEmails.includes(email)) {
      showToast('Esse e-mail já está autorizado', 'error');
      return;
    }
    if (newEmailRole === 'admin') {
      const next = [...adminEmails, email];
      await setDoc(doc(db, 'system', 'authorized_admins'), { emails: next }, { merge: true });
      setAdminEmails(next);
    } else {
      const next = [...staffEmails, email];
      await setDoc(doc(db, 'system', 'authorized_staff'), { emails: next }, { merge: true });
      setStaffEmails(next);
    }
    setNewEmail('');
    showToast('E-mail autorizado');
  };

  const handleRemoveEmail = async (email: string, role: 'admin' | 'staff') => {
    if (email === user.email) {
      showToast('Você não pode remover seu próprio acesso por aqui', 'error');
      return;
    }
    if (role === 'admin') {
      if (adminEmails.length <= 1) {
        showToast('Precisa deixar pelo menos um administrador', 'error');
        return;
      }
      const next = adminEmails.filter(e => e !== email);
      await setDoc(doc(db, 'system', 'authorized_admins'), { emails: next }, { merge: true });
      setAdminEmails(next);
    } else {
      const next = staffEmails.filter(e => e !== email);
      await setDoc(doc(db, 'system', 'authorized_staff'), { emails: next }, { merge: true });
      setStaffEmails(next);
    }
    showToast('Acesso removido');
  };

  if (loading) return null;

  // Primeiro acesso — ainda não tem senha definida
  if (!security?.passwordHash && !recovering) {
    return (
      <div className="bg-white rounded-[40px] border border-[#F5F2F0] p-10 max-w-md mx-auto text-center">
        <div className="w-16 h-16 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4] mx-auto mb-6">
          <Shield size={28} />
        </div>
        <h3 className="serif text-2xl text-[#5C544E] mb-2">Defina sua senha de administrador</h3>
        <p className="text-xs text-[#9CA3AF] mb-8 leading-relaxed">
          Essa senha é só sua — cada administrador define a própria, separada da senha dos outros.
          Protege o painel onde é possível autorizar ou remover quem pode acessar o sistema.
        </p>
        <div className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Nova senha (mín. 6 caracteres)"
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-center"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirme a senha"
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-center"
          />
        </div>
        <button
          onClick={handleSetInitialPassword}
          className="w-full mt-6 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[#DFCFBF] transition-all"
        >
          Definir Senha
        </button>
      </div>
    );
  }

  // Recuperação de senha em andamento (já reautenticou, falta só definir a nova)
  if (recovering) {
    return (
      <div className="bg-white rounded-[40px] border border-[#F5F2F0] p-10 max-w-md mx-auto text-center">
        <div className="w-16 h-16 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4] mx-auto mb-6">
          <KeyRound size={28} />
        </div>
        <h3 className="serif text-2xl text-[#5C544E] mb-6">Nova senha</h3>
        <div className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Nova senha (mín. 6 caracteres)"
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-center"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirme a senha"
            className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-center"
          />
        </div>
        <button
          onClick={handleResetPassword}
          className="w-full mt-6 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[#DFCFBF] transition-all"
        >
          Salvar Nova Senha
        </button>
      </div>
    );
  }

  // Trancado — pede a senha (ou biometria) desse administrador
  if (!unlocked) {
    return (
      <div className="bg-white rounded-[40px] border border-[#F5F2F0] p-10 max-w-md mx-auto text-center">
        <div className="w-16 h-16 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4] mx-auto mb-6">
          <Lock size={28} />
        </div>
        <h3 className="serif text-2xl text-[#5C544E] mb-6">Painel de Administração</h3>
        <input
          type="password"
          value={passwordInput}
          onChange={e => setPasswordInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleUnlock()}
          placeholder="Sua senha de administrador"
          className="w-full bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-center"
          autoFocus
        />
        <button
          onClick={handleUnlock}
          className="w-full mt-4 py-4 bg-[#EADFD4] text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-[#DFCFBF] transition-all"
        >
          Entrar
        </button>
        {security?.webauthnCredentialId && (
          <button
            onClick={handleBiometricUnlock}
            className="w-full mt-3 py-4 border border-[#F5F2F0] text-[#5C544E] rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:border-[#EADFD4]/40 transition-all"
          >
            <Fingerprint size={16} /> Usar Biometria
          </button>
        )}
        <button
          onClick={handleForgotPassword}
          className="mt-6 text-[#9CA3AF] text-xs underline"
        >
          Esqueci minha senha
        </button>
      </div>
    );
  }

  // Painel desbloqueado
  return (
    <div className="space-y-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-[#FDFBF9] rounded-2xl flex items-center justify-center text-[#EADFD4]">
          <Shield size={20} />
        </div>
        <div>
          <h3 className="serif text-2xl text-[#5C544E]">Administração de Acesso</h3>
          <p className="text-[10px] text-[#9CA3AF] font-bold uppercase tracking-widest mt-0.5">Quem pode entrar no sistema</p>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">
          Administradores — acesso a todos os prontuários
        </p>
        <div className="space-y-2">
          {adminEmails.map(email => (
            <div key={email} className="flex items-center justify-between p-4 bg-[#FDFBF9] rounded-2xl">
              <span className="text-sm text-[#5C544E]">{email}</span>
              {email !== user.email && (
                <button onClick={() => handleRemoveEmail(email, 'admin')} className="text-[#9CA3AF] hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-3">
          Usuários comuns — acesso só aos próprios pacientes
        </p>
        <div className="space-y-2">
          {staffEmails.length === 0 && (
            <p className="text-xs text-[#9CA3AF] italic">Nenhum usuário comum autorizado ainda.</p>
          )}
          {staffEmails.map(email => (
            <div key={email} className="flex items-center justify-between p-4 bg-[#FDFBF9] rounded-2xl">
              <span className="text-sm text-[#5C544E]">{email}</span>
              <button onClick={() => handleRemoveEmail(email, 'staff')} className="text-[#9CA3AF] hover:text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setNewEmailRole('admin')}
            className={`py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
              newEmailRole === 'admin' ? 'bg-[#EADFD4] text-white' : 'bg-[#FDFBF9] text-[#9CA3AF] border border-[#F5F2F0]'
            }`}
          >
            Administrador
          </button>
          <button
            onClick={() => setNewEmailRole('staff')}
            className={`py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
              newEmailRole === 'staff' ? 'bg-[#EADFD4] text-white' : 'bg-[#FDFBF9] text-[#9CA3AF] border border-[#F5F2F0]'
            }`}
          >
            Usuário Comum
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddEmail()}
            placeholder="novo-email@exemplo.com"
            className="flex-1 bg-[#FDFBF9] border border-[#F5F2F0] rounded-2xl p-4 outline-none focus:border-[#EADFD4]/30 transition-all text-sm"
          />
          <button
            onClick={handleAddEmail}
            className="w-14 h-14 shrink-0 bg-[#EADFD4] text-white rounded-2xl flex items-center justify-center hover:bg-[#DFCFBF] transition-all"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {biometricAvailable && !security?.webauthnCredentialId && (
        <button
          onClick={handleRegisterBiometric}
          className="w-full py-4 border border-[#F5F2F0] text-[#5C544E] rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:border-[#EADFD4]/40 transition-all"
        >
          <Fingerprint size={16} /> Ativar biometria pra esse painel
        </button>
      )}
    </div>
  );
}
