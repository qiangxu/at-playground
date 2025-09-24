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

  const config = new DocumentBuilder().setTitle('AT Playground API').setVersion('1.0').addBearerAuth().build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, doc);

  const apiBaseEnv = process.env.NEXT_PUBLIC_API_BASE?.trim();
  let port: number = 0;
  let serverUrl: string;

  if (apiBaseEnv) {
    try {
      const u = new URL(apiBaseEnv);
      port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
      serverUrl = apiBaseEnv.replace(/\/+$/g, '');
    } catch (e) {
      // if parsing fails, fall back to using the raw env value for logging
      serverUrl = apiBaseEnv.replace(/\/+$/g, '');
    }
  } else {
    serverUrl = `http://localhost:${port}/v1`;
  }

  await app.listen(port);
  console.log(`🚀 API server listening on ${serverUrl} (port ${port})`);
}
bootstrap();
