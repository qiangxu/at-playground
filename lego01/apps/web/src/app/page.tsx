'use client'
import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function Home() {
  const { login, ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const [accessToken, setAccessToken] = useState<string>('');

  const onLogin = async () => {
    await login();
    const tok = await getAccessToken();
    setAccessToken(tok || '');
    if (tok) {
      await api.post('/auth/privy', { idToken: tok });
      const addr = user?.wallet?.address;
      if (addr) await api.post('/wallets/register', { address: addr, provider: 'PRIVY', kind: 'EMBEDDED' });
      alert('Login & wallet bind done');
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>RH Playground</h1>
      {!authenticated ? (
        <button onClick={onLogin} disabled={!ready}>Login with Privy</button>
      ) : (
        <>
          <p>Address: {user?.wallet?.address}</p>
          <button onClick={() => logout()}>Logout</button>
        </>
      )}
      <KycBlock />
      <GateBlock />
    </main>
  );
}

function KycBlock() {
  const startKyc = async () => {
    const { data } = await api.post('/kyc/session');
    // 简化：弹窗提示；实际应嵌入 Sumsub WebSDK
    alert(`Sumsub token: ${data.sumsub_token}\napplicant: ${data.applicant_id}`);
  };
  return <button onClick={startKyc}>Start KYC</button>;
}

function GateBlock() {
  const check = async () => {
    const { data } = await api.get('/gate/permissions');
    alert(JSON.stringify(data, null, 2));
  };
  return <button onClick={check}>Check Permissions</button>;
}
