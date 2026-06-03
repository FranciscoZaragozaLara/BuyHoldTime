# Guía de Pautas Tecnológicas y Buenas Prácticas (AppTechGuidelines)

Este documento establece las directrices técnicas, convenciones de diseño, arquitectura y mejores prácticas para el desarrollo de aplicaciones web utilizando un stack profesional basado en **Next.js**, **NestJS**, **PostgreSQL** y **Docker**. Sirve como plantilla técnica reutilizable para proyectos actuales y futuros.

---

## 1. Estructura general del proyecto (Monorepositorio)

Para facilitar el desarrollo, pruebas y compartición de código (tipos, DTOs, validaciones), se utilizará una estructura de monorepositorio basada en **pnpm workspaces**.

```text
/
├── apps/
│   ├── frontend/             # Aplicación Next.js
│   └── backend/              # API Rest NestJS
├── packages/
│   ├── shared/               # Tipos, enums y esquemas compartidos
│   └── config/               # Configuraciones comunes (eslint, tsconfig)
├── docs/                     # Documentación del proyecto
├── docker-compose.yml        # Orquestación de desarrollo local
├── pnpm-workspace.yaml       # Configuración de workspaces de pnpm
└── README.md
```

---

## 2. Pautas del Frontend (Next.js)

### 2.1. Tecnologías Clave
* **Framework**: Next.js (App Router) con TypeScript.
* **Estilos**: Tailwind CSS para diseño rápido y responsivo.
* **Componentes base**: Radix UI (sin estilos) + Shadcn/ui (estilizado mediante Tailwind).
* **Gráficos**:
  * `lightweight-charts` (TradingView) para gráficos interactivos de series temporales y velas financieras.
  * `recharts` para gráficos estadísticos (barras, pastel, áreas simples).
* **Manejo de Estado**: Zustand (estado global ligero) + TanStack Query / React Query (estado del servidor y caché).

### 2.2. Estructura de Directorios (`apps/frontend`)
Se utilizará la convención de co-localización de componentes dentro del App Router.

```text
apps/frontend/
├── src/
│   ├── app/                  # Ruteo y layouts (App Router)
│   │   ├── [locale]/         # Ruteo con soporte multi-idioma (i18n)
│   │   └── layout.tsx
│   ├── components/           # Componentes UI globales (ui/, layouts/, charts/)
│   ├── hooks/                # Custom React hooks de uso global
│   ├── services/             # Clientes e integraciones de APIs externas
│   ├── store/                # Estados globales con Zustand
│   └── styles/               # CSS global e integraciones de Tailwind
├── public/                   # Archivos estáticos (imágenes, iconos, fuentes)
├── tailwind.config.js
└── tsconfig.json
```

### 2.3. Convenciones de Desarrollo
* **Componentes de Servidor por Defecto (RSC)**: Los componentes dentro de `src/app` deben ser Server Components por defecto. Solo agregar la directiva `'use client'` cuando se requiera interactividad (hooks como `useState`, `useEffect`, o librerías de gráficos).
* **Tailwind CSS**: Evitar clases CSS personalizadas arbitrarias a menos que sea estrictamente necesario. Usar la paleta de colores semánticos definidos en `tailwind.config.js` (ej. `bg-background`, `text-primary`, `border-border`).
* **Diseño Responsivo**: Seguir la estrategia *Mobile First*. Utilizar los modificadores de pantalla de Tailwind (`md:`, `lg:`, etc.) para adaptar las interfaces.

### 2.4. Multi-idioma (i18n)
* **Estrategia por Defecto**: Soporte para Español (`es`) e Inglés (`en`).
* **Librería recomendada**: `next-intl` (diseñada para Next.js App Router).
* **Detección Automática**: Middleware que analice la cabecera `Accept-Language` y cookies de preferencia del usuario para redirigir automáticamente (ej. `/es/dashboard` o `/en/dashboard`).
* **Estructura**:
  * `/messages/es.json` y `/messages/en.json` en la raíz del frontend.
* **Regla**: No codificar textos estáticos directamente en componentes. Toda cadena visible debe pasar por hooks de i18n (`const t = useTranslations('Namespace')`).

### 2.5. Estrategias de SEO y Tráfico Orgánico
Para maximizar el posicionamiento en buscadores (Google, Bing) y generar tráfico orgánico:
* **Rendimiento e Indexación**: Utilizar Server-Side Rendering (SSR) en páginas de consulta de tickers y Generación Estática (SSG/ISR) en páginas informativas y la Landing Page. Esto garantiza que los buscadores analicen el HTML estructurado inmediatamente.
* **Next.js Metadata API**: Definir metadatos estáticos o dinámicos mediante `generateMetadata()` en cada página, incluyendo:
    * `<title>` dinámico y único.
    * `<meta name="description">` corto y descriptivo.
    * Etiquetas Open Graph (`og:title`, `og:description`, `og:image`) y Twitter Cards.
* **Rutas Dinámicas de Sitemap y Robots**:
    * Generar el sitemap de forma dinámica en `src/app/sitemap.ts` para indexar automáticamente todas las páginas de los 50 tickers e indicadores.
    * Configurar `public/robots.txt` enlazado al sitemap y bloqueando secciones no indexables (ej. `/dashboard`, `/admin`).
* **Datos Estructurados (JSON-LD)**: Incorporar esquemas tipo `FinancialProduct` o `Dataset` mediante bloques `<script type="application/ld+json">` en las páginas de consulta de precios para lograr Rich Snippets en Google.

### 2.6. Integración de Publicidad (Monetización Controlada)
El soporte para redes de publicidad recomendadas (ej. Google AdSense) debe ser discreto y controlado:
* **Prevención de CLS (Cumulative Layout Shift)**: Todo bloque publicitario debe tener un contenedor padre con dimensiones explícitas predefinidas (ancho y alto mínimo) para evitar saltos de diseño mientras se carga el anuncio, protegiendo la métrica Core Web Vitals de Google.
* **Componente Publicitario Aislado**: Crear un componente reactivo `<AdBanner slot="xxxx" type="banner|native" />` con un placeholder animado (Skeleton) que solo monte los scripts de anuncios en producción (`process.env.NODE_ENV === 'production'`).
* **Control de Activación**: Archivo centralizado de configuración (`src/config/ads.ts`) para encender/apagar anuncios a nivel global.
* **Archivo ads.txt**: Ubicar de forma obligatoria el archivo `ads.txt` en `public/ads.txt` para autorizar a los vendedores de publicidad.

---

## 3. Pautas del Backend (NestJS)

### 3.1. Arquitectura de Software: Clean Architecture
Para garantizar la mantenibilidad, escalabilidad y testabilidad, se dividirá el backend en 3 capas lógicas claras:

```text
src/
├── domain/                   # Capa del Dominio (Entidades de negocio y reglas puras, sin dependencias externas)
├── application/              # Capa de Aplicación (Casos de uso, interfaces, DTOs)
└── infrastructure/           # Capa de Infraestructura (Controladores REST, Entidades de BD, Adaptadores, Repositorios)
```

### 3.2. Estructura de Directorios por Módulo (`apps/backend`)
Cada módulo funcional implementará la separación de capas:

```text
apps/backend/src/modules/ticker/
├── domain/
│   └── ticker.entity.ts
├── application/
│   ├── use-cases/
│   │   └── get-ticker-history.use-case.ts
│   └── ports/
│       └── ticker-repository.interface.ts
├── infrastructure/
│   ├── controllers/
│   │   ├── ticker.controller.ts
│   │   └── dto/
│   │       └── get-ticker.dto.ts
│   ├── database/
│   │   ├── ticker.orm-entity.ts
│   │   └── ticker.repository.impl.ts
│   └── ticker.module.ts
```

### 3.3. Base de Datos y ORM
* **Base de Datos**: PostgreSQL para almacenamiento relacional y estructurado.
* **ORM**: **Prisma ORM** por su tipado estático robusto y facilidad de migraciones.
* **Convenciones de Base de Datos**:
  * Nombres de tablas en minúscula y plural (`users`, `historical_prices`).
  * Nombres de columnas en snake_case (`created_at`, `buy_hold_index`).
  * Claves primarias siempre como `id` (UUIDv4 para evitar enumeración, o BigInt autoincremental para tablas con millones de registros de series temporales de alta velocidad).
  * Índices explícitos en columnas de búsqueda frecuentes (ej. `symbol` en tablas de precios).

### 3.4. Validación y Serialización
* Usar `class-validator` y `class-transformer` de forma global mediante el NestJS `ValidationPipe`.
* Validar siempre las entradas (DTOs de Query o Body) en los controladores.

---

## 4. Configuración de Variables de Entorno

* Las variables de entorno críticas nunca deben subirse al repositorio. Añadir `.env` y `.env.production` al `.gitignore`.
* Proveer un archivo `.env.example` completo en la raíz de cada app con valores predeterminados seguros para desarrollo.
* **Validación**: En el Backend, validar las variables de entorno al iniciar la aplicación usando un esquema de `zod` o el módulo `@nestjs/config` con Joi.

### Ejemplo de Variables requeridas
```ini
# Database Connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/buyholdtime?schema=public"

# Application Config
PORT=3000
NODE_ENV="development"

# Security
JWT_SECRET="un_secreto_super_seguro_para_produccion"
```

---

## 5. Docker y Orquestación

### 5.1. Desarrollo Local
Utilizar `docker-compose.yml` en la raíz del monorepositorio para levantar los servicios necesarios en local (PostgreSQL, Redis para caché, etc.).

```yaml
version: '3.8'

services:
  database:
    image: postgres:15-alpine
    container_name: buyholdtime-db
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: super_password
      POSTGRES_DB: buyholdtime
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 5.2. Producción (Multi-Stage Builds)
Los archivos Dockerfile para los microservicios deben estructurarse en fases para minimizar el tamaño de las imágenes finales:

```dockerfile
# --- Etapa de Compilación ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- Etapa de Producción ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/main.js"]
```

---

## 6. Despliegue en Producción (Hostinger / VPS)

Para el despliegue en un VPS como Hostinger, se recomienda la siguiente arquitectura simplificada y robusta:

1. **Nginx** como Servidor Web y Proxy Inverso en la máquina host, configurado para redirigir el tráfico web al contenedor del Frontend (puerto `3000`) y las peticiones API al Backend (puerto `4000`).
2. **Certbot (Let's Encrypt)** para la administración automática de certificados SSL/TLS gratuitos.
3. **Docker Compose en Producción** administrando los contenedores de Next.js, NestJS y PostgreSQL en una red interna privada e invisible desde el exterior.
4. **Respaldo automatizado**: Script programado con Cron en el host para realizar dumps diarios de PostgreSQL y almacenarlos de forma segura.
