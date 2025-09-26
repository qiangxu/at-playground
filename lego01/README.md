> 目标：首日即可跑通“注册/登录 → 钱包生成与绑定 → KYC 发起与回调 → 权限门控”的最小闭环；随后迭代 SIWE、多钱包、AA（ERC‑4337）。

---

# 0. 成果预览（完成后应具备）

* 前端：Next.js 页面完成 **邮箱/短信一键登录（Privy）**、**展示钱包地址**、**发起 KYC**、**查看权限**
* 后端：NestJS 提供 `/auth/privy`、`/wallets/register`、`/kyc/session`、`/kyc/webhook`、`/gate/permissions` 等 API
* 数据：PostgreSQL 记录账户、钱包、KYC 状态与审计日志；Redis 用于 nonce/速率限制/事件
* DevOps：`docker compose up` 一键起 Postgres + Redis；`prisma migrate dev` 初始化表；Swagger 自动文档

---

# 1. 本地环境准备

1. 安装：

* Node.js ≥ 20.x、pnpm ≥ 9、Docker Desktop（或 Colima）、openssl

2. 新建目录 & 初始化 Monorepo：

```bash
mkdir rh-playground && cd rh-playground
pnpm init
printf '{"name":"rh-playground","private":true,"packageManager":"pnpm@9","workspaces":["apps/*"]}' > package.json
mkdir -p apps/api apps/web docker
```

3. `docker-compose.yml`（Postgres + Redis）：

```yaml
version: '3.9'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: rh
      POSTGRES_PASSWORD: rh
      POSTGRES_DB: rh
    ports: ["5432:5432"]
    volumes:
      - db_data:/var/lib/postgresql/data
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  db_data:
```

运行：`docker compose up -d`

---

# 2. 后端（NestJS）初始化

1. 脚手架：

```bash
cd apps/api
pnpm dlx @nestjs/cli new api --skip-git --package-manager pnpm
# 注意：此命令会在 apps/api 下新建一个名为 api 的目录 → apps/api/api
# 因此你会看到双层 api 目录。避免这种情况的方式：
#   方法1：先进入 apps 目录执行 `pnpm dlx @nestjs/cli new api`，会直接生成 apps/api
#   方法2：在 apps/api 下执行 `pnpm dlx @nestjs/cli new .` 使用点号表示当前目录。
# 如果已经生成了 apps/api/api，可以把里面的文件移到 apps/api 并删除多余的空目录。
```

2. 依赖：

```bash
pnpm add @nestjs/config @nestjs/swagger swagger-ui-express @nestjs/jwt jsonwebtoken jwk-to-pem
pnpm add class-validator class-transformer
pnpm add @prisma/client prisma
pnpm add ioredis axios
pnpm add bcrypt
pnpm add -D typescript ts-node @types/jsonwebtoken @types/express @types/bcrypt
```

3. `src/main.ts`（全局校验 + Swagger + Webhook 原始体）：

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('v1');

  // Sumsub webhook 需要 raw body
  app.use('/v1/kyc/webhook', bodyParser.raw({ type: '*/*' }));

  const config = new DocumentBuilder().setTitle('RH Playground API').setVersion('1.0').addBearerAuth().build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  await app.listen(process.env.PORT || 3001);
}
bootstrap();
```

4. 配置模块 `src/config/config.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
  ],
})
export class AppConfigModule {}
```

执行 `nest new` 正常情况下会生成 `src/app.module.ts`，默认内容包含 `AppController` 和 `AppService`，这是 NestJS 项目的主模块文件。如果你在 `src` 目录下没有看到它，可能是 CLI 版本或命令执行目录问题导致没有生成。解决办法：

* 确认命令是否在正确目录下执行（`pnpm dlx @nestjs/cli new .` 在 apps/api 内）。
* 如果仍然没有，可以手动创建一个 `src/app.module.ts`，内容如下：

```ts
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

这样就有了最小化的主模块文件，后续可以在这里逐步导入各个功能模块。

5. Prisma 初始化：

```bash
# 在 apps/api 目录下执行（即 NestJS 项目的根目录）
pnpm dlx prisma init --datasource-provider postgresql
```

编辑 `prisma/schema.prisma`：

```prisma
generator client { provider = "prisma-client-js" }

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum KycStatus {
  PENDING
  APPROVED
  REJECTED
  REVIEW
}

enum WalletProvider {
  PRIVY
  SIWE
  SAFE
  OTHER
}

enum WalletKind {
  EMBEDDED
  EXTERN
  SAFE
  AA
}

model Account {
  id             String     @id @default(cuid())
  email          String?    @unique
  phone          String?    @unique
  privyUserId    String?    @unique
  kycStatus      KycStatus  @default(PENDING)
  kycApplicantId String?    @unique
  flags          Json       // { frozen: false, risk_score: 0 }
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  wallets        Wallet[]
  auditLogs      AuditLog[]
  @@index([kycStatus])
}

model Wallet {
  id         String         @id @default(cuid())
  accountId  String
  address    String         @unique
  provider   WalletProvider
  kind       WalletKind
  createdAt  DateTime       @default(now())
  account    Account        @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@index([accountId])
}

model KycEvent {
  id           String   @id @default(cuid())
  accountId    String
  applicantId  String
  provider     String
  type         String
  payload      Json
  createdAt    DateTime @default(now())
  @@index([accountId])
}

model Session {
  id           String   @id @default(cuid())
  accountId    String
  refreshToken String   @unique
  userAgent    String?
  ip           String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  @@index([accountId])
}

model AuditLog {
  id          String   @id @default(cuid())
  accountId   String?
  actor       String
  action      String
  metadata    Json
  createdAt   DateTime @default(now())
}
```

运行迁移并生成客户端（注意这里可以通过修改 schema.prisma 的 `generator client` 来指定输出路径）： 例如：

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "./generated/prisma"
}
```

这样生成的 Prisma Client 会在 `apps/api/generated/prisma` 下，需要在代码里：

```ts
import { PrismaClient } from '../generated/prisma';
```

```bash
# 位于 apps/api
export DATABASE_URL="postgresql://rh:rh@localhost:5432/rh?schema=public"
# 注意：Prisma 的 enum 值必须逐行定义，且不要与 SQL 保留字冲突。建议：
#   enum WalletProvider { PRIVY SIWE SAFE OTHER_ }
#   enum WalletKind { EMBEDDED EXTERN SAFE AA_ }
# 修改 schema.prisma 中的枚举定义后再执行：
pnpm dlx prisma migrate dev --name init
```

6. 基础设施封装（Prisma/Redis/KMS）：

* `src/infra/prisma.service.ts`

```ts
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() { await this.$connect(); }
  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => { await app.close(); });
  }
}
```

* `src/infra/redis.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
}
```

在 `app.module.ts` 注册 `PrismaService` 与 `RedisService`。

---

# 3. 认证：Privy 流程

## 3.1 环境变量

在 `apps/api/.env` 加入（示例，Privy 控制台给你的通常是 `APP_ID` 和 `APP_SECRET`，不是 JWT 公钥。这里需要做两层配置：前端使用 `APP_ID`，后端需要用 `APP_SECRET` 调用 Privy API 获取 JWKS 公钥并做 JWT 验签。开发阶段可以先把 `APP_ID`、`APP_SECRET` 写入 env，并留好 `PRIVY_JWK_JSON` 变量用于缓存 JWKS）：

```
PORT=3001
DATABASE_URL=postgresql://rh:rh@localhost:5432/rh?schema=public
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=dev_secret_change_me
JWT_EXPIRES=15m
REFRESH_EXPIRES=30d
# Privy
PRIVY_JWK_JSON={"kty":"RSA","n":"...","e":"AQAB"}
PRIVY_AUD=privy
```

> 生产应从 Privy 的 JWKS 端点拉取并缓存公钥，而非硬编码。

## 3.2 模块与控制器

* `src/modules/auth/auth.module.ts`

```ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [PrismaService, RedisService],
})
export class AuthModule {}
```

* `src/modules/auth/auth.controller.ts`

```ts
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import { PrismaService } from '../../infra/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Post('privy')
  async privy(@Body() dto: { idToken: string }) {
    const jwk = JSON.parse(process.env.PRIVY_JWK_JSON!);
    const pem = jwkToPem(jwk);
    const payload: any = jwt.verify(dto.idToken, pem, { algorithms: ['RS256'], audience: process.env.PRIVY_AUD });
    const email = payload.email as string | undefined;
    const privyUserId = payload.sub as string;

    const account = await this.prisma.account.upsert({
      where: { privyUserId },
      create: { privyUserId, email },
      update: { email },
    });

    const access_token = this.jwt.sign({ sub: account.id }, { secret: process.env.JWT_SECRET!, expiresIn: process.env.JWT_EXPIRES || '15m' });
    const refresh_token = this.jwt.sign({ sub: account.id, t: 'refresh' }, { secret: process.env.JWT_SECRET!, expiresIn: process.env.REFRESH_EXPIRES || '30d' });

    await this.prisma.session.create({ data: { accountId: account.id, refreshToken: refresh_token, expiresAt: new Date(Date.now() + 30*24*3600*1000) } });

    return { user: { id: account.id, email: account.email, kycStatus: account.kycStatus }, access_token, refresh_token };
  }
}
```

---

# 4. 钱包绑定 API

* `src/modules/wallets/wallets.module.ts`

```ts
import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { PrismaService } from '../../infra/prisma.service';

@Module({ controllers: [WalletsController], providers: [PrismaService] })
export class WalletsModule {}
```

* `src/modules/wallets/wallets.controller.ts`

```ts
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';

@Controller('wallets')
export class WalletsController {
  constructor(private prisma: PrismaService) {}

  @Post('register')
  async register(@Req() req: any, @Body() dto: { address: string; provider: 'PRIVY'|'SIWE'|'SAFE'|'OTHER'; kind: 'EMBEDDED'|'EXTERN'|'SAFE'|'AA'; }) {
    const accountId = req.user?.sub || req.accountId || (await this.prisma.account.findFirst()).id; // Demo: 替换为 JWT Guard
    await this.prisma.wallet.upsert({
      where: { address: dto.address },
      update: { provider: dto.provider as any, kind: dto.kind as any, accountId },
      create: { accountId, address: dto.address, provider: dto.provider as any, kind: dto.kind as any },
    });
    return { ok: true };
  }

  @Get()
  async list(@Req() req: any) {
    const accountId = req.user?.sub || (await this.prisma.account.findFirst()).id;
    return this.prisma.wallet.findMany({ where: { accountId } });
  }
}
```

> 生产应使用 JWT Guard 从 `Authorization: Bearer` 解出 `sub=accountId`。

---

# 5. KYC（Sumsub）接入

## 5.1 环境变量

`apps/api/.env`：

```
# Sumsub 沙箱/生产凭据
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET=...
SUMSUB_BASE=https://api.sumsub.com   # 沙箱为 https://api.sumsub.com
SUMSUB_LEVEL=basic-kyc-level
SUMSUB_WEBHOOK_SECRET=replace_me
```

## 5.2 客户端与签名

* `src/modules/kyc/sumsub.client.ts`

```ts
import axios from 'axios';
import crypto from 'crypto';

export class SumsubClient {
  constructor(private appToken: string, private secret: string, private base: string) {}

  private sign(ts: number, method: string, path: string, body?: Buffer) {
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(ts + method + path);
    if (body) hmac.update(body);
    return hmac.digest('hex');
  }

  async createApplicant(externalUserId: string, levelName: string) {
    const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}&externalUserId=${encodeURIComponent(externalUserId)}`;
    const ts = Math.floor(Date.now() / 1000);
    const sig = this.sign(ts, 'POST', path);
    const { data } = await axios.post(this.base + path, {}, { headers: { 'X-App-Token': this.appToken, 'X-App-Access-Ts': ts, 'X-App-Access-Signature': sig } });
    return data;
  }

  async accessToken(applicantId: string, ttl = 600) {
    const path = `/resources/accessTokens?userId=${applicantId}&ttlInSecs=${ttl}`;
    const ts = Math.floor(Date.now() / 1000);
    const sig = this.sign(ts, 'POST', path);
    const { data } = await axios.post(this.base + path, {}, { headers: { 'X-App-Token': this.appToken, 'X-App-Access-Ts': ts, 'X-App-Access-Signature': sig } });
    return data; // { token, userId, ttlInSecs }
  }
}
```

## 5.3 控制器与 Webhook

* `在 `src/modules/kyc/kyc.controller.ts`中调用`this.client.accessToken(applicantId)` 时，TS 会提示 applicantId 可能为 null。解决办法是加一个兜底：

```ts
const token = await this.client.accessToken(applicantId!);
```

或在前面确保 applicantId 不为 null（比如 findFirstOrThrow 或手动抛错）。`

```ts
import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import crypto from 'crypto';
import { SumsubClient } from './sumsub.client';

@Controller('kyc')
export class KycController {
  private client = new SumsubClient(process.env.SUMSUB_APP_TOKEN!, process.env.SUMSUB_SECRET!, process.env.SUMSUB_BASE!);
  constructor(private prisma: PrismaService) {}

  @Post('session')
  async session(@Req() req: any) {
    const account = await this.prisma.account.findFirst(); // Demo：替换成 JWT 中的 sub
    let applicantId = account.kycApplicantId;
    if (!applicantId) {
      const created = await this.client.createApplicant(account.id, process.env.SUMSUB_LEVEL || 'basic-kyc-level');
      applicantId = created.id;
      await this.prisma.account.update({ where: { id: account.id }, data: { kycApplicantId: applicantId } });
    }
    const token = await this.client.accessToken(applicantId);
    return { applicant_id: applicantId, sumsub_token: token.token, expires_in: token.ttlInSecs };
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: any, @Headers('x-payload-digest') sig: string) {
    const raw: Buffer = req.rawBody; // main.ts 已配置 raw
    const digest = crypto.createHmac('sha256', process.env.SUMSUB_WEBHOOK_SECRET!).update(raw).digest('hex');
    if (digest !== sig) return { ok: false };
    const event = JSON.parse(raw.toString());

    const applicantId = event.applicantId || event.userId;
    const account = await this.prisma.account.findFirst({ where: { kycApplicantId: applicantId } });
    if (!account) return { ok: true };

    const type = event.type as string;
    const status = type.includes('APPLICATION_APPROVED') ? 'APPROVED' : type.includes('APPLICATION_REJECTED') ? 'REJECTED' : 'REVIEW';

    await this.prisma.$transaction([
      this.prisma.account.update({ where: { id: account.id }, data: { kycStatus: status as any } }),
      this.prisma.kycEvent.create({ data: { accountId: account.id, applicantId, provider: 'sumsub', type, payload: event } }),
    ]);
    return { ok: true };
  }
}
```

---

# 6. 权限门控（Gate）

* `src/modules/gate/gate.controller.ts`

```ts
import { Controller, Get, Req } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';

@Controller('gate')
export class GateController {
  constructor(private prisma: PrismaService) {}

  @Get('permissions')
  async permissions(@Req() req: any) {
    const account = await this.prisma.account.findFirst(); // Demo：替换为 JWT 提取
    const can = account.kycStatus === 'APPROVED' && !(account.flags as any)?.frozen;
    return {
      canTrade: can,
      canDeposit: can,
      canWithdraw: can,
      reasons: can ? [] : ['KYC not approved or account frozen'],
    };
  }
}
```

在 `app.module.ts` 导入 `AuthModule`、`WalletsModule`、`KycController` 与 `GateController` 所在模块。

---

# 7. 前端（Next.js 14 + Privy）

1. 初始化：

```bash
cd ../../apps/web
pnpm dlx create-next-app@latest . --typescript --eslint --app --src-dir --import-alias "@/*" --no-tailwind
pnpm add @privy-io/react-auth axios zod
```

2. `.env.local`：

```
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
NEXT_PUBLIC_API_BASE=http://localhost:3001/v1
```

3. 全局 Provider：`src/app/providers.tsx`

```tsx
'use client'
import { PrivyProvider } from '@privy-io/react-auth';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={{ embeddedWallets: { createOnLogin: 'users-without-wallets' } }}>
      {children}
    </PrivyProvider>
  );
}
```

在 `src/app/layout.tsx` 中包裹：

```tsx
import { Providers } from './providers';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body><Providers>{children}</Providers></body></html>
  );
}
```

4. 简易 API 封装：`src/lib/api.ts`

```ts
import axios from 'axios';
export const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_BASE });
```

5. 登录与钱包绑定页：`src/app/page.tsx`

```tsx
'use client'
import { usePrivy } from '@privy-io/react-auth';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function Home() {
  const { login, ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const [accessToken, setAccessToken] = useState<string>('');

  const onLogin = async () => {
    await login();
    const tok = await getAccessToken();
    setAccessToken(tok || '');
    if (tok) {
      await api.post('/auth/privy', { idToken: tok });
      const addr = user?.wallet?.address;
      if (addr) await api.post('/wallets/register', { address: addr, provider: 'PRIVY', kind: 'EMBEDDED' });
      alert('Login & wallet bind done');
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <h1>RH Playground</h1>
      {!authenticated ? (
        <button onClick={onLogin} disabled={!ready}>Login with Privy</button>
      ) : (
        <>
          <p>Address: {user?.wallet?.address}</p>
          <button onClick={() => logout()}>Logout</button>
        </>
      )}
      <KycBlock />
      <GateBlock />
    </main>
  );
}

function KycBlock() {
  const startKyc = async () => {
    const { data } = await api.post('/kyc/session');
    // 简化：弹窗提示；实际应嵌入 Sumsub WebSDK
    alert(`Sumsub token: ${data.sumsub_token}\napplicant: ${data.applicant_id}`);
  };
  return <button onClick={startKyc}>Start KYC</button>;
}

function GateBlock() {
  const check = async () => {
    const { data } = await api.get('/gate/permissions');
    alert(JSON.stringify(data, null, 2));
  };
  return <button onClick={check}>Check Permissions</button>;
}
```

> 如需真正嵌入 Sumsub WebSDK，请按其文档在页面中挂载 iframe 容器并调用 `init`，本指南已在后端生成 `sumsub_token`。

---

# 8. 运行与联调

1. 启动依赖服务（Postgres + Redis）：

```bash
docker compose up -d
```

2. 在后端项目根目录（apps/api）运行：

```bash
# 确保已设置 DATABASE_URL 环境变量
export DATABASE_URL="postgresql://rh:rh@localhost:5432/rh?schema=public"

# 应用数据库迁移
pnpm dlx prisma migrate dev

# 启动 NestJS 服务
pnpm start:dev
```

访问 Swagger 文档确认 API 已启动：[http://localhost:3001/docs](http://localhost:3001/docs)

3. 在前端项目目录（apps/web）运行：

```bash
# 在 apps/web 下执行：
pnpm --dir apps/web dev --port 3000
```

访问 [http://localhost:3000](http://localhost:3000)（推荐，Privy 要求 HTTPS/localhost 才能用嵌入钱包；用局域网 IP 会报错）验证：

* 登录并返回 idToken
* 自动创建并绑定钱包
* 触发 /kyc/session 接口
* 检查 /gate/permissions 返回结果

---

# 9. 验收清单（M1）

*

---

# 10. 进阶（M2+）

* **SIWE 外部钱包**：

  * 新增 `/auth/siwe/nonce`、`/auth/siwe/verify`（Redis 保存 5 分钟 nonce）
  * 绑定外部地址 `provider=SIWE, kind=EXTERN`
* **JWT Guard**：

  * 编写 `AuthGuard` 从 `Authorization: Bearer` 提取 `sub` 作为 `accountId`
* **Admin 面板**：

  * `/admin/accounts`、冻结/解冻接口、审计日志查询
* **安全**：

  * 字段级加密（AES‑GCM，密钥放 KMS），速率限制（登录/发起 KYC/验证码）
* **AA（M5）**：

  * 接入 Biconomy/Safe 4337，将 Privy 作为签名器；增加 Paymaster 与 Session Keys

---

# 11. 常见坑位与规避

* **Sumsub Webhook 原始体**：若未配置 raw body，HMAC 校验将失败
* **Privy 公钥**：生产环境请动态拉取 JWKS 并缓存，避免密钥轮换导致验签失败
* **时钟漂移**：JWT/签名相关操作建议使用 NTP 校时
* **CORS/HTTPS**：前后端域名不同需配置 CORS；生产一律启用 HTTPS（防止 token 泄露）
* **PII 最小化**：不落任何证件图片/视频，仅保存状态与 applicantId

---

# 12. 环境变量清单（汇总）

```dotenv
# API
PORT=3001
DATABASE_URL=postgresql://rh:rh@localhost:5432/rh?schema=public
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=change_me
JWT_EXPIRES=15m
REFRESH_EXPIRES=30d
# Privy
PRIVY_JWK_JSON={"kty":"RSA","n":"...","e":"AQAB"}
PRIVY_AUD=privy
# Sumsub
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET=...
SUMSUB_BASE=https://api.sumsub.com
SUMSUB_LEVEL=basic-kyc-level
SUMSUB_WEBHOOK_SECRET=...
```

---

# 13. 后续你可以让我生成的产物

* OpenAPI 3.1 YAML（基于以上控制器的完整 schema）
* Prisma seed 脚本（创建演示账户与审计日志）
* JWT Guard、SIWE 模块、Admin 管理端脚手架
* 前端 Sumsub WebSDK 嵌入页面与进度轮询组件

