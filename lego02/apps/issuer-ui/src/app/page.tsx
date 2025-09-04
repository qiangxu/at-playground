"use client";
import { useState } from "react";
import yaml from "js-yaml";
import { z } from "zod";

const Schema = z.object({
  type: z.string().default("erc20_restricted"),
  name: z.string(),
  symbol: z.string(),
  decimals: z.coerce.number().int().min(0).max(36),
  cap: z.string(),
  roles: z.object({ owner: z.string(), minters: z.array(z.string()).default([]), complianceAdmins: z.array(z.string()).default([]) }),
  whitelist: z.object({ allow: z.array(z.string()).default([]) }).optional(),
  issuance: z.object({ schedule: z.array(z.object({ t: z.string(), mint: z.string(), to: z.string() })) }).optional()
});

export default function Page() {
  const [form, setForm] = useState({
    type: "erc20_restricted",
    name: "Demo Equity Token",
    symbol: "DET",
    decimals: 18,
    cap: "1000000000000000000000000",
    roles: { owner: "eoa:0x...", minters: ["eoa:0x..."], complianceAdmins: ["eoa:0x..."] },
    whitelist: { allow: ["0x..."] },
    issuance: { schedule: [{ t: "immediate", mint: "1000000000000000000", to: "0x..." }] }
  });
  const [yamlText, setYamlText] = useState("");
  const [logs, setLogs] = useState("");
  const [addr, setAddr] = useState<{ token?: string; restrictor?: string }>({});
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";

  const onUploadYaml = async (file: File) => {
    const txt = await file.text();
    setYamlText(txt);
    const obj = yaml.load(txt) as any;
    const parsed = Schema.parse(obj);
    setForm(parsed as any);
  };

  const deploy = async () => {
    setLogs("deploying...");
    const res = await fetch(`${apiBase}/api/tokens/deploy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    setLogs(data.stdout || JSON.stringify(data, null, 2));
    setAddr({ token: data.token, restrictor: data.restrictor });
  };

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">发行面板 M1</h1>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="font-semibold">参数</h2>
          <label className="block text-sm">name
            <input className="w-full border p-2" value={(form as any).name}
              onChange={e=>setForm({ ...(form as any), name: e.target.value })} />
          </label>
          <label className="block text-sm">symbol
            <input className="w-full border p-2" value={(form as any).symbol}
              onChange={e=>setForm({ ...(form as any), symbol: e.target.value })} />
          </label>
          <label className="block text-sm">decimals
            <input className="w-full border p-2" type="number" value={(form as any).decimals}
              onChange={e=>setForm({ ...(form as any), decimals: Number(e.target.value) })} />
          </label>
          <label className="block text-sm">cap(wei)
            <input className="w-full border p-2" value={(form as any).cap}
              onChange={e=>setForm({ ...(form as any), cap: e.target.value })} />
          </label>
          <label className="block text-sm">owner
            <input className="w-full border p-2" value={(form as any).roles.owner}
              onChange={e=>setForm({ ...(form as any), roles: { ...(form as any).roles, owner: e.target.value } })} />
          </label>
          <label className="block text-sm">minters(逗号分隔)
            <input className="w-full border p-2" value={(form as any).roles.minters.join(",")}
              onChange={e=>setForm({ ...(form as any), roles: { ...(form as any).roles, minters: e.target.value.split(",").filter(Boolean) } })} />
          </label>
          <label className="block text-sm">complianceAdmins(逗号分隔)
            <input className="w-full border p-2" value={(form as any).roles.complianceAdmins.join(",")}
              onChange={e=>setForm({ ...(form as any), roles: { ...(form as any).roles, complianceAdmins: e.target.value.split(",").filter(Boolean) } })} />
          </label>
          <label className="block text-sm">whitelist.allow(逗号分隔)
            <input className="w-full border p-2" value={((form as any).whitelist?.allow||[]).join(",")}
              onChange={e=>setForm({ ...(form as any), whitelist: { allow: e.target.value.split(",").filter(Boolean) } })} />
          </label>
          <label className="block text-sm">发行计划 t=immediate,mint,to
            <input className="w-full border p-2" placeholder="immediate,1000000000000000000,0x..."
              onChange={e=>{
                const [t,mint,to] = e.target.value.split(",");
                setForm({ ...(form as any), issuance: { schedule: t&&mint&&to ? [{ t, mint, to }] : [] }})
              }} />
          </label>
          <div className="flex gap-2">
            <input type="file" accept=".yaml,.yml" onChange={e=>e.target.files && onUploadYaml(e.target.files[0])} />
            <button className="px-3 py-2 bg-black text-white rounded" onClick={deploy}>部署</button>
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="font-semibold">预览</h2>
          <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto h-72">{yaml.dump(form as any)}</pre>
          <h2 className="font-semibold">结果</h2>
          {addr.token && (
            <div className="text-sm space-y-1">
              <div>token: <a target="_blank" className="underline" href={`https://sepolia.basescan.org/address/${addr.token}`}>{addr.token}</a></div>
              <div>restrictor: <a target="_blank" className="underline" href={`https://sepolia.basescan.org/address/${addr.restrictor}`}>{addr.restrictor}</a></div>
            </div>
          )}
          <h2 className="font-semibold">日志</h2>
          <pre className="text-xs bg-gray-900 text-green-100 p-3 rounded overflow-auto h-64">{logs}</pre>
        </div>
      </section>
    </main>
  );
}
