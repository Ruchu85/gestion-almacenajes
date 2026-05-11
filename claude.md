# PROJECT CONTEXT

Este proyecto es una aplicación SaaS profesional para gestión de costes de almacenaje de mercancías.

La aplicación debe desarrollarse completamente desde cero y quedar lista para producción.

---

# OBJETIVO DE NEGOCIO

La aplicación debe permitir gestionar:

- Entradas de mercancía
- Salidas de mercancía
- Costes automáticos de almacenaje
- Control de stock pendiente
- Trazabilidad completa
- Gestión de almacenes
- Gestión de productos
- Gestión de proveedores/clientes
- Dashboard de costes y métricas

---

# STACK TECNOLÓGICO OBLIGATORIO

## Frontend
- Next.js App Router
- React
- TypeScript
- TailwindCSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Table
- Recharts

## Backend
- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security

## Deploy
- Vercel

---

# PRINCIPIOS DE DESARROLLO

Todo el código debe ser:

- Profesional
- Escalable
- Mantenible
- Modular
- Bien tipado
- Production-ready
- Responsive
- Clean architecture
- SOLID principles

Nunca generar:
- Código simplificado
- Mockups incompletos
- Pseudocódigo
- TODOs sin implementar
- Componentes vacíos

---

# ESTRUCTURA OBLIGATORIA

Usar arquitectura modular:

/app
/components
/modules
/services
/repositories
/lib
/hooks
/types
/validations
/utils

Separar claramente:
- lógica de negocio
- acceso a datos
- UI
- validaciones
- cálculos

---

# DISEÑO UI

La interfaz debe parecer un SaaS moderno tipo:
- Stripe
- Linear
- Notion
- Vercel Dashboard

Requisitos:
- responsive
- dark mode
- tablas avanzadas
- dashboard moderno
- UX limpia

---

# REGLA PRINCIPAL DE NEGOCIO

Los "días de plancha" son días SIN generar almacenajes.

A partir del día siguiente:
- se generan costes diarios automáticamente.

Fórmula:

coste_diario = cantidad_pendiente * precio_almacenaje_diario

---

# ENTIDADES PRINCIPALES

## warehouses
- id
- code
- name
- address
- active

## products
- id
- code
- name
- storage_daily_price
- unit
- active

## suppliers
- id
- name
- tax_id
- comments
- active

## customers
- id
- name
- tax_id
- comments
- active

## inbound_movements
- id
- warehouse_id
- product_id
- supplier_id
- quantity
- movement_date
- free_days
- comments

## outbound_movements
- id
- warehouse_id
- product_id
- customer_id
- quantity
- movement_date
- free_days
- comments

## storage_costs
Tabla generada automáticamente para persistir costes diarios.

---

# FUNCIONALIDADES OBLIGATORIAS

## Gestión completa CRUD
- almacenes
- productos
- proveedores
- clientes

## Movimientos
- entradas
- salidas

## Dashboard
- KPIs
- gráficas
- evolución de costes

## Filtros
- fechas
- producto
- almacén
- proveedor
- cliente

## Exportaciones
- CSV
- Excel
- PDF básico

---

# AUTENTICACIÓN

Implementar:
- login
- logout
- protected routes
- roles:
  - admin
  - user

---

# BASE DE DATOS

Claude debe:
- generar SQL completo
- generar migraciones
- usar índices
- usar foreign keys
- usar constraints
- usar RLS
- optimizar consultas

---

# CÁLCULO DE ALMACENAJES

El sistema debe:

- calcular almacenajes diarios automáticamente
- permitir recalcular históricos
- evitar duplicados
- mantener integridad de datos

La lógica debe estar desacoplada del frontend.

---

# CALIDAD DE CÓDIGO

Obligatorio:
- TypeScript estricto
- Zod validations
- error boundaries
- loading states
- empty states
- manejo robusto de errores

---

# OUTPUT ESPERADO

Claude debe generar:
- archivos completos
- código completo
- componentes completos
- SQL completo
- README profesional
- configuración Vercel
- variables entorno
- instrucciones despliegue

Nunca resumir implementaciones.
Siempre generar código real completo.