import fs from "fs";
import path from "path";


const dataDir = path.resolve(process.cwd(), "../../configs/registry");
const ordersPath = path.join(dataDir, "orders.json");
const tradesPath = path.join(dataDir, "trades.json");


function ensureFiles() {
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, "[]", "utf8");
    if (!fs.existsSync(tradesPath)) fs.writeFileSync(tradesPath, "[]", "utf8");
}


export type OrderRow = {
  id: string,
  token: string,
  owner: string,
  side: "buy" | "sell",
  price: string,
  amount: string,
  filled: string,
  status: "open" | "partial" | "filled" | "cancelled",
  createdAt: number,
  lotId?: number,
  quote?: string
}


export type TradeRow = {
    id: string,
    orderId: string,
    token: string,
    price: string,
    amount: string,
    maker: string, // 挂单方
    taker: string, // 接单方
    createdAt: number
}


export const ob = {
    init() { ensureFiles(); },
    listOrders(): OrderRow[] { return JSON.parse(fs.readFileSync(ordersPath, "utf8")); },
    saveOrders(arr: OrderRow[]) { fs.writeFileSync(ordersPath, JSON.stringify(arr, null, 2)); },
    listTrades(): TradeRow[] { return JSON.parse(fs.readFileSync(tradesPath, "utf8")); },
    saveTrades(arr: TradeRow[]) { fs.writeFileSync(tradesPath, JSON.stringify(arr, null, 2)); },
    putOrder(o: OrderRow) {
        const arr = ob.listOrders();
        arr.push(o);
        ob.saveOrders(arr);
    },
    updateOrder(id: string, patch: Partial<OrderRow>) {
        const arr = ob.listOrders();
        const i = arr.findIndex(x => x.id === id);
        if (i < 0) throw new Error("order_not_found");
        arr[i] = { ...arr[i], ...patch } as OrderRow;
        ob.saveOrders(arr);
        return arr[i];
    },
    getOrder(id: string) { return ob.listOrders().find(x => x.id === id); },
    putTrade(t: TradeRow) {
        const arr = ob.listTrades();
        arr.push(t);
        ob.saveTrades(arr);
    }
}

