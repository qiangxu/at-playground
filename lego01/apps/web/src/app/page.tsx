'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState } from 'react'; // <-- 引入 useState
import { api, setAuthToken } from '@/lib/api';

export default function Home() {
  const {
    ready,
    authenticated,
    user,
    logout,
    login,
    getAccessToken,
  } = usePrivy();
  
  // 新增：用于在 UI 上展示 session token 的 state
  const [sessionToken, setSessionToken] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // useEffect to handle logic after authentication state changes
  useEffect(() => {
    const handleLogin = async () => {
      if (authenticated && user) {
        // 新增：在前端打印 Privy user 对象中的 email
        console.log('[WEB] Email from Privy user object:', user.email?.address);

        const tok = await getAccessToken();
        if (!tok) return;

        try {
          console.log('[WEB] 准备发送 /auth/privy 请求...');
          // Step 1: Authenticate and get the session token
          const authResponse = await api.post('/auth/privy', { 
            idToken: tok,
            email: user.email?.address,
          });

          const receivedToken = authResponse.data.token;
          if (receivedToken) {
            setSessionToken(receivedToken); // <-- 将 token 保存到 state 中以供显示
            setAuthToken(receivedToken);
            console.log('[WEB] Session token has been set for subsequent requests.');
          } else {
            console.warn('[WEB] Login successful, but no session token received.');
          }

          // Step 2: Register wallet (this request will now be authenticated)
          const addr = user.wallet?.address;
          if (addr) {
            console.log('[WEB] 准备发送 /wallet/register请求，addr:', addr);
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

  const handleCopyToken = () => {
    navigator.clipboard.writeText(sessionToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // 2秒后重置复制状态
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
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

      {/* 新增：Token 展示区域 */}
      {sessionToken && (
        <div className="mt-8 p-4 border rounded-lg bg-gray-50 w-full max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-800">Session Token (for debugging)</h2>
          <p className="text-sm text-gray-600 mb-2">Use this token to test authenticated endpoints in other services (like lego04).</p>
          <div className="relative">
            <code className="block w-full p-2 pr-20 border rounded bg-gray-100 text-xs break-all text-gray-700">
              {sessionToken}
            </code>
            <button
              onClick={handleCopyToken}
              className="absolute top-1/2 right-2 transform -translate-y-1/2 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
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
