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
import { ob, OrderRow } from "./orderbook";
ob.init();
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

app.post("/api/orders/signed", async (req, res) => {
  try {
    const { value, sig } = req.body || {};
    if (!value || !sig) return res.status(400).json({ ok: false, error: "missing" });

    const domain = { name: "PlaygroundOrder", version: "1", chainId: Number((await provider.getNetwork()).chainId), verifyingContract: process.env.ESCROW_ADDRESS };
    const types = { Order: [
      { name: "token", type: "address" },
      { name: "owner", type: "address" },
      { name: "side", type: "uint8" },
      { name: "price", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" }
    ]};

    const digest = ethers.TypedDataEncoder.hash(domain, types as any, value);
    const recovered = ethers.verifyTypedData(domain as any, types as any, value, sig);
    if (recovered.toLowerCase() !== String(value.owner).toLowerCase()) return res.status(400).json({ ok: false, error: "bad_sig" });
    if (Date.now()/1000 > Number(value.expiry)) return res.status(400).json({ ok: false, error: "expired" });

    // 入簿: 兼容 M3 的 ob.putOrder
    const id = crypto.randomUUID();
    ob.putOrder({ id, token: value.token, owner: value.owner, side: value.side===0?"buy":"sell", price: String(value.price), amount: String(value.amount), filled: "0", status: "open", createdAt: Date.now() });
    return res.json({ ok: true, id });
  } catch (e:any) {
    return res.status(400).json({ ok:false, error: e.message });
  }
});

app.post("/api/tokens/deploy", async (req, res) => {
  console.log(`[API] Received POST /api/tokens/deploy`);
  try {
    const cfg = parseBodyToConfig(req.body, req.headers["content-type"] as string);
    console.log(`[API] Deploying token: ${cfg.name} (${cfg.symbol})`);
    // 写临时 yaml 供 hardhat 脚本消费
    const workDir = path.resolve(__dirname, "../../contracts");
    const tmpDir = path.resolve(workDir, ".tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `token.config.${Date.now()}.yaml`);
    fs.writeFileSync(tmpPath, yaml.dump(cfg), "utf8");
    console.log(`[API] Wrote token config to ${tmpPath}`);

    // 运行 hardhat 脚本
    const deployCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    console.log(`[API] Executing: ${deployCmd} run deploy:yaml in ${workDir}`);
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
      console.error(`[API] Deploy failed. exitCode: ${exitCode}, stderr: ${stderr}`);
      return res.status(500).json({ ok: false, error: "deploy_failed", stdout, stderr });
    }

    // 从日志解析地址
    const restrictor = /restrictor:\s*(0x[a-fA-F0-9]{40})/i.exec(stdout)?.[1] || "";
    const token = /token:\s*(0x[a-fA-F0-9]{40})/i.exec(stdout)?.[1] || "";
    console.log(`[API] Deploy successful. Token: ${token}, Restrictor: ${restrictor}`);

    return res.json({ ok: true, token, restrictor, stdout });
  } catch (e: any) {
    console.error(`[API] Error in /api/tokens/deploy: ${e.message}`);
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
  } catch (e: any) {
    console.log(e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// 1) 注册一个新代币(也可在部署成功后由 /api/tokens/deploy 自动调用)
app.post("/api/registry/add", async (req, res) => {
  console.log(`[API] Received POST /api/registry/add`, req.body);
  try {
    let { token, restrictor, chainId } = req.body || {};
    if (!token) throw new Error("token is required");

    if (!chainId) {
      const net = await provider.getNetwork();
      chainId = Number(net.chainId);
    }

    store.addToken({ token, restrictor, chainId, createdAt: Date.now() });
    console.log(`[API] Added token ${token} to registry on chainId ${chainId}`);
    return res.json({ ok: true });
  } catch (e: any) {
    console.error(`[API] Error in /api/registry/add: ${e.message}`);
    return res.status(400).json({ ok: false, error: e.message });
  }
});

// 2) 获取代币列表
app.get("/api/tokens", (_req, res) => {
  return res.json({ ok: true, data: store.listTokens() });
});


// 3) 获取代币详情(链上 + 注册表)
app.get("/api/tokens/:address", async (req, res) => {
  console.log(`[API] Received GET /api/tokens/${req.params.address}`);
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
    console.error(`[API] Error in /api/tokens/:address: ${e.message}`);
    return res.status(400).json({ ok: false, error: e.message });
  }
});



app.post("/api/purchase-intents", (req, res) => {
  console.log(`[API] Received POST /api/purchase-intents`, req.body);
  try {
    const { token, buyer, amount } = req.body || {};
    if (!token || !buyer || !amount) return res.status(400).json({ ok: false, error: "missing_fields" });
    const id = crypto.randomUUID();
    store.addIntent({ id, token, buyer, amount, status: "pending", createdAt: Date.now() });
    console.log(`[API] Created purchase intent ${id} for token ${token}`);
    return res.json({ ok: true, id });
  } catch (e: any) {
    console.error(`[API] Error in /api/purchase-intents: ${e.message}`);
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


// 1) 提交挂单
app.post("/api/orders", (req, res) => {
  console.log(`[API] Received POST /api/orders`, req.body);
  try {
    const { token, owner, side, price, amount } = req.body || {};
    if (!token || !owner || !side || !price || !amount) return res.status(400).json({ ok: false, error: "missing_fields" });
    if (!(side === "buy" || side === "sell")) return res.status(400).json({ ok: false, error: "invalid_side" });
    const id = crypto.randomUUID();
    const row: OrderRow = { id, token, owner, side, price: String(price), amount: String(amount), filled: "0", status: "open", createdAt: Date.now() };
    ob.putOrder(row);
    console.log(`[API] Placed order ${id}: ${side} ${amount} ${token} @ ${price} by ${owner}`);
    return res.json({ ok: true, id });
  } catch (e: any) {
    console.error(`[API] Error in /api/orders: ${e.message}`);
    return res.status(400).json({ ok: false, error: e.message });
  }
});

// 2) 查询某 token 的 orderbook
app.get("/api/orderbook", (req, res) => {
  const token = String(req.query.token || "").toLowerCase();
  if (!token) return res.status(400).json({ ok: false, error: "token_required" });
  const all = ob.listOrders().filter(x => x.token.toLowerCase() === token && (x.status === "open" || x.status === "partial"));
  const buys = [...all.filter(x => x.side === "buy")].sort((a, b) => Number(b.price) - Number(a.price));
  const sells = [...all.filter(x => x.side === "sell")].sort((a, b) => Number(a.price) - Number(b.price));
  return res.json({ ok: true, data: { buys, sells } });
});


// 3) 接单, 支持部分成交
app.post("/api/orders/:id/accept", (req, res) => {
  console.log(`[API] Received POST /api/orders/${req.params.id}/accept`, req.body);
  try {
    const id = req.params.id;
    const { taker, amount } = req.body || {};
    if (!taker) return res.status(400).json({ ok: false, error: "taker_required" });
    const o = ob.getOrder(id);
    if (!o) return res.status(404).json({ ok: false, error: "order_not_found" });
    if (o.status === "filled" || o.status === "cancelled") return res.status(400).json({ ok: false, error: "order_closed" });


    const remaining = BigInt(o.amount) - BigInt(o.filled);
    const fill = amount ? BigInt(amount) : remaining;
    if (fill <= 0n) return res.status(400).json({ ok: false, error: "invalid_amount" });
    if (fill > remaining) return res.status(400).json({ ok: false, error: "exceed_remaining" });


    const newFilled = (BigInt(o.filled) + fill).toString();
    const newStatus = (BigInt(newFilled) === BigInt(o.amount)) ? "filled" : "partial";


    ob.updateOrder(id, { filled: newFilled, status: newStatus });


    ob.putTrade({ id: crypto.randomUUID(), orderId: id, token: o.token, price: o.price, amount: fill.toString(), maker: o.owner, taker, createdAt: Date.now() });

    console.log(`[API] Accepted order ${id} by ${taker}, amount: ${fill.toString()}. New status: ${newStatus}`);
    return res.json({ ok: true, filled: fill.toString(), status: newStatus });
  } catch (e: any) {
    console.error(`[API] Error in /api/orders/:id/accept: ${e.message}`);
    return res.status(400).json({ ok: false, error: e.message });
  }
});


// 4) 取消挂单
app.post("/api/orders/:id/cancel", (req, res) => {
  console.log(`[API] Received POST /api/orders/${req.params.id}/cancel`, req.body);
  try {
    const id = req.params.id;
    const { owner } = req.body || {};
    const o = ob.getOrder(id);
    if (!o) return res.status(404).json({ ok: false, error: "order_not_found" });
    if (o.owner.toLowerCase() !== String(owner || "").toLowerCase()) return res.status(403).json({ ok: false, error: "forbidden" });
    if (o.status === "filled" || o.status === "cancelled") return res.status(400).json({ ok: false, error: "order_closed" });
    ob.updateOrder(id, { status: "cancelled" });
    console.log(`[API] Cancelled order ${id} by ${owner}`);
    return res.json({ ok: true });
  } catch (e: any) {
    console.error(`[API] Error in /api/orders/:id/cancel: ${e.message}`);
    return res.status(400).json({ ok: false, error: e.message });
  }
});


// 5) 成交记录查询
app.get("/api/trades", (req, res) => {
  const token = String(req.query.token || "");
  const all = ob.listTrades();
  const data = token ? all.filter(x => x.token.toLowerCase() === token.toLowerCase()) : all;
  return res.json({ ok: true, data });
});