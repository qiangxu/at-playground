"use client";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import yaml from "js-yaml";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";

type TokenRow = { token: string, restrictor?: string, chainId: number };

const erc20 = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }]},
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }]},
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }]},
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }]},
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }]}
] as const;

function Connect() {
  const { address, status } = useAccount();
  const [trying, setTrying] = useState(false);
  const doConnect = async () => {
    setTrying(true);
    try { await (window as any).ethereum?.request({ method: "eth_requestAccounts" }); } finally { setTrying(false); }
  };
  if (status === "connected") return <div className="text-sm">已连接: {address}</div>;
  return <button className="px-3 py-2 border rounded" onClick={doConnect} disabled={trying}>{trying?"连接中...":"连接钱包"}</button>;
}

export default function Page() {
  const { address } = useAccount();
  const [list, setList] = useState<TokenRow[]>([]);

  useEffect(() => {
    fetch(`${apiBase}/api/tokens`).then(r=>r.json()).then(d=>setList(d.data||[]));
  }, []);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">投资者入口 M2</h1>
      <Connect />
      <div className="grid gap-4">
        {list.map((t) => <TokenCard key={t.token} row={t} me={address as string|undefined} />)}
      </div>
    </main>
  );
}

function TokenCard({ row, me }: { row: TokenRow, me?: string }) {
  const [meta, setMeta] = useState<any>({});
  useEffect(() => {
    fetch(`${apiBase}/api/tokens/${row.token}`).then(r=>r.json()).then(d=>setMeta(d.data||{}));
  }, [row.token]);

  const { data: bal } = useReadContract({
    address: row.token as `0x${string}`,
    abi: erc20 as any,
    functionName: "balanceOf",
    args: me ? [me as `0x${string}`] : undefined,
    query: { enabled: !!me }
  });

  const [amount, setAmount] = useState("");
  const submitIntent = async () => {
    const body = { token: row.token, buyer: me, amount };
    const r = await fetch(`${apiBase}/api/purchase-intents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    alert(d.ok?`已提交意向: ${d.id}`:`失败: ${d.error}`);
  };

  return (
    <div className="border rounded p-4 space-y-2">
      <div className="font-semibold">{meta.name} {meta.symbol}</div>
      <div className="text-xs break-all">{row.token}</div>
      <div className="text-sm">totalSupply: {meta.totalSupply}</div>
      {me && <div className="text-sm">my balance: {bal?.toString?.() || "0"}</div>}
      <div className="flex gap-2 items-center">
        <input className="border p-2 flex-1" placeholder="amount(wei)" value={amount} onChange={e=>setAmount(e.target.value)} />
        <button className="px-3 py-2 bg-black text-white rounded" onClick={submitIntent} disabled={!me || !amount}>购买意向</button>
      </div>
    </div>
  );
}
