-- Rol limitado para el GuruFocus Scrapper (arquitectura A: la Mac escribe en la BD de la VPS).
-- No es dueño de ninguna tabla: no puede DROP/ALTER/TRUNCATE ni crear tablas, ni leer
-- tablas de BuyHoldTime fuera de `tickers`. Un `prisma db push`/`migrate` desde el repo
-- del scraper (que solo declara stocks/snapshots) fallaría sin tocar nada.
--
-- Uso (como superusuario; la contraseña va por variable, nunca en este archivo):
--   psql "$ADMIN_DATABASE_URL" -v gf_password="$(openssl rand -hex 24)" -f gurufocus-scraper-role.sql
-- Luego, en el scraper: DATABASE_URL=postgresql://gurufocus_scraper:<contraseña>@<host>:5432/buyholdtime?schema=public
-- Probado en desarrollo el 2026-11-12.

CREATE ROLE gurufocus_scraper LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'gf_password';

GRANT CONNECT ON DATABASE buyholdtime TO gurufocus_scraper;
GRANT USAGE ON SCHEMA public TO gurufocus_scraper;

-- Lectura de símbolos (SchedulerService.syncTickers: SELECT symbol FROM tickers)
GRANT SELECT ON tickers TO gurufocus_scraper;

-- Tablas propias del scraper
GRANT SELECT, INSERT, UPDATE, DELETE ON stocks, snapshots TO gurufocus_scraper;
GRANT USAGE, SELECT ON SEQUENCE stocks_id_seq, snapshots_id_seq TO gurufocus_scraper;
