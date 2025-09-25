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
        // 新增：在前端打印 Privy user 对象中的 email
        console.log('[WEB] Email from Privy user object:', user.email?.address);

        const tok = await getAccessToken();
        if (!tok) return;

        setAccessToken(tok);

        try {
          console.log('[WEB] 准备发送 /auth/privy 请求...');
          // Step 1: Authenticate with your backend, now sending email as well
          await api.post('/auth/privy', { 
            idToken: tok,
            email: user.email?.address, // <-- 新增：将 email 一起发送
          });
          console.log('[WEB] /auth/privy 请求发送成功！');

          // Step 2: Register the user's wallet if it exists
          const addr = user.wallet?.address;
          if (addr) {
            await api.post('/wallets/register', { address: addr, provider: 'PRIVY', kind: 'EMBEDDED' });
          }
          
          alert('Login & wallet bind done');
        } catch (error) {
          console.error('[WEB] API 调用失败:', error); 
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
