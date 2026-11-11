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

## Notas
- Los scripts de BackTesting que corren en tu Mac contra la API ya no la ven en `localhost:4000` del VPS.
  Si quieres seguir lanzándolos desde fuera, expón la API con una regla de Traefik propia
  (`api.tudominio.com`) y usa `SYNC_API_KEY`.
- Fija versiones exactas en `apps/backend/docker/python-requirements.txt` (`pip freeze`).
