import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { execa } from "execa";
import path from "path";
import { dirname } from "path";
import fs from "fs";
import yaml from "js-yaml";
import { fileURLToPath } from 'url';
import { store } from "./store.js";
import { ethers } from "ethers";
import crypto from "crypto";

store.init();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
if (!process.env.RPC_BASE_SEPOLIA) {
  throw new Error("RPC_BASE_SEPOLIA missing, check lego02/.env");
}
console.log("api using RPC_BASE_SEPOLIA:", process.env.RPC_BASE_SEPOLIA.slice(0, 40) + "...");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: ["text/yaml", "application/x-yaml"], limit: "1mb" }));

const ConfigSchema = z.object({
  type: z.string().default("erc20_restricted"),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().min(0).max(36),
  cap: z.string(),
  roles: z.object({
    owner: z.string(),
    minters: z.array(z.string()).default([]),
    complianceAdmins: z.array(z.string()).default([])
  }),
  compliance: z.object({ mode: z.string().default("whitelist") }).optional(),
  issuance: z.object({
    schedule: z.array(z.object({
      t: z.string(),
      mint: z.string(),
      to: z.string()
    })).default([])
  }).optional(),
  whitelist: z.object({ allow: z.array(z.string()).default([]) }).optional()
});

function parseBodyToConfig(body: any, contentType?: string) {
  if (typeof body === "string") {
    const obj = (contentType || "").includes("yaml") ? yaml.load(body) : JSON.parse(body);
    return ConfigSchema.parse(obj);
  }
  return ConfigSchema.parse(body);
}

app.post("/api/tokens/deploy", async (req, res) => {
  try {
    const cfg = parseBodyToConfig(req.body, req.headers["content-type"] as string);
    // 写临时 yaml 供 hardhat 脚本消费
    const workDir = path.resolve(__dirname, "../../contracts");
    const tmpDir = path.resolve(workDir, ".tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `token.config.${Date.now()}.yaml`);
    fs.writeFileSync(tmpPath, yaml.dump(cfg), "utf8");

    // 运行 hardhat 脚本
    const deployCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
	const child = execa(
	  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
	  ["run", "deploy:yaml"],
	  {
		cwd: workDir,
		env: { ...process.env, TOKEN_CONFIG: tmpPath }
	  }
	);

    let stdout = "";
    child.stdout?.on("data", (b) => { stdout += String(b); });
    let stderr = "";
    child.stderr?.on("data", (b) => { stderr += String(b); });

    const { exitCode } = await child;
    if (exitCode !== 0) {
      return res.status(500).json({ ok: false, error: "deploy_failed", stdout, stderr });
    }

    // 从日志解析地址
    const restrictor = /restrictor:\s*(0x[a-fA-F0-9]{40})/i.exec(stdout)?.[1] || "";
    const token = /token:\s*(0x[a-fA-F0-9]{40})/i.exec(stdout)?.[1] || "";

    return res.json({ ok: true, token, restrictor, stdout });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});

const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3100;
app.listen(port, () => {
  console.log(`api listening on :${port}`);
});



// 基础 provider, 读链上信息
const provider = new ethers.JsonRpcProvider(process.env.RPC_BASE_SEPOLIA);

app.get("/api/network/chainId", async (_req, res) => {
  
  try {
    const net = await provider.getNetwork();
    return res.json({ ok: true, chainId: Number(net.chainId) });
  } catch (e:any) {
    console.log(e.message);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// 1) 注册一个新代币(也可在部署成功后由 /api/tokens/deploy 自动调用)
app.post("/api/registry/add", (req, res) => {
  try {
    const { token, restrictor, chainId = 84532 } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: "token_required" });
    store.addToken({ token, restrictor, chainId, createdAt: Date.now() });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});

// 2) 获取代币列表
app.get("/api/tokens", (_req, res) => {
  return res.json({ ok: true, data: store.listTokens() });
});


// 3) 获取代币详情(链上 + 注册表)
app.get("/api/tokens/:address", async (req, res) => {
  try {
    const address = req.params.address;
    const erc20 = new ethers.Contract(address, [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)"
    ], provider);
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      erc20.name(), erc20.symbol(), erc20.decimals(), erc20.totalSupply()
    ]);
    const reg = store.listTokens().find(t => t.token.toLowerCase() === address.toLowerCase());
    return res.json({ ok: true, data: { address, name, symbol, decimals: Number(decimals), totalSupply: totalSupply.toString(), registry: reg } });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});



app.post("/api/purchase-intents", (req, res) => {
  try {
    const { token, buyer, amount } = req.body || {};
    if (!token || !buyer || !amount) return res.status(400).json({ ok: false, error: "missing_fields" });
    const id = crypto.randomUUID();
    store.addIntent({ id, token, buyer, amount, status: "pending", createdAt: Date.now() });
    return res.json({ ok: true, id });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});

// 可选: 按 buyer 或 token 查询意向
app.get("/api/purchase-intents", (req, res) => {
  const all = store.listIntents();
  const { buyer, token } = req.query as any;
  const data = all.filter(x => (!buyer || x.buyer.toLowerCase() === String(buyer).toLowerCase()) && (!token || x.token.toLowerCase() === String(token).toLowerCase()));
  return res.json({ ok: true, data });
});
