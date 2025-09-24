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

  const port = Number(process.env.PORT);
  await app.listen(port);
  const serverUrl = `http://localhost:${port}`;
  console.log(`🚀 API server listening on ${serverUrl}`);
}
bootstrap();
