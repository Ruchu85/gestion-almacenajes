# GestiPuertos Connector — Extensión de Business Central

Extensión AL de ejemplo que conecta Microsoft Dynamics 365 Business Central con la API REST de la app **Gestión de Almacenajes** (`/api/v1/*`).

Envía maestros (productos, clientes, proveedores) y movimientos (entradas, salidas, puestas a disposición) desde BC a la app.

## Contenido

| Archivo | Objeto | Descripción |
|---------|--------|-------------|
| `app.json` | — | Manifiesto de la extensión |
| `src/GestAlmacenSetup.Table.al` | Tabla 50100 | Configuración (URL + clave en Isolated Storage) |
| `src/GestAlmacenSetup.Page.al` | Página 50100 | Pantalla de configuración + "Probar conexión" |
| `src/GestAlmacenApiClient.Codeunit.al` | Codeunit 50100 | Cliente HTTP — todas las llamadas a la API |
| `src/GestAlmacenUsageExample.Codeunit.al` | Codeunit 50101 | Ejemplos de uso |

> **Rango de IDs:** 50100–50149 (rango libre para extensiones per-tenant). Ajústalo en `app.json` si tu entorno usa otro rango.

## Requisitos

- **VS Code** + extensión **AL Language** (Microsoft).
- Acceso a un entorno de **Business Central** (Cloud/SaaS o On-Premise) v24 o superior.
  - Si tu entorno es anterior, baja `platform`, `application` y `runtime` en `app.json`.
- La **`BC_API_KEY`** que está configurada en Vercel (la misma que valida la API).

## Instalación

1. Abre la carpeta `business-central/` en VS Code.
2. `Ctrl+Shift+P` → **AL: Download symbols** (descarga los símbolos de tu entorno).
3. Edita `publisher` en `app.json` con el nombre de tu empresa.
4. `Ctrl+F5` (o **AL: Publish**) para compilar y publicar en tu entorno.

## Configuración (una sola vez)

1. En BC, busca la página **"Configuración GestiPuertos"**.
2. Rellena:
   - **URL base de la API**: `https://gestion-almacenajes.vercel.app` (sin barra final).
   - **Clave de API (BC_API_KEY)**: pega la clave. Se guarda **cifrada** en Isolated Storage y no vuelve a mostrarse.
3. Pulsa **"Probar conexión"**. Debe decir *"Conexión correcta"*.

> ⚠️ **Business Central SaaS:** para permitir llamadas HTTP salientes, un administrador debe ir a **Gestión de extensiones → (seleccionar la extensión) → Configurar → marcar "Permitir solicitudes HttpClient"**. Sin esto, todas las llamadas fallan.

## Uso desde tu código

Inyecta el cliente y llama a sus métodos. Devuelven `Boolean` (true = éxito); en caso de error usa `GetLastError()` para el detalle.

```al
var
    ApiClient: Codeunit "GALM API Client";
begin
    if ApiClient.SendInbound('ALB-2024-001', 'CN', '051000', 'PROV001',
                             100.5, Today(), 0, 'Entrada desde BC')
    then
        Message('OK')
    else
        Error(ApiClient.GetLastError());
end;
```

Métodos disponibles:

| Método | Endpoint | Notas |
|--------|----------|-------|
| `TestConnection()` | `GET /health` | Verifica URL + clave |
| `UpsertProduct(code, name, unit)` | `POST /products` | Upsert por `code` |
| `UpsertCustomer(codigo, name, taxId)` | `POST /customers` | Upsert por `codigo` |
| `UpsertSupplier(codigo, name, taxId)` | `POST /suppliers` | Upsert por `codigo` |
| `SendInbound(...)` | `POST /inbound` | Idempotente por `numero_albaran` |
| `SendOutbound(...)` | `POST /outbound` | Idempotente por `numero_albaran` |
| `SendPuesta(...)` | `POST /puestas` | Idempotente por `numero_puesta` |

## Notas importantes

- **Orden:** envía primero los maestros (producto/cliente/proveedor) y luego los movimientos. La API devuelve `422 reference_not_found` si el código referenciado no existe aún.
- **Idempotencia:** reenviar un movimiento con el mismo número de albarán/puesta **no** crea duplicados (responde `already_exists`).
- **Formatos:** las fechas se envían como `YYYY-MM-DD` y los decimales con punto, generados de forma invariante al idioma de BC (ver helpers del codeunit).
- **Dónde enganchar:** lo natural es llamar a estos métodos desde *event subscribers* del registro de albaranes de compra/venta de BC, para sincronizar automáticamente al registrar. Esos suscriptores no se incluyen aquí porque dependen de tu configuración concreta de BC.

## Integración automática (siguiente paso sugerido)

Para sincronizar sin intervención manual, crea un codeunit con suscriptores a los eventos de registro de BC, por ejemplo:

- `OnAfterPostPurchaseDoc` (codeunit 90) → llamar a `SendInbound`.
- `OnAfterPostSalesDoc` (codeunit 80) → llamar a `SendOutbound`.

Dime y te lo genero adaptado a tus documentos.
