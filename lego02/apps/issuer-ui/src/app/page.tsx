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

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";

// 2. 创建一个异步函数，专门负责从 API 获取和验证数据
async function getTokenConfig() {
  try {
    // 使用 fetch 从后端 API 获取数据。'no-store' 确保每次都是最新数据。
    const response = await fetch(`${apiBase}/api/token-config`, { cache: "no-store" });

    // 如果请求失败，抛出错误
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    // 使用 Zod schema 解析和验证数据，如果格式不匹配会抛出错误
    return Schema.parse(data);
  } catch (error) {
    // 捕获任何错误（网络错误、解析错误等）并打印到服务器控制台
    console.error("Failed to get token config:", error);
    // 返回 null，让 UI 组件知道数据加载失败
    return null;
  }
}

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

  const applyCsvOnBlur = (raw: string) =>
    raw.split(",").map((s) => s.trim()).filter(Boolean);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await getTokenConfig();
      if (!cfg || cancelled) return;
      setForm(cfg);
      setMintersStr(cfg.roles.minters?.join(",") || "");
      setComplianceStr(cfg.roles.complianceAdmins?.join(",") || "");
      setWhitelistStr(cfg.whitelist?.allow?.join(",") || "");
      setSched(cfg.issuance?.schedule || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onUploadYaml = async (file: File) => {
    const txt = await file.text();
    const obj = yaml.load(txt) as unknown;
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
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'message' in e) {
        setLogs(String((e as { message?: string }).message));
      } else {
        setLogs(String(e));
      }
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
          <h2 className="font-semibold">配置概览</h2>
          <div className="space-y-2 text-sm">
            <div><strong>类型:</strong> {form.type}</div>
            <div><strong>合规管理员:</strong></div>
            <ul className="list-disc pl-5">
              {(form.roles.complianceAdmins || []).length > 0 ? (
                form.roles.complianceAdmins.map((addr, idx) => (
                  <li key={`compliance-${idx}`} className="font-mono text-xs break-all">{addr}</li>
                ))
              ) : (
                <li className="text-gray-500">无</li>
              )}
            </ul>

            <div><strong>Whitelist:</strong></div>
            <ul className="list-disc pl-5">
              {form.whitelist?.allow && form.whitelist.allow.length > 0 ? (
                form.whitelist.allow.map((addr, idx) => (
                  <li key={`whitelist-${idx}`} className="font-mono text-xs break-all">{addr}</li>
                ))
              ) : (
                <li className="text-gray-500">未配置白名单</li>
              )}
            </ul>

            <div><strong>发行计划:</strong></div>
            <ul className="list-disc pl-5">
              {sched.length > 0 ? (
                sched.map((row, idx) => (
                  <li key={`schedule-${idx}`} className="text-xs">
                    <span className="font-semibold">{row.t}</span> · mint {row.mint || "-"} → {row.to || "-"}
                  </li>
                ))
              ) : (
                <li className="text-gray-500">暂无计划</li>
              )}
            </ul>
          </div>

          <h2 className="font-semibold">预览</h2>
          <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto h-72">
            {yaml.dump(form as unknown)}
          </pre>

          <h2 className="font-semibold">结果</h2>
          {addr.token && (
            <div className="text-sm space-y-1">
              <div>token: <a target="_blank" className="underline" href={`https://sepolia.basescan.org/address/${addr.token}`}>{addr.token}</a></div>
              <div>restrictor: <a target="_blank" className="underline" href={`https://sepolia.basescan.org/address/${addr.restrictor}`}>{addr.restrictor}</a></div>
            </div>
          )}
          {addr.token && (
            <div className="flex gap-2">
              <button
                className="px-3 py-2 border rounded"
                onClick={async () => {
                  const body = {
                    token: addr.token,
                    restrictor: addr.restrictor,
                    chainId: await fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100"}/api/network/chainId`).then(r => r.json()).then(d => d.chainId).catch(() => undefined)
                  };
                  const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100"}/api/registry/add`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body)
                  });
                  const d = await r.json();
                  alert(d.ok ? "已提交审核并注册到 registry" : `失败: ${d.error}`);
                }}
              >
                审核提交并注册
              </button>
            </div>
          )}
          <h2 className="font-semibold">日志</h2>
          <pre className="text-xs bg-gray-900 text-green-100 p-3 rounded overflow-auto h-64">{logs}</pre>
        </div>
      </section>
    </main>
  );
}

