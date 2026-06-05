// ============================================================
// EJEMPLOS DE USO
// ------------------------------------------------------------
// Codeunit de demostración: muestra CÓMO llamar al cliente desde
// tu lógica de negocio. NO se ejecuta solo; copia estos patrones
// en tus propios procesos (p.ej. al registrar un albarán de compra
// o de venta en BC).
//
// Para probar rápido: ejecuta la acción de la página de setup o
// invoca estos métodos desde una página/acción temporal.
// ============================================================
codeunit 50101 "GALM Usage Example"
{
    // ------------------------------------------------------------
    // EJEMPLO 1 — Sincronizar un producto y enviar una entrada.
    // ------------------------------------------------------------
    procedure EjemploEntradaCompleta()
    var
        ApiClient: Codeunit "GALM API Client";
    begin
        // PASO 1: asegurarnos de que el producto existe en la app.
        // (upsert: crea o actualiza). Si ya lo sincronizas en otro
        // proceso, este paso puede omitirse.
        if not ApiClient.UpsertProduct('051000', 'MAÍZ', 'TNS') then
            Error('Error al sincronizar producto:\%1', ApiClient.GetLastError());

        // PASO 2 (opcional): asegurar el proveedor.
        if not ApiClient.UpsertSupplier('PROV001', 'Cereales del Sur S.A.', 'A87654321') then
            Error('Error al sincronizar proveedor:\%1', ApiClient.GetLastError());

        // PASO 3: enviar la entrada de mercancía.
        // numero_albaran es la clave: reenviarlo NO duplica.
        if ApiClient.SendInbound(
            'ALB-2024-001',  // numero_albaran
            'CN',            // warehouse_code (debe existir en la app)
            '051000',        // product_code
            'PROV001',       // supplier_code (opcional: '' si no aplica)
            100.5,           // quantity
            Today(),         // movement_date
            0,               // free_days (días de plancha)
            'Entrada desde BC') // comments (opcional)
        then
            Message('Entrada enviada correctamente.')
        else
            Error('Error al enviar entrada:\%1', ApiClient.GetLastError());
    end;

    // ------------------------------------------------------------
    // EJEMPLO 2 — Enviar una salida de mercancía.
    // ------------------------------------------------------------
    procedure EjemploSalida()
    var
        ApiClient: Codeunit "GALM API Client";
    begin
        if ApiClient.SendOutbound(
            'ALB-SAL-2024-001', // numero_albaran
            'CN',               // warehouse_code
            '051000',           // product_code
            'CLI001',           // customer_code (opcional)
            50.0,               // quantity
            Today(),            // movement_date
            0,                  // free_days
            '')                 // comments
        then
            Message('Salida enviada correctamente.')
        else
            Error('Error al enviar salida:\%1', ApiClient.GetLastError());
    end;

    // ------------------------------------------------------------
    // EJEMPLO 3 — Crear una puesta a disposición.
    // ------------------------------------------------------------
    procedure EjemploPuesta()
    var
        ApiClient: Codeunit "GALM API Client";
    begin
        if ApiClient.SendPuesta(
            'D02600235_40-1', // numero_puesta
            'CN',             // warehouse_code
            '051000',         // product_code
            'CLI001',         // customer_code (opcional)
            150.0,            // cantidad_inicial
            Today(),          // fecha_puesta
            3,                // dias_plancha
            'Contrato anual') // comentarios (opcional)
        then
            Message('Puesta a disposición creada.')
        else
            Error('Error al crear puesta:\%1', ApiClient.GetLastError());
    end;
}
