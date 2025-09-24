'use client';
import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function Home() {
  const { login, ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const [accessToken, setAccessToken] = useState<string>('');

  // useEffect to handle logic after authentication state changes
  useEffect(() => {
    const handleLogin = async () => {
      if (authenticated && user) {
        const tok = await getAccessToken();
        if (!tok) return;

        setAccessToken(tok);

        try {
          // Step 1: Authenticate with your backend
          await api.post('/auth/privy', { idToken: tok });

          // Step 2: Register the user's wallet if it exists
          const addr = user.wallet?.address;
          if (addr) {
            await api.post('/wallets/register', { address: addr, provider: 'PRIVY', kind: 'EMBEDDED' });
          }
          
          alert('Login & wallet bind done');
        } catch (error) {
          console.error('API call failed:', error);
          alert('An error occurred during login or wallet registration.');
        }
      }
    };

    handleLogin();
  }, [authenticated, user, getAccessToken]); // Dependencies ensure this runs when auth state is updated

  return (
    <main style={{ padding: 24 }}>
      <h1>AT Playground</h1>
      {!authenticated ? (
        <button onClick={login} disabled={!ready}>Login with Privy</button>
      ) : (
        <>
          <div>Address: {user?.wallet?.address}</div>
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
