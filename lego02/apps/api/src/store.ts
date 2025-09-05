import fs from "fs";
import path from "path";

const dataDir = path.resolve(process.cwd(), "../../configs/registry");
const tokensPath = path.join(dataDir, "tokens.json");
const intentsPath = path.join(dataDir, "intents.json");

function ensureFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(tokensPath)) fs.writeFileSync(tokensPath, "[]", "utf8");
  if (!fs.existsSync(intentsPath)) fs.writeFileSync(intentsPath, "[]", "utf8");
}

export type TokenRow = {
  chainId: number,
  token: string,
  restrictor?: string,
  name?: string,
  symbol?: string,
  decimals?: number,
  createdAt?: number
};

export type IntentRow = {
  id: string,
  token: string,
  buyer: string,
  amount: string,
  status: "pending" | "approved" | "rejected",
  createdAt: number
};

export const store = {
  init() { ensureFiles(); },
  listTokens(): TokenRow[] { return JSON.parse(fs.readFileSync(tokensPath, "utf8")); },
  addToken(row: TokenRow) {
    const arr = store.listTokens();
    const exists = arr.find(x => x.token.toLowerCase() === row.token.toLowerCase());
    if (!exists) arr.push(row);
    fs.writeFileSync(tokensPath, JSON.stringify(arr, null, 2));
  },
  listIntents(): IntentRow[] { return JSON.parse(fs.readFileSync(intentsPath, "utf8")); },
  addIntent(row: IntentRow) {
    const arr = store.listIntents();
    arr.push(row);
    fs.writeFileSync(intentsPath, JSON.stringify(arr, null, 2));
  }
};
