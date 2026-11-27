import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { HeavyThrottle, isInternalIp, RATE_LIMITS, SignupThrottle, skipRateLimit, throttlerOptions, TRUST_PROXY } from './rate-limit';

describe('red interna', () => {
  test.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.50.107', '169.254.1.1', 'fd12:3456::1', 'fe80::1'])(
    '%s es interna',
    (ip) => expect(isInternalIp(ip)).toBe(true),
  );
  test.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '189.203.1.2', '2001:4860:4860::8888', '::ffff:8.8.8.8', '', '999.1.1.1', 'abc'])(
    '%s no es interna',
    (ip) => expect(isInternalIp(ip)).toBe(false),
  );
  test('sin IP no se salta el límite; con x-api-key válida sí', () => {
    const prev = process.env.SYNC_API_KEY;
    process.env.SYNC_API_KEY = 'k'.repeat(32);
    try {
      expect(skipRateLimit({ ip: '8.8.8.8', headers: {} })).toBe(false);
      expect(skipRateLimit({ ip: '8.8.8.8', headers: { 'x-api-key': 'k'.repeat(32) } })).toBe(true);
      expect(skipRateLimit({ ip: '8.8.8.8', headers: { 'x-api-key': 'otra-clave-cualquiera' } })).toBe(false);
      expect(skipRateLimit({})).toBe(false);
    } finally {
      process.env.SYNC_API_KEY = prev;
    }
  });
});

@Controller()
class TestController {
  @Get('light') light() { return { ok: true }; }
  @Get('other') other() { return { ok: true }; }
  @Get('heavy') @HeavyThrottle() heavy() { return { ok: true }; }
  @Post('signup') @SignupThrottle() signup() { return { ok: true }; }
}

describe('límite por IP detrás de Traefik y del proxy de Next', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(throttlerOptions)],
      controllers: [TestController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    const a = mod.createNestApplication<NestExpressApplication>();
    a.set('trust proxy', TRUST_PROXY);
    app = await a.init();
  });
  afterEach(() => app.close());

  // supertest conecta por loopback (proxy de confianza): X-Forwarded-For hace de IP del cliente, como en la VPS.
  const hit = (path: string, ip?: string, method: 'get' | 'post' = 'get') => {
    const r = request(app.getHttpServer())[method](path);
    return ip ? r.set('X-Forwarded-For', ip) : r;
  };

  test('una IP pública se frena al pasar el límite de la ruta, con Retry-After; otra IP no se afecta', async () => {
    const n = RATE_LIMITS.heavy.short.limit;
    for (let i = 0; i < n; i++) expect((await hit('/heavy', '203.0.113.7')).status).toBe(200);
    const blocked = await hit('/heavy', '203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after-short']).toBeDefined();
    expect((await hit('/heavy', '198.51.100.9')).status).toBe(200);
    expect((await hit('/light', '203.0.113.7')).status).toBe(200); // contador por ruta
  });

  test('cadena Traefik → Next: cuenta la IP del cliente, no la de los proxies', async () => {
    const n = RATE_LIMITS.heavy.short.limit;
    for (let i = 0; i < n; i++) await hit('/heavy', `203.0.113.7, 172.18.0.${2 + (i % 5)}`);
    expect((await hit('/heavy', '203.0.113.7, 172.18.0.3')).status).toBe(429);
  });

  test('red interna (render de Next, cron) sin límite', async () => {
    const n = RATE_LIMITS.heavy.short.limit + 5;
    for (let i = 0; i < n; i++) expect((await hit('/heavy')).status).toBe(200);
    for (let i = 0; i < n; i++) expect((await hit('/heavy', '172.18.0.4')).status).toBe(200);
  });

  test('suscripción: 3 por minuto', async () => {
    for (let i = 0; i < RATE_LIMITS.signup.short.limit; i++) expect((await hit('/signup', '203.0.113.8', 'post')).status).toBe(201);
    expect((await hit('/signup', '203.0.113.8', 'post')).status).toBe(429);
  });
});
