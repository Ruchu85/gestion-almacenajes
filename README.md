# Gestión de Almacenajes

SaaS para la gestión integral de costes de almacenaje, movimientos de mercancía y análisis en tiempo real.

## Características

- **Dashboard** con KPIs en tiempo real: coste hoy/mes/año, stock pendiente, movimientos
- **Almacenes y productos** — CRUD completo con tarifas de almacenaje por unidad/día
- **Entradas de mercancía** — registro con proveedor, días de plancha y cálculo automático de inicio de costes
- **Salidas de mercancía** — registro con cliente y validación de stock disponible
- **Costes de almacenaje** — generación automática diaria vía cron, recálculo manual por rango de fechas
- **Exportación** — CSV y Excel en todas las secciones, PDF en informes
- **Autenticación** — login con email/contraseña, roles admin/user, RLS en todas las tablas
- **Modo oscuro** — toggle en el header, persistido por `next-themes`

## Regla de negocio: días de plancha

Los **días de plancha** (`free_days`) son los días desde la entrada en los que **no** se genera coste. El coste empieza a correr el día `free_days + 1` desde la fecha de entrada.

Ejemplo: entrada el 1 de enero con 3 días de plancha → el coste comienza el 5 de enero.

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15.1.4 (App Router) |
| UI | React 19, TailwindCSS 3, shadcn/ui |
| Tablas | TanStack Table v8 |
| Gráficas | Recharts 2 |
| Formularios | React Hook Form + Zod |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth + @supabase/ssr |
| ORM | Supabase JS client (tipado con Database types) |
| Exportación | xlsx (Excel), jspdf (PDF) |
| Deploy | Vercel |

## Estructura del proyecto

```
├── app/
│   ├── (auth)/login/          # Página de login
│   ├── (dashboard)/           # Área protegida
│   │   ├── layout.tsx         # Layout principal con sidebar
│   │   ├── dashboard/         # Dashboard con KPIs y gráficas
│   │   ├── warehouses/        # CRUD almacenes
│   │   ├── products/          # CRUD productos
│   │   ├── suppliers/         # CRUD proveedores
│   │   ├── customers/         # CRUD clientes
│   │   ├── movements/
│   │   │   ├── inbound/       # Entradas de mercancía
│   │   │   └── outbound/      # Salidas de mercancía
│   │   └── storage-costs/     # Costes de almacenaje
│   └── api/
│       ├── cron/calculate-costs/  # Cron job diario (Vercel)
│       └── storage-costs/recalculate/  # Recálculo manual
├── components/
│   ├── layout/                # Sidebar, Header, Providers
│   ├── shared/                # DataTable, PageHeader, EmptyState, StatsCard…
│   └── ui/                    # shadcn/ui primitivos
├── modules/                   # Columnas y formularios por módulo
│   ├── warehouses/
│   ├── products/
│   ├── suppliers/
│   ├── customers/
│   ├── movements/
│   └── storage-costs/
├── repositories/              # Capa de acceso a datos (patrón Repository)
├── services/                  # Lógica de negocio
├── lib/supabase/              # Clientes browser/server/middleware
├── types/                     # Tipos de dominio y helpers de DB
├── utils/                     # format, export, calculations
├── validations/               # Esquemas Zod
└── supabase/migrations/       # SQL completo del esquema
```

## Variables de entorno

Crea un archivo `.env.local` en la raíz con:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key

# Solo para API routes que necesitan bypassear RLS
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# URL pública de la app
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Secret para el cron job de Vercel
CRON_SECRET=genera-un-secret-aleatorio-largo
```

## Configuración de Supabase

### 1. Crear proyecto

1. Ve a [supabase.com](https://supabase.com) y crea un nuevo proyecto
2. Copia la URL y las claves desde **Project Settings → API**

### 2. Ejecutar migraciones

En el **SQL Editor** de Supabase, ejecuta el archivo completo:

```
supabase/migrations/001_initial_schema.sql
```

Este script crea:
- Tablas: `warehouses`, `products`, `suppliers`, `customers`, `inbound_movements`, `outbound_movements`, `storage_costs`, `user_profiles`
- Funciones almacenadas: `calculate_storage_costs_for_date`, `recalculate_storage_costs`, `get_stock_summary`, `get_dashboard_kpis`, `get_monthly_cost_evolution`
- Triggers: `update_updated_at_column` en todas las tablas, `handle_new_user` para crear perfil automático al registrarse
- Políticas RLS en todas las tablas
- Datos de ejemplo (3 almacenes, 5 productos, 3 proveedores, 3 clientes)

### 3. Configurar autenticación

En Supabase → **Authentication → Settings**:
- Deshabilita **Enable email confirmations** para desarrollo
- Configura **Site URL** con tu dominio de producción

### 4. Crear primer usuario administrador

Ejecuta en SQL Editor después de registrarte:

```sql
UPDATE user_profiles
SET role = 'admin'
WHERE id = 'tu-user-id';
```

## Instalación y desarrollo local

```bash
# Clonar e instalar dependencias
npm install

# Configurar variables de entorno
cp .env.local.example .env.local
# Edita .env.local con tus claves de Supabase

# Iniciar servidor de desarrollo
npm run dev
```

La app estará disponible en [http://localhost:3000](http://localhost:3000).

## Deploy en Vercel

### 1. Conectar repositorio

1. Sube el proyecto a GitHub/GitLab
2. Importa el repositorio en [vercel.com](https://vercel.com)

### 2. Configurar variables de entorno

En Vercel → **Settings → Environment Variables**, añade:

| Variable | Entorno |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Production |
| `NEXT_PUBLIC_APP_URL` | Production (URL de tu dominio) |
| `CRON_SECRET` | Production |

### 3. Cron job automático

El archivo `vercel.json` configura el cron para ejecutarse a las **2:00 AM UTC** todos los días:

```json
{
  "crons": [
    {
      "path": "/api/cron/calculate-costs",
      "schedule": "0 2 * * *"
    }
  ]
}
```

El cron job llama al endpoint con la cabecera `Authorization: Bearer {CRON_SECRET}`. Vercel añade esta cabecera automáticamente.

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
- **Service**: lógica de negocio (ej: validar stock antes de registrar una salida, calcular costes). Devuelve `ServiceResult<T>` con `data` y `error`.
- **Page (Client Component)**: orquesta llamadas al servicio, gestiona estado UI, muestra datos y errores vía toast.

Los datos de la base de datos están completamente tipados gracias a `types/database.types.ts`, generado a partir del esquema de Supabase.

## Licencia

Privado — todos los derechos reservados.
