# Despliegue en VPS de Hostinger (Docker Compose)

Arquitectura: Traefik (80/443, HTTPS automático) → frontend Next.js → `/backend/*` → API NestJS → Postgres.
Solo Traefik publica puertos. La API y la base quedan en la red interna.

## 0. Probar antes en tu Mac (Docker Desktop)
```bash
cp .env.production.example .env.production   # rellena valores de prueba; DOMAIN=localhost no emite HTTPS
docker compose --env-file .env.production -f docker-compose.prod.yml config > /dev/null && echo "compose OK"
docker build -f apps/backend/Dockerfile -t bht-backend .
docker build -f apps/frontend/Dockerfile -t bht-frontend .
```

## 1. Preparar el VPS
1. Crea un VPS con la plantilla **Ubuntu + Docker** de Hostinger.
2. En el DNS de tu dominio, registro **A** → IP del VPS.
3. Abre 80 y 443 en el firewall del VPS.

## 2. Código
```bash
mkdir -p ~/apps && cd ~/apps
git clone <repo BestTimeToInvest>  BestTimeToInvest
git clone <repo BackTesting>       BackTesting     # scripts Python + result_*.json
sudo chown -R 1000:1000 BackTesting                # el contenedor corre como uid 1000
cd BestTimeToInvest && git checkout <rama a desplegar>
cp .env.production.example .env.production && nano .env.production
```
Con Firebase: agrega tu dominio en **Authentication → Settings → Authorized domains**.

## 3. Datos (una sola vez)
En tu Mac (la base local corre en el contenedor `buyholdtime-db`):
```bash
docker exec buyholdtime-db pg_dump -U postgres -Fc buyholdtime > bht.dump
scp bht.dump usuario@IP_VPS:~/apps/BestTimeToInvest/
```
En el VPS:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d database
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T database \
  pg_restore -U postgres -d buyholdtime --clean --if-exists < bht.dump
```
Copia también a `BackTesting/` del VPS los `result_*.json` que quieras conservar.

## 4. Levantar
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend
```
La API aplica `prisma migrate deploy` al arrancar. Abre `https://tudominio.com`.

## 5. Actualizar
```bash
git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Copias de seguridad
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T database \
  pg_dump -U postgres -Fc buyholdtime > backup-$(date +%F).dump
```

## Si el backend queda "unhealthy" tras restaurar el dump (error P3009)
Pasa cuando la base de origen tiene cambios de esquema aplicados sin registrar en
`_prisma_migrations` (por ejemplo con `prisma db push`). Prisma intenta aplicar esas migraciones
otra vez, la tabla ya existe y se bloquea. Si la estructura ya está en la base, márcalas como aplicadas
(sustituye los nombres por los que falten en `prisma/migrations`):
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm --no-deps backend sh -c '
for m in 20261028120000_add_thermo_history 20261028130000_add_bht_forward 20261028140000_add_bht_parts 20261028150000_add_hy_bonus 20261109000000_add_oil_bonus; do
  pnpm exec prisma migrate resolve --applied "$m"
done
pnpm exec prisma migrate status'
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```
`P3008` en alguna línea solo indica que esa migración ya estaba registrada.

## Docker Engine 29
Traefik debe ser v3.6.1 o superior; las versiones anteriores no ven los contenedores y todo responde
"404 page not found". El compose ya usa `traefik:v3.6`.

## Refresco semanal del CAPE de Shiller (sustituye al launchd del Mac)
`refresh-shiller-weekly.sh` descarga el Excel de Yale, regenera los CSV y recalcula termómetro y BHT.
En el VPS se programa con cron del host (lunes 08:00 hora del servidor):
```bash
crontab -e
0 8 * * 1  cd ~/apps/BestTimeToInvest && docker compose --env-file .env.production -f docker-compose.prod.yml exec -T -e BE=/repo/apps/backend backend sh /opt/backtesting/refresh-shiller-weekly.sh
```
El log queda dentro del contenedor en `/tmp/shiller-weekly.log`. Al arrancar, el backend genera por sí solo
los CSV de `/tmp` si faltan (`apps/backend/docker/bootstrap-shiller.sh`) y el Excel descargado persiste en el volumen `bht_data`.

## Precios diarios de los tickers

El backend sincroniza solo los precios históricos y las métricas de los tickers (Yahoo) de lunes a viernes a las 23:00 hora de Nueva York (cron en el propio backend, `TickerSyncScheduler`). No hay que programar nada en el VPS.
Para ejecutarlo a mano: `docker compose --env-file .env.production -f docker-compose.prod.yml exec -T backend node -e "fetch('http://localhost:4000/tickers/sync',{method:'POST',headers:{'x-api-key':process.env.SYNC_API_KEY}}).then(r=>r.text()).then(console.log)"`.
Para desactivarlo, define `TICKER_SYNC_CRON=off` en el servicio `backend`.

## Informes SEC EDGAR

El backend actualiza solo el EPS trimestral, utilidad neta, ingresos y acciones (`prisma/sync-all-stocks-edgar.ts`) los domingos a las 03:00 hora de Nueva York. Si defines `FMP_API_KEY` también incorpora los trimestres más recientes de FMP; sin ella usa la clave `demo`, muy limitada.
Ejecución manual de un ticker: `docker compose --env-file .env.production -f docker-compose.prod.yml exec -T -w /repo/apps/backend -e SYMBOLS=AAPL backend npx ts-node prisma/sync-all-stocks-edgar.ts` (sin `SYMBOLS` recorre todos).
Para desactivar el cron define `EDGAR_SYNC_CRON=off` en el servicio `backend`.

## Notas
- Los scripts de BackTesting que corren en tu Mac contra la API ya no la ven en `localhost:4000` del VPS.
  Si quieres seguir lanzándolos desde fuera, expón la API con una regla de Traefik propia
  (`api.tudominio.com`) y usa `SYNC_API_KEY`.
- Fija versiones exactas en `apps/backend/docker/python-requirements.txt` (`pip freeze`).
