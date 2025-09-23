"use client";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useDisconnect, useChainId, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import yaml from "js-yaml";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";

type TokenRow = { token: string, restrictor?: string, chainId: number };
type Order = { id: string, token: string, owner: string, side: "buy"|"sell", price: string, amount: string, filled: string, status: string };
type OrderbookResp = { ok: boolean, data: { buys: Order[], sells: Order[] } };
type IntentRow = { id: string, token: string, buyer: string, amount: string, status: "pending" | "approved" | "rejected", createdAt: number };

const erc20 = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }]},
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }]},
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }]},
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }]},
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }]},
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }]}
] as const;

const escrowAbi = [
  { name: "take", type: "function", stateMutability: "payable", inputs: [{ name: "lotId", type: "bytes32" }, { name: "amount", type: "uint256" }], outputs: [] }
] as const;

function Connect() {
  const { address, status } = useAccount();
  const { disconnect } = useDisconnect();
  const [trying, setTrying] = useState(false);
  const doConnect = async () => {
    setTrying(true);
    try { await (window as any).ethereum?.request({ method: "eth_requestAccounts" }); } finally { setTrying(false); }
  };
  if (status === "connected") return (
    <div className="flex items-center gap-4">
      <div className="text-sm">已连接: {address}</div>
      <button className="px-3 py-2 border rounded text-sm" onClick={() => disconnect()}>断开连接</button>
    </div>
  );
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
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [meta, setMeta] = useState<any>({});
  useEffect(() => { fetch(`${apiBase}/api/tokens/${row.token}`).then(r=>r.json()).then(d=>setMeta(d.data||{})); }, [row.token]);

  const { data: bal } = useReadContract({ address: row.token as `0x${string}`, abi: erc20 as any, functionName: "balanceOf", args: me ? [me as `0x${string}`] : undefined, query: { enabled: !!me } });

  const [amount, setAmount] = useState("");
  const submitIntent = async () => {
    const body = { token: row.token, buyer: me, amount };
    const r = await fetch(`${apiBase}/api/purchase-intents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    alert(d.ok?`已提交意向: ${d.id}`:`失败: ${d.error}`);
  }; 
    

  // M3 orderbook
  const [ob, setOb] = useState<OrderbookResp["data"]>({ buys: [], sells: [] });
  const refreshOb = () => fetch(`${apiBase}/api/orderbook?token=${row.token}`).then(r=>r.json()).then(d=>setOb(d.data));
  useEffect(() => { refreshOb(); }, [row.token]);

  // 挂单表单
  const [side, setSide] = useState<"buy"|"sell">("buy");
  const [px, setPx] = useState("");
  const [qty, setQty] = useState("");
  const placeOrder = async () => {
    if (!me || !px || !qty) return;
    try {
      // TODO: The escrowAddress should be fetched from a config endpoint
      const escrowAddress = "0x0000000000000000000000000000000000000000";
      const domain = { name: "PlaygroundOrder", version: "1", chainId, verifyingContract: escrowAddress };
      const types = { Order: [
        { name: "token", type: "address" },
        { name: "owner", type: "address" },
        { name: "side", type: "uint8" },
        { name: "price", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
      ]};
      const value = { 
        token: row.token, 
        owner: me, 
        side: side==="buy"?0:1, 
        price: px, 
        amount: qty, 
        nonce: Date.now(), 
        expiry: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
      };
      const sig = await (window as any).ethereum.request({
        method: "eth_signTypedData_v4",
        params: [me, JSON.stringify({ domain, types, primaryType: "Order", message: value })]
      });
      
      const r = await fetch(`${apiBase}/api/orders/signed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value, sig }) });
      const d = await r.json();
      alert(d.ok ? `下单成功 id=${d.id}` : `失败: ${d.error}`);
      refreshOb();
    } catch (e: any) {
      alert(`签名或提交失败: ${e.message}`);
    }
  };

  const accept = async (id: string, amt?: string) => {
    if (!me) return alert("请先连接钱包");
    // TODO: The escrowAddress should be fetched from a config endpoint
    const escrowAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Example address, replace with your actual escrow contract address

    try {
      // 1. 调用后端 API 获取成交详情
      const body: any = { taker: me };
      if (amt) body.amount = amt;
      const r = await fetch(`${apiBase}/api/orders/${id}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);

      alert(`后端成交成功，即将发起链上交易... \n成交数量: ${d.filled}`);
      const { lotId, quote, payAmount, filled } = d;

      // 2. 根据 quote 类型执行链上操作
      if (quote === "0x0000000000000000000000000000000000000000") {
        // 若 quote==address(0): 直接调用 escrow.take(lotId, amount, { value: payAmount })
        await writeContractAsync({
          address: escrowAddress,
          abi: escrowAbi,
          functionName: "take",
          args: [lotId, BigInt(filled)],
          value: BigInt(payAmount),
        });
      } else {
        // 若为 ERC20: 先 approve, 再 take(lotId, amount)
        // a) Approve
        alert(`需要授权 ${payAmount} ${quote} 给 Escrow 合约`);
        await writeContractAsync({
          address: quote,
          abi: erc20,
          functionName: "approve",
          args: [escrowAddress, BigInt(payAmount)],
        });

        // b) Take
        alert(`授权成功，即将执行 take`);
        await writeContractAsync({
          address: escrowAddress,
          abi: escrowAbi,
          functionName: "take",
          args: [lotId, BigInt(filled)],
        });
      }

      alert("链上交易成功!");
      refreshOb();
    } catch (e: any) {
      alert(`接单失败: ${e.message}`);
    }
  };

  return (
    <div className="border rounded p-4 space-y-3">
      <div className="font-semibold">{meta.name} {meta.symbol}</div>
      <div className="text-xs break-all">{row.token}</div>
      <div className="text-sm">totalSupply: {meta.totalSupply}</div>
      {me && <div className="text-sm">my balance: {bal?.toString?.() || "0"}</div>}

      {/* M2 购买意向 */}
      <div className="flex gap-2 items-center">
        <input className="border p-2 flex-1" placeholder="amount(wei)" value={amount} onChange={e=>setAmount(e.target.value)} />
        <button className="px-3 py-2 bg-black text-white rounded" onClick={submitIntent} disabled={!me || !amount}>购买意向</button>
      </div>

      {/* M3 挂单区 */}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="font-semibold">BUY</div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {ob.buys.map(x => (
              <div key={x.id} className="text-sm flex items-center justify-between border p-2 rounded">
                <div>px {x.price} · qty {x.amount} · filled {x.filled}</div>
                <button className="px-2 py-1 border rounded" onClick={()=>accept(x.id)}>接单</button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="font-semibold">SELL</div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {ob.sells.map(x => (
              <div key={x.id} className="text-sm flex items-center justify-between border p-2 rounded">
                <div>px {x.price} · qty {x.amount} · filled {x.filled}</div>
                <button className="px-2 py-1 border rounded" onClick={()=>accept(x.id)}>接单</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 挂单表单 */}
      <div className="flex gap-2 items-center">
        <select className="border p-2" value={side} onChange={e=>setSide(e.target.value as any)}>
          <option value="buy">buy</option>
          <option value="sell">sell</option>
        </select>
        <input className="border p-2" placeholder="price" value={px} onChange={e=>setPx(e.target.value)} />
        <input className="border p-2 flex-1" placeholder="amount(wei)" value={qty} onChange={e=>setQty(e.target.value)} />
        <button className="px-3 py-2 bg-black text-white rounded" onClick={placeOrder} disabled={!me || !px || !qty}>挂单</button>
      </div>
    </div>
  );
}
