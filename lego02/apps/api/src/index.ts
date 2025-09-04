import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { execa } from "execa";
import path from "path";
import { dirname } from "path";
import fs from "fs";
import yaml from "js-yaml";
import { fileURLToPath } from 'url';

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
