import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { TRUST_PROXY } from './config/rate-limit';

// Orígenes del navegador autorizados a llamar al API directamente.
// El frontend normal usa el proxy /backend de Next (mismo origen) y no los necesita.
// En producción define CORS_ORIGINS="https://tu-dominio.com" (separados por coma).
function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? 'http://localhost:3002,http://127.0.0.1:3002';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // IP real del cliente detrás de Traefik y del proxy de Next (límite de peticiones por IP, config/rate-limit.ts).
  app.set('trust proxy', TRUST_PROXY);

  // Cabeceras de seguridad. El API solo sirve JSON; `same-site` deja que el frontend en otro puerto (desarrollo) o
  // subdominio lo use. HSTS igual que el frontend (next.config.ts): sin includeSubDomains.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: false },
    }),
  );

  app.enableCors({
    origin: allowedOrigins(),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  // Enable validation pipe globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend server is running on http://0.0.0.0:${port}`);
}
bootstrap();
