import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // 从环境变量中动态读取前端端口，并提供默认值
  const webPort = process.env.WEB_PORT;
  const webSslPort = process.env.SSL_PORT;

  // Enable CORS to allow requests from your frontend
  app.enableCors({
    origin: [
      `http://localhost:${webPort}`,  // e.g., http://localhost:3000
      `https://localhost:${webSslPort}`, // e.g., https://localhost:3001
    ],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('v1');

  // Sumsub webhook 需要 raw body
  app.use('/v1/kyc/webhook', bodyParser.raw({ type: '*/*' }));

  const config = new DocumentBuilder().setTitle('AT Playground API').setVersion('1.0').addBearerAuth().build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  const apiBaseEnv = process.env.NEXT_PUBLIC_API_BASE?.trim();
  const port = Number(process.env.API_PORT);

  let serverUrl: string;

  if (apiBaseEnv) {
    try {
      const u = new URL(apiBaseEnv);
      serverUrl = apiBaseEnv.replace(/\/+$/g, '');
    } catch (e) {
      // if parsing fails, fall back to using the raw env value for logging
      serverUrl = apiBaseEnv.replace(/\/+$/g, '');
    }
  } else {
    serverUrl = `http://localhost:${port}/v1`;
  }

  // Listen on all network interfaces
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 API server listening on ${serverUrl} (port ${port})`);
}
bootstrap();
