"use client";
import { useEffect, useState } from "react";
import yaml from "js-yaml";
import { z } from "zod";

const Schema = z.object({
  type: z.string().default("erc20_restricted"),
  name: z.string(),
  symbol: z.string(),
  decimals: z.coerce.number().int().min(0).max(36),
  cap: z.string(),
  roles: z.object({
    owner: z.string(),
    minters: z.array(z.string()).default([]),
    complianceAdmins: z.array(z.string()).default([])
  }),
  whitelist: z.object({ allow: z.array(z.string()).default([]) }).optional(),
  issuance: z.object({
    schedule: z.array(
      z.object({ t: z.string(), mint: z.string(), to: z.string() })
    )
  }).optional()
});

type Cfg = z.infer<typeof Schema>;
type SchedItem = { t: string; mint: string; to: string };

export default function Page() {
  const [form, setForm] = useState<Cfg>({
    type: "erc20_restricted",
    name: "Yunfeng Equity Token (X)",
    symbol: "YFET-X",
    decimals: 18,
    cap: "1000000000000000000000000",
    roles: {
      owner: "0xa2dc890F376CE8604919d556567d95DD69363f54",
      minters: ["0xa2dc890F376CE8604919d556567d95DD69363f54"],
      complianceAdmins: ["0xa2dc890F376CE8604919d556567d95DD69363f54"]
    },
    whitelist: { allow: ["0xa2dc890F376CE8604919d556567d95DD69363f54", "0xC2e67C96B86d7db05C50c87c14D08C7f59e5e2Ed", "0x570c0F440201724835274f310b8e13631c79003E"] },
    issuance: { schedule: [{ t: "immediate", mint: "1000000000000000000", to: "0xC2e67C96B86d7db05C50c87c14D08C7f59e5e2Ed" }] }
  });

  // 原始字符串, 避免逗号被清掉
  const [mintersStr, setMintersStr] = useState("");
  const [complianceStr, setComplianceStr] = useState("");
  const [whitelistStr, setWhitelistStr] = useState("");

  // 发行计划数组
  const [sched, setSched] = useState<SchedItem[]>(form.issuance?.schedule || []);
  useEffect(() => {
    setForm((f) => ({ ...f, issuance: { schedule: sched } }));
  }, [sched]);

  const [logs, setLogs] = useState("");
  const [addr, setAddr] = useState<{ token?: string; restrictor?: string }>({});
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";

  const applyCsvOnBlur = (raw: string) =>
    raw.split(",").map((s) => s.trim()).filter(Boolean);

  const onUploadYaml = async (file: File) => {
    const txt = await file.text();
    const obj = yaml.load(txt) as any;
    const parsed = Schema.parse(obj);
    setForm(parsed as Cfg);
    setMintersStr(parsed.roles?.minters?.join(",") || "");
    setComplianceStr(parsed.roles?.complianceAdmins?.join(",") || "");
    setWhitelistStr(parsed.whitelist?.allow?.join(",") || "");
    setSched(parsed.issuance?.schedule || []);
  };

  const deploy = async () => {
    try {
      setLogs("deploying...");
      const res = await fetch(`${apiBase}/api/tokens/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      setLogs(data.stdout || JSON.stringify(data, null, 2));
      setAddr({ token: data.token, restrictor: data.restrictor });
    } catch (e: any) {
      setLogs(String(e?.message || e));
    }
  };

  const updateSched = (i: number, key: keyof SchedItem, val: string) => {
    setSched((arr) =>
      arr.map((it, idx) => (idx === i ? { ...it, [key]: val } : it))
    );
  };

  const addRow = () => setSched((arr) => [...arr, { t: "immediate", mint: "", to: "" }]);
  const delRow = (i: number) => setSched((arr) => arr.filter((_, idx) => idx !== i));

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">发行面板 M1</h1>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="font-semibold">参数</h2>

          <label className="block text-sm">name
            <input className="w-full border p-2" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>

          <label className="block text-sm">symbol
            <input className="w-full border p-2" value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
          </label>

          <label className="block text-sm">decimals
            <input className="w-full border p-2" type="number" value={form.decimals}
              onChange={(e) => setForm({ ...form, decimals: Number(e.target.value) })} />
          </label>

          <label className="block text-sm">cap(wei)
            <input className="w-full border p-2" value={form.cap}
              onChange={(e) => setForm({ ...form, cap: e.target.value })} />
          </label>

          <label className="block text-sm">owner
            <input className="w-full border p-2" value={form.roles.owner}
              onChange={(e) => setForm({ ...form, roles: { ...form.roles, owner: e.target.value } })} />
          </label>

          <label className="block text-sm">minters(逗号分隔)
            <input className="w-full border p-2" placeholder="eoa:0x...,eoa:0x..."
              value={mintersStr}
              onChange={(e) => setMintersStr(e.target.value)}
              onBlur={(e) => setForm({ ...form, roles: { ...form.roles, minters: applyCsvOnBlur(e.target.value) } })}
            />
          </label>

          <label className="block text-sm">complianceAdmins(逗号分隔)
            <input className="w-full border p-2" placeholder="eoa:0x...,eoa:0x..."
              value={complianceStr}
              onChange={(e) => setComplianceStr(e.target.value)}
              onBlur={(e) => setForm({ ...form, roles: { ...form.roles, complianceAdmins: applyCsvOnBlur(e.target.value) } })}
            />
          </label>

          <label className="block text-sm">whitelist.allow(逗号分隔)
            <input className="w-full border p-2" placeholder="0x...,0x..."
              value={whitelistStr}
              onChange={(e) => setWhitelistStr(e.target.value)}
              onBlur={(e) => setForm({ ...form, whitelist: { allow: applyCsvOnBlur(e.target.value) } })}
            />
          </label>

          <div className="space-y-2">
            <div className="font-semibold">发行计划 schedule</div>
            {sched.map((row, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select className="col-span-3 border p-2" value={row.t}
                  onChange={(e) => updateSched(i, "t", e.target.value)}>
                  <option value="immediate">immediate</option>
                  <option value="manual">manual</option>
                </select>
                <input className="col-span-4 border p-2" placeholder="mint(wei)" value={row.mint}
                  onChange={(e) => updateSched(i, "mint", e.target.value)} />
                <input className="col-span-4 border p-2" placeholder="to(0x...)" value={row.to}
                  onChange={(e) => updateSched(i, "to", e.target.value)} />
                <button type="button" className="col-span-1 border px-2 py-2 rounded"
                  onClick={() => delRow(i)}>×</button>
              </div>
            ))}
            <button type="button" className="px-3 py-2 border rounded" onClick={addRow}>+ 添加一行</button>
          </div>

          <div className="flex gap-2">
            <input type="file" accept=".yaml,.yml" onChange={(e) => e.target.files && onUploadYaml(e.target.files[0])} />
            <button className="px-3 py-2 bg-black text-white rounded" onClick={deploy}>部署</button>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold">预览</h2>
          <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto h-72">
            {yaml.dump(form as any)}
          </pre>

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

