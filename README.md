# Gestión de Almacenajes

SaaS para la gestión integral de costes de almacenaje, movimientos de mercancía, puestas a disposición y análisis en tiempo real.

## Características

- **Dashboard** con KPIs en tiempo real: coste hoy/mes/año, stock pendiente, cantidad invendida por producto, movimientos. Toggle de indicadores estilo iOS.
- **Puestas a disposición** — contratos de mercancía con salidas parciales, días de plancha, tarifas escalonadas por tramo, traspaso entre almacenes y desaplicaciones.
- **Almacenes y productos** — CRUD completo. Las tarifas de almacenaje viven en el almacén con **histórico de precios** (no en el producto). Productos con icono y fondo personalizables.
- **Entradas y salidas de mercancía** — registro con proveedor/cliente, días de plancha, matrícula y cálculo automático de inicio de costes.
- **Costes de almacenaje** — generación automática diaria vía cron, recálculo manual por rango de fechas, auto-salida por fin de plancha.
- **Facturación mensual** — generación de facturas por periodo con desaplicaciones.
- **Buscador** global — busca puestas, salidas y movimientos por matrícula, cliente, producto, etc.
- **Importación de PDF (IA)** — adjunta un albarán/listado en PDF y Gemini propone las salidas a registrar (nunca graba sin confirmación).
- **API REST v1** — integración con **Microsoft Dynamics 365 Business Central** (ver sección dedicada).
- **Exportación** — CSV y Excel en todas las secciones, PDF en informes.
- **Autenticación** — login con email/contraseña, roles admin/user, RLS en todas las tablas.
- **Modo Desarrollo/Producción** — conmutador que cambia entre el schema `dev` y `public` de la misma base de datos mediante cookie.
- **Backup diario** — workflow de GitHub Actions que respalda la base de datos (artifacts, retención 90 días).
- **Modo oscuro** — toggle en el header, persistido por `next-themes`.

## Regla de negocio: días de plancha

Los **días de plancha** son los días desde la entrada/puesta en los que **no** se genera coste. El coste empieza a correr el día siguiente al fin de plancha.

Ejemplo: puesta el 1 de enero con 3 días de plancha → `fecha_fin_plancha = 4 de enero` → el coste comienza el 5 de enero.

En las puestas a disposición, `fecha_fin_plancha` es una columna **GENERATED ALWAYS** (`fecha_puesta + dias_plancha`) calculada en la base de datos.

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15.3 (App Router) |
| UI | React 19, TailwindCSS 3, shadcn/ui |
| Tablas | TanStack Table v8 |
| Gráficas | Recharts 2 |
| Formularios | React Hook Form + Zod |
| Base de datos | Supabase (PostgreSQL) — schemas `public` y `dev` |
| Auth | Supabase Auth + @supabase/ssr |
| IA | Google Gemini (análisis de PDF) |
| Exportación | xlsx (Excel), jspdf (PDF) |
| Deploy | Vercel |

## Estructura del proyecto

```
├── app/
│   ├── (auth)/login/              # Página de login
│   ├── (dashboard)/               # Área protegida
│   │   ├── dashboard/             # Dashboard con KPIs y gráficas
│   │   ├── warehouses/            # CRUD almacenes + histórico de precios
│   │   │   └── [id]/[productId]/  # Detalle de stock por almacén/producto
│   │   ├── products/              # CRUD productos (icono + fondo)
│   │   ├── suppliers/             # CRUD proveedores
│   │   ├── customers/             # CRUD clientes
│   │   ├── puestas/               # Puestas a disposición + detalle/[id]
│   │   ├── movements/
│   │   │   ├── inbound/           # Entradas de mercancía
│   │   │   └── outbound/          # Salidas de mercancía
│   │   ├── storage-costs/         # Costes de almacenaje
│   │   └── buscador/              # Buscador global
│   └── api/
│       ├── cron/calculate-costs/      # Cron job diario (Vercel)
│       ├── storage-costs/recalculate/ # Recálculo manual
│       └── v1/                        # API REST para Business Central
│           ├── health/                #   GET  — healthcheck
│           ├── products/              #   POST — upsert producto
│           ├── suppliers/             #   POST — upsert proveedor
│           ├── customers/             #   POST — upsert cliente
│           ├── inbound/               #   POST — entrada (idempotente)
│           ├── outbound/              #   POST — salida (idempotente)
│           └── puestas/               #   POST — puesta a disposición (idempotente)
├── components/                    # layout/, shared/, ui/
├── modules/                       # Columnas y formularios por módulo
├── repositories/                  # Capa de acceso a datos (patrón Repository)
├── services/                      # Lógica de negocio
├── lib/
│   ├── supabase/                  # Clientes browser/server/middleware
│   ├── gemini.ts                  # Cliente de Google Gemini
│   ├── bc-api-auth.ts             # Validación de API Key de Business Central
│   └── actions/                   # Server actions (p.ej. import de PDF)
├── types/                         # Tipos de dominio y helpers de DB
├── utils/                         # format, export, calculations
├── validations/                   # Esquemas Zod
├── .github/workflows/             # db-backup.yml (backup diario)
└── supabase/migrations/           # SQL completo del esquema (001 → 015)
```

## Variables de entorno

Crea un archivo `.env.local` en la raíz con:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# Conexión directa a PostgreSQL (pooler de Supabase)
POSTGRES_URL=postgres://...

# URL pública de la app
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Secret para el cron job de Vercel
CRON_SECRET=genera-un-secret-aleatorio-largo

# Google Gemini (análisis de PDF — clave gratuita de Google AI Studio)
# https://aistudio.google.com/app/apikey
GEMINI_API_KEY=tu-gemini-api-key
# Opcional: modelo a usar (por defecto gemini-2.5-flash)
# GEMINI_MODEL=gemini-2.5-flash

# API Key para la integración con Business Central
# (debe coincidir con la que envía BC en Authorization: Bearer <key>)
BC_API_KEY=genera-un-secret-aleatorio-largo
```

> **Nota:** `BC_API_KEY` y `GEMINI_API_KEY` no están en el `.env.local` local por defecto. `BC_API_KEY` **sí** está configurada en Vercel (la API de producción está operativa).

## Configuración de Supabase

### 1. Crear proyecto

1. Ve a [supabase.com](https://supabase.com) y crea un nuevo proyecto.
2. Copia la URL y las claves desde **Project Settings → API**.

### 2. Ejecutar migraciones

En el **SQL Editor** de Supabase, ejecuta en orden los archivos de `supabase/migrations/` (de `001` a `015`).

> **Importante (dual schema):** la app soporta modo Desarrollo (`dev`) y Producción (`public`). Las migraciones que añaden o modifican columnas deben aplicarse a **ambos schemas** para que el conmutador dev/prod funcione. Ver `012_dev_schema.sql`.

El esquema crea, entre otros:
- Tablas: `warehouses`, `products`, `suppliers`, `customers`, `inbound_movements`, `outbound_movements`, `storage_costs`, `user_profiles`, `puestas_a_disposicion`, `tarifa_tramos`, `monthly_invoices`, histórico de precios de almacén, matrículas, etc.
- Funciones almacenadas: `calculate_storage_costs_for_date`, `recalculate_storage_costs`, `get_stock_summary`, `get_dashboard_kpis`, `get_monthly_cost_evolution`.
- Triggers de `updated_at` y `handle_new_user`.
- Políticas RLS en todas las tablas.

### 3. Configurar autenticación

En Supabase → **Authentication → Settings**:
- Deshabilita **Enable email confirmations** para desarrollo.
- Configura **Site URL** con tu dominio de producción.

### 4. Crear primer usuario administrador

```sql
UPDATE user_profiles SET role = 'admin' WHERE id = 'tu-user-id';
```

## Instalación y desarrollo local

```bash
npm install
cp .env.local.example .env.local   # edita con tus claves
npm run dev
```

La app estará disponible en [http://localhost:3000](http://localhost:3000).

## Integración con Business Central

La app expone una **API REST versionada** (`/api/v1/*`) para que una extensión de Dynamics 365 Business Central envíe datos maestros y movimientos.

### Autenticación

Todas las llamadas requieren la cabecera:

```
Authorization: Bearer <BC_API_KEY>
```

La clave se valida contra la variable de entorno `BC_API_KEY`. Si no coincide → `401 unauthorized`. Si no está configurada en el servidor → `500 server_configuration_error`.

### Endpoints

| Método | Ruta | Descripción | Clave de negocio |
|--------|------|-------------|------------------|
| `GET`  | `/api/v1/health`    | Healthcheck (API + BD) | — |
| `POST` | `/api/v1/products`  | Alta/actualización de producto | `code` |
| `POST` | `/api/v1/suppliers` | Alta/actualización de proveedor | `codigo` |
| `POST` | `/api/v1/customers` | Alta/actualización de cliente | `codigo` |
| `POST` | `/api/v1/inbound`   | Entrada de mercancía (idempotente) | `numero_albaran` |
| `POST` | `/api/v1/outbound`  | Salida de mercancía (idempotente) | `numero_albaran` |
| `POST` | `/api/v1/puestas`   | Puesta a disposición (idempotente) | `numero_puesta` |

**Idempotencia:** los movimientos y puestas usan su clave de negocio para evitar duplicados. Si BC reenvía el mismo registro, la API responde `200 { action: "already_exists" }` en lugar de crear un duplicado.

**Resolución de referencias:** BC envía códigos de texto (`warehouse_code`, `product_code`, `supplier_code`, `customer_code`) y la API los resuelve internamente a UUIDs. Si un código no existe → `422 reference_not_found`.

### Ejemplo — registrar una entrada

```http
POST /api/v1/inbound
Authorization: Bearer <BC_API_KEY>
Content-Type: application/json

{
  "numero_albaran": "ALB-2024-001",
  "warehouse_code": "CN",
  "product_code":   "051000",
  "supplier_code":  "PROV001",
  "quantity":       100.5,
  "movement_date":  "2024-01-15",
  "free_days":      0,
  "comments":       "Albarán nº..."
}
```

Respuestas posibles: `201 created`, `200 already_exists`, `400 validation_error`, `401 unauthorized`, `422 reference_not_found`, `500 database_error`.

## Deploy en Vercel

### 1. Conectar repositorio

Importa el repositorio en [vercel.com](https://vercel.com). Se auto-despliega en cada push a `master`.

### 2. Configurar variables de entorno

En Vercel → **Settings → Environment Variables**:

| Variable | Entorno |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Production |
| `POSTGRES_URL` | Production |
| `NEXT_PUBLIC_APP_URL` | Production |
| `CRON_SECRET` | Production |
| `BC_API_KEY` | Production |
| `GEMINI_API_KEY` | Production |

### 3. Cron job automático

`vercel.json` configura el cron diario a las **2:00 AM UTC**:

```json
{ "crons": [ { "path": "/api/cron/calculate-costs", "schedule": "0 2 * * *" } ] }
```

Vercel añade automáticamente la cabecera `Authorization: Bearer {CRON_SECRET}`.

### 4. Configurar Supabase para producción

En Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://tu-dominio.vercel.app`
- **Redirect URLs**: `https://tu-dominio.vercel.app/**`

## Scripts disponibles

```bash
npm run dev          # Servidor de desarrollo en localhost:3000
npm run build        # Build de producción
npm run start        # Servidor de producción (tras build)
npm run lint         # ESLint
npm run type-check   # TypeScript sin emitir archivos
```

## Arquitectura

La aplicación sigue el patrón **Repository → Service → Page**:

- **Repository**: acceso a datos, sin lógica de negocio. Operaciones CRUD tipadas contra Supabase.
- **Service**: lógica de negocio (validar stock, calcular costes, tramos de tarifa…). Devuelve `ServiceResult<T>`.
- **Page / Server Action**: orquesta llamadas al servicio, gestiona estado UI, muestra datos y errores vía toast.

Los datos están completamente tipados gracias a `types/database.types.ts`.

## Licencia

Privado — todos los derechos reservados.
