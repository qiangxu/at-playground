import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
}
