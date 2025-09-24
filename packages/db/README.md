# db 目录使用说明

本目录为 monorepo 的数据库 schema、迁移和 Prisma Client 统一管理位置。

## 1. 数据库配置

- 数据库连接信息建议统一放在项目根目录的 `.env` 文件中，例如：
  ```env
  DATABASE_URL="postgresql://user:password@host:port/dbname"
  ```
- `schema.prisma` 中的 `datasource` 会自动读取 `DATABASE_URL`。

## 2. 检查数据库连接

- 命令行测试：
  ```bash
  psql postgresql://user:password@host:port/dbname
  ```
- Prisma 连接测试：
  ```bash
  pnpm prisma db pull
  ```
- Prisma Studio 可视化：
  ```bash
  pnpm prisma studio
  ```

## 3. 生成和同步数据库

- 重新生成数据库（开发环境，清空并重建）：
  ```bash
  pnpm prisma migrate reset
  ```
- 生成 migration（schema 变更后）：
  ```bash
  pnpm prisma migrate dev --name init
  ```
- 生成 Prisma Client：
  ```bash
  pnpm prisma generate
  ```

## 4. .env 文件管理建议

- 推荐在 monorepo 根目录放置 `.env`，所有包共用。
- 如有特殊需求，可在本目录下放 `.env.local` 覆盖。
- Prisma CLI 会自动向上查找 `.env` 文件。

## 5. 常见问题

- 如果遇到连接失败，优先检查 `.env` 配置和数据库服务状态。
- 可用 `systemctl status postgresql` 或 `service postgresql status` 检查本地数据库服务。

---
如有更多问题请查阅 Prisma 官方文档或联系项目维护者。
