// 从我们自定义的生成位置导入
import { PrismaClient } from '../generated/client';

// 导出一个单例，避免创建多个数据库连接
export const prisma = new PrismaClient();

// 同时导出所有类型，方便在其他地方使用
export * from '../generated/client';