# 技术栈与总体设计

**目标**：首日即可跑通“注册/登录 → 钱包生成与绑定 → KYC 发起与回调 → 权限门控”的最小闭环；后续平滑升级到 AA（4337）、多钱包、多法域 KYC。

## A. 技术栈（建议）

* 前端：**Next.js 14（App Router, TS）** + React Query + Zod（表单校验）

  * 身份 & 钱包 SDK：**Privy**（嵌入式 MPC 钱包 + 邮箱/短信登录），同时兼容 **SIWE**（MetaMask/钱包扩展）
* 后端：**NestJS（TS）** + **Prisma ORM**

  * Auth：JWT（短期）+ Refresh Token；支持 Privy JWT 验签、SIWE 会话
  * KYC：**Sumsub**（或 Onfido），Webhook 回调
  * 缓存与会话：**Redis**（速率限制、临时状态、一次性 nonce）
  * 数据库：**PostgreSQL 14+**（行级加密字段、审计日志）
  * 事件：Redis Pub/Sub（或 Postgres NOTIFY/LISTEN）
  * 日志/可观测：OpenTelemetry + pino + Prometheus/Grafana
* 密钥管理：后端签名与加密用 **AWS KMS / GCP KMS**（本地 dev 用 .env + sops）
* CI/CD：GitHub Actions + Fly.io/Render/Cloud Run（任选其一）

## B. 边界与集成原则

* **PII 最小化**：KYC 证件照等由 Sumsub 托管；本地只存 `kyc_status`、`applicant_id`、审计轨迹
* **钱包策略**：默认 **Privy 嵌入式 MPC 钱包**；如用户连接外部钱包则走 **SIWE** 流
* **权限门控**：买卖/入金/出金等 API 统一检查 `account_flags`（如 `kyc_approved=true`）

---

# 体系结构（高层）

```
[Next.js 前端]
  ├─ PrivyProvider (email/sms login, embedded wallet)
  ├─ KYC UI (Sumsub WebSDK iframe)
  └─ Trading App Shell

[NestJS API]
  ├─ Auth 模块: Privy JWT 验签, SIWE 验签, Session/JWT
  ├─ Wallet 模块: 账户-地址映射, 多钱包管理
  ├─ KYC 模块: Sumsub applicant 创建/重用, token 发放, webhook 回调
  ├─ Gatekeeper: 权限门控（kyc, 风险, 冻结）
  ├─ Admin 模块: 审计与复核
  └─ Event 总线: Redis Pub/Sub → 通知其他积木 (入金/撮合/出金)

[Infra]
  ├─ PostgreSQL (Prisma)
  ├─ Redis
  └─ KMS (加密 secrets, PII 字段)
```

---

# 端到端流程（关键序列）

## 1) 注册/登录（Privy/MPC）

1. 前端 `PrivyProvider` 初始化 → 用户邮箱 OTP 登录
2. 前端从 Privy 拿到 **userId + idToken (JWT)**
3. 前端调用后端 `/v1/auth/privy` 携带 `idToken`
4. 后端用 Privy 公钥验证 `idToken` → 取 `privy_user_id/email`
5. **幂等 upsert** 用户记录；若无钱包记录则调用前端 SDK 触发 **embedded wallet** 创建并上报地址（或前端首次创建后回传）
6. 后端签发自身 **access_token + refresh_token**

> 兼容：用户用外部钱包 → `/v1/auth/siwe/nonce` 取 nonce，签名回传 `/v1/auth/siwe/verify` 完成登录。

## 2) 钱包绑定

* 前端通过 Privy 获取 `wallet.address`，调用 `/v1/wallets/register`
* 后端写入 `wallets(address, account_id, provider=privy, kind=embedded)`，唯一索引去重
* 可追加外部钱包（`provider=siwe`, `kind=extern`），支持一对多

## 3) KYC 发起与回调（Sumsub）

1. 用户点击“开始认证” → 前端请求 `/v1/kyc/session`
2. 后端：若 `kyc_applicant` 不存在 → 调 Sumsub `Create Applicant`；然后颁发临时 **access token** 给前端
3. 前端嵌入 Sumsub WebSDK（iframe），用户完成上传/活体
4. Sumsub 后台审核完成 → **Webhook** POST `/v1/kyc/webhook`
5. 后端验证 `X-Signature`（HMAC）→ 更新 `kyc_status=approved/rejected`，写入 `kyc_events`，发布事件 `account.kyc.approved`

## 4) 权限门控（对接其他积木）

* 任何需要合规前置的 API（撮合/入金/出金）在网关或 service 中统一检查：

  * `account.kyc_status === 'approved'`
  * `account_flags.not_frozen === true`
  * 可附加风控评分阈值（后续接入）

---

# API 规格（精简版）

> Base URL: `/v1`

**Auth / Wallet**

* `POST /auth/privy`  { idToken } → { access_token, refresh_token, user }
* `GET /auth/me`  → { user, wallets, kyc }
* `GET /auth/siwe/nonce` → { nonce, message }
* `POST /auth/siwe/verify` { address, signature, nonce } → tokens
* `POST /wallets/register` { address, provider, kind } → 204
* `GET /wallets` → [{ address, provider, kind, created_at }]

**KYC**

* `POST /kyc/session` → { applicant_id, sumsub_token, expires_in }
* `POST /kyc/webhook` (Sumsub) 署名校验 → 200
* `GET /kyc/status` → { status, review_result, updated_at }

**Gatekeeper（给其他积木使用）**

* `GET /gate/permissions` → { canTrade, canDeposit, canWithdraw, reasons: [] }

**Admin**

* `GET /admin/accounts?q=...`
* `POST /admin/accounts/:id/flags` { freeze, notes }
* `GET /admin/audit?accountId=...`

---

# 数据模型（Prisma Schema 片段）

```prisma
model Account {
  id             String   @id @default(cuid())
  email          String?  @unique
  phone          String?  @unique
  privyUserId    String?  @unique
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  // 合规/风控
  kycStatus      KycStatus @default(PENDING)
  kycApplicantId String?   @unique
  flags          Json       // { frozen: false, risk_score: 0, country: "SG", ... }
  // 关系
  wallets        Wallet[]
  auditLogs      AuditLog[]
}

model Wallet {
  id         String   @id @default(cuid())
  accountId  String
  address    String   @unique
  provider   WalletProvider
  kind       WalletKind   // EMBEDDED | EXTERN | SAFE | AA
  createdAt  DateTime  @default(now())
  Account    Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@index([accountId])
}

model KycEvent {
  id           String   @id @default(cuid())
  accountId    String   @index
  applicantId  String
  provider     String   // sumsub
  type         String   // SUBMITTED | APPROVED | REJECTED | PENDING | RESUBMIT
  payload      Json     // 原始回调(脱敏)
  createdAt    DateTime @default(now())
}

model Session {
  id           String   @id @default(cuid())
  accountId    String   @index
  refreshToken String   @unique
  userAgent    String?
  ip           String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}

model AuditLog {
  id          String   @id @default(cuid())
  accountId   String?
  actor       String   // user:<id> | system | admin:<id>
  action      String   // KYC_APPROVED | LOGIN | WALLET_ADD | ADMIN_FREEZE ...
  metadata    Json
  createdAt   DateTime @default(now())
}

enum KycStatus { PENDING APPROVED REJECTED REVIEW }
enum WalletProvider { PRIVY SIWE SAFE BICONOMY OTHER }
enum WalletKind { EMBEDDED EXTERN SAFE AA }
```

**额外索引**

* `@@index([kycStatus])`（便于后台复核）
* 审计表按 `createdAt` + `action` 建复合索引

---

# 关键实现骨架（可复制改造）

## 1) 后端：Privy JWT 验证（NestJS Guard）

```ts
// auth/privy.strategy.ts
import jwkToPem from 'jwk-to-pem';
import jwt from 'jsonwebtoken';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrivyVerifier {
  constructor(private cfg: ConfigService) {}
  async verify(idToken: string) {
    // 1) 从配置或缓存拉取 Privy JWK（官方公开）→ 转 PEM
    const jwk = JSON.parse(process.env.PRIVY_JWK!);
    const pem = jwkToPem(jwk);
    const payload = jwt.verify(idToken, pem, { algorithms: ['RS256'], audience: 'privy' }) as any;
    return {
      privyUserId: payload.sub,
      email: payload.email,
    };
  }
}
```

```ts
// auth.controller.ts
@Post('privy')
async privy(@Body() dto: { idToken: string }) {
  const { privyUserId, email } = await this.privyVerifier.verify(dto.idToken);
  const user = await this.accounts.upsertByPrivy({ privyUserId, email });
  const tokens = await this.sessions.issueFor(user.id);
  return { user, ...tokens };
}
```

## 2) 后端：SIWE 验证

```ts
// siwe.service.ts
import { SiweMessage } from 'siwe';
import { randomBytes } from 'crypto';

async nonce() {
  const nonce = randomBytes(16).toString('hex');
  await this.redis.setex(`siwe:${nonce}`, 300, '1');
  return { nonce, messageTemplate: 'Sign in with Ethereum to the app.' };
}

async verify({ message, signature }) {
  const msg = new SiweMessage(message);
  const fields = await msg.verify({ signature });
  const ok = await this.redis.del(`siwe:${fields.data.nonce}`);
  if (!ok) throw new Error('nonce expired');
  return fields.data.address; // 之后 upsert 账户 + 绑定钱包
}
```

## 3) 后端：Sumsub Webhook 验签

```ts
// kyc.controller.ts
@Post('webhook')
@HttpCode(200)
async webhook(@Req() req: Request, @Headers('x-payload-digest') sig: string) {
  const raw = (req as any).rawBody as Buffer; // 确保中间件保留原始体
  const secret = this.cfg.get('SUMSUB_WEBHOOK_SECRET');
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (digest !== sig) throw new UnauthorizedException('bad signature');

  const event = JSON.parse(raw.toString());
  await this.kycService.handleEvent(event); // 更新 kycStatus, 写 KycEvent, 发事件
  return { ok: true };
}
```

## 4) 前端：Privy & 钱包绑定

```tsx
// app/providers.tsx
import { PrivyProvider } from '@privy-io/react-auth';

export function Providers({ children }) {
  return (
    <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={{ embeddedWallets: { createOnLogin: 'users-without-wallets' } }}>
      {children}
    </PrivyProvider>
  );
}
```

```tsx
// app/(auth)/login/page.tsx
const { login, user, getAccessToken } = usePrivy();
const onLogin = async () => {
  const idToken = await getAccessToken(); // 或 privy.user.getIdToken()
  await api.post('/auth/privy', { idToken });
  // 首次登录后获取地址并上报
  const addr = user?.wallet?.address;
  if (addr) await api.post('/wallets/register', { address: addr, provider: 'PRIVY', kind: 'EMBEDDED' });
};
```

## 5) 前端：KYC 会话与嵌入

```tsx
// app/(kyc)/page.tsx
const { data } = useQuery(['kycSession'], () => api.post('/kyc/session').then(r => r.data));
useEffect(() => {
  const sdk = window.SUMSUB?.init('#sumsub-iframe', {
    accessToken: data.sumsub_token, applicantId: data.applicant_id,
    lang: 'en', // or 'zh'
  });
  return () => sdk?.destroy();
}, [data]);
```

---

# 安全与合规要点（最小但正确）

* **PII 分层**：`accounts.email/phone` 单独列，必要字段加密（AES-GCM；密钥在 KMS）
* **Webhook Zero-Trust**：必须校验签名，幂等处理（`event.id` 唯一）
* **审计**：所有安全敏感操作写 `AuditLog`（谁在何时做了什么）
* **速率限制**：基于 Redis 的 bucket（注册、登录、KYC 发起、SIWE 验证）
* **会话**：短期 Access + 长期 Refresh；可选设备绑定/指纹
* **数据保留**：遵循最短必要周期；用户删除请求触发清除/匿名化
* **权限门控**：统一 `Gatekeeper` 中间件暴露 `canTrade/canDeposit/canWithdraw` 结果

---

# 开发顺序与验收清单（Task → DoD）

### M1（最小闭环）

* ✅ `/auth/privy` + 会话
* ✅ 钱包注册 `/wallets/register`（Privy MPC 地址）
* ✅ `/kyc/session`（创建/复用 applicant，返回 token）
* ✅ `/kyc/webhook`（签名校验、状态迁移、事件发布）
* ✅ `/gate/permissions`（根据 `kycStatus` 返回能否交易/入金/出金）

**DoD**：新用户 3 分钟内完成登录→生成钱包→提交 KYC→审核回调（mock/沙箱）→`canTrade=true`

### M2（兼容外部钱包）

* SIWE 流程（nonce、EIP-4361 验签）
* 多钱包（一对多），默认交易钱包可切换
* Admin 冻结/解冻 + 审计台账

### M3（增强安全/隐私）

* 字段级加密、数据脱敏日志、IP 地理与设备画像
* 速率限制与风控阈值（如高风险国家需人工复核）

### M4（可用性/可观测）

* OpenAPI/Swagger 文档、Postman 集合
* OTel trace + 关键 KPI（注册转化率、KYC 通过率、平均审核时延）

### M5（AA 升级可选）

* Biconomy/Safe 4337 智能账户（保留 Privy 作为签名器）
* Paymaster/Session Keys（为后续撮合/签名体验做准备）

---

# 目录结构（示例）

```
apps/
  web/ (Next.js)
    app/
    lib/api.ts
  api/ (NestJS)
    src/
      modules/
        auth/ (privy, siwe)
        wallets/
        kyc/ (sumsub client + webhook)
        gate/
        admin/
      common/ (guards, pipes, interceptors)
      infra/ (prisma, redis, kms, logger)
    prisma/schema.prisma
  docker/
    postgres, redis, api, web
```

---

# 给其他积木的对接契约

* **事件**（Redis Topic）

  * `account.kyc.approved { accountId, applicantId, at }`
  * `account.flags.updated { accountId, flags }`
* **查询**

  * `/v1/gate/permissions?accountId=...` → `canTrade/canDeposit/canWithdraw`
  * `/v1/wallets?accountId=...` → 默认交易地址 / 全部地址

