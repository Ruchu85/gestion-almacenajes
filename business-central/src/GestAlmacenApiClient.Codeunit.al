// ============================================================
// CLIENTE HTTP — GestAlmacén API
// ------------------------------------------------------------
// Codeunit que encapsula TODAS las llamadas a la API REST de la
// app de Gestión de Almacenajes. El resto de la extensión (o tus
// codeunits de negocio) solo deben llamar a los métodos públicos
// de aquí: TestConnection, UpsertProduct, SendInbound, etc.
//
// Patrón general de cada método:
//   1. Construir el JSON del cuerpo (JsonObject).
//   2. Llamar a SendRequest(método, ruta, cuerpo).
//   3. Interpretar el código de estado HTTP devuelto.
//
// IMPORTANTE (Business Central SaaS / Cloud):
//   Para que una extensión pueda hacer llamadas HTTP salientes,
//   un administrador debe activarlo en:
//   "Gestión de extensiones" → seleccionar la extensión →
//   "Configurar" → marcar "Permitir solicitudes HttpClient".
//   Sin esto, todas las llamadas fallan con un error de permisos.
// ============================================================
codeunit 50100 "GALM API Client"
{
    var
        // Guardamos aquí el último mensaje de error para que quien
        // llame pueda mostrarlo (ver GetLastError).
        LastErrorMsg: Text;

    // ------------------------------------------------------------
    // MÉTODO CENTRAL DE ENVÍO
    // ------------------------------------------------------------
    // Hace la llamada HTTP real. Devuelve TRUE si el código de estado
    // es 2xx. Rellena ResponseBody y StatusCode por referencia para
    // que el llamante pueda inspeccionar la respuesta.
    //
    // Parámetros:
    //   Method   - 'GET' o 'POST'
    //   Path     - ruta relativa, p.ej. '/api/v1/inbound'
    //   JsonBody - cuerpo en texto (vacío para GET)
    // ------------------------------------------------------------
    local procedure SendRequest(Method: Text; Path: Text; JsonBody: Text; var ResponseBody: Text; var StatusCode: Integer): Boolean
    var
        Setup: Record "GALM API Setup";
        Client: HttpClient;
        RequestMsg: HttpRequestMessage;
        ResponseMsg: HttpResponseMessage;
        RequestContent: HttpContent;
        ContentHeaders: HttpHeaders;
        Url: Text;
        ApiKey: Text;
    begin
        Clear(LastErrorMsg);

        // 1) Leer la configuración (URL + clave). Si falta, abortamos.
        Setup.GetSetup();
        if Setup."API Base URL" = '' then begin
            LastErrorMsg := 'Falta la URL base de la API en la configuración.';
            exit(false);
        end;
        ApiKey := Setup.GetApiKey();
        if ApiKey = '' then begin
            LastErrorMsg := 'Falta la clave de API en la configuración.';
            exit(false);
        end;

        // 2) Montar la URL completa = URL base + ruta del endpoint.
        Url := Setup."API Base URL" + Path;

        // 3) Configurar el método (GET/POST) y la URL de la petición.
        RequestMsg.Method := Method;
        RequestMsg.SetRequestUri(Url);

        // 4) Cabecera de autenticación. La API espera:
        //    Authorization: Bearer <BC_API_KEY>
        //    Se añade a las cabeceras por defecto del cliente.
        Client.DefaultRequestHeaders().Add('Authorization', 'Bearer ' + ApiKey);

        // 5) Si es POST, adjuntamos el cuerpo JSON.
        //    OJO: el Content-Type va en las cabeceras DEL CONTENIDO,
        //    no en las de la petición. Por eso hay que quitarlo y
        //    volverlo a poner sobre el HttpContent.
        if (Method = 'POST') and (JsonBody <> '') then begin
            RequestContent.WriteFrom(JsonBody);
            RequestContent.GetHeaders(ContentHeaders);
            if ContentHeaders.Contains('Content-Type') then
                ContentHeaders.Remove('Content-Type');
            ContentHeaders.Add('Content-Type', 'application/json');
            RequestMsg.Content := RequestContent;
        end;

        // 6) Enviar. Si Send falla (red, DNS, permisos HttpClient...)
        //    devuelve false y guardamos el motivo.
        if not Client.Send(RequestMsg, ResponseMsg) then begin
            LastErrorMsg := 'No se pudo enviar la petición (¿conexión o permisos HttpClient?).';
            exit(false);
        end;

        // 7) Leer el código de estado y el cuerpo de la respuesta.
        StatusCode := ResponseMsg.HttpStatusCode();
        ResponseMsg.Content().ReadAs(ResponseBody);

        // 8) Consideramos éxito cualquier 2xx (200 creado/actualizado,
        //    201 creado, etc.). El resto se trata como error y dejamos
        //    el detalle que devuelve la API en LastErrorMsg.
        if (StatusCode >= 200) and (StatusCode <= 299) then
            exit(true);

        LastErrorMsg := StrSubstNo('HTTP %1: %2', StatusCode, ResponseBody);
        exit(false);
    end;

    // ============================================================
    // HEALTHCHECK
    // ============================================================
    // GET /api/v1/health — verifica que la API responde y que la
    // clave es válida. Útil para el botón "Probar conexión".
    procedure TestConnection(): Boolean
    var
        ResponseBody: Text;
        StatusCode: Integer;
    begin
        exit(SendRequest('GET', '/api/v1/health', '', ResponseBody, StatusCode));
    end;

    // ============================================================
    // MAESTROS — PRODUCTOS / CLIENTES / PROVEEDORES
    // ------------------------------------------------------------
    // Son "upsert": si el código ya existe, la API actualiza; si no,
    // crea. Conviene enviar los maestros ANTES que los movimientos,
    // porque la entrada/salida los referencia por código y devuelve
    // 422 si no existen todavía.
    // ============================================================

    // POST /api/v1/products — clave de negocio: code
    procedure UpsertProduct(Code: Text; Name: Text; Unit: Text): Boolean
    var
        Body: JsonObject;
        ResponseBody: Text;
        StatusCode: Integer;
    begin
        Body.Add('code', Code);
        Body.Add('name', Name);
        Body.Add('unit', Unit);
        exit(SendRequest('POST', '/api/v1/products', JsonToText(Body), ResponseBody, StatusCode));
    end;

    // POST /api/v1/customers — clave de negocio: codigo
    procedure UpsertCustomer(Codigo: Text; Name: Text; TaxId: Text): Boolean
    var
        Body: JsonObject;
        ResponseBody: Text;
        StatusCode: Integer;
    begin
        Body.Add('codigo', Codigo);
        Body.Add('name', Name);
        // tax_id es opcional: solo lo enviamos si hay valor.
        if TaxId <> '' then
            Body.Add('tax_id', TaxId);
        exit(SendRequest('POST', '/api/v1/customers', JsonToText(Body), ResponseBody, StatusCode));
    end;

    // POST /api/v1/suppliers — clave de negocio: codigo
    procedure UpsertSupplier(Codigo: Text; Name: Text; TaxId: Text): Boolean
    var
        Body: JsonObject;
        ResponseBody: Text;
        StatusCode: Integer;
    begin
        Body.Add('codigo', Codigo);
        Body.Add('name', Name);
        if TaxId <> '' then
            Body.Add('tax_id', TaxId);
        exit(SendRequest('POST', '/api/v1/suppliers', JsonToText(Body), ResponseBody, StatusCode));
    end;

    // ============================================================
    // MOVIMIENTOS — ENTRADAS / SALIDAS / PUESTAS
    // ------------------------------------------------------------
    // Son idempotentes por su número de albarán/puesta: si reenvías
    // el mismo, la API responde 200 "already_exists" sin duplicar.
    // ============================================================

    // POST /api/v1/inbound — clave idempotencia: numero_albaran
    procedure SendInbound(NumeroAlbaran: Text; WarehouseCode: Text; ProductCode: Text; SupplierCode: Text; Quantity: Decimal; MovementDate: Date; FreeDays: Integer; Comments: Text): Boolean
    var
        Body: JsonObject;
        ResponseBody: Text;
        StatusCode: Integer;
    begin
        Body.Add('numero_albaran', NumeroAlbaran);
        Body.Add('warehouse_code', WarehouseCode);
        Body.Add('product_code', ProductCode);
        if SupplierCode <> '' then
            Body.Add('supplier_code', SupplierCode);
        // Al añadir un Decimal, AL lo serializa con punto decimal
        // (formato JSON correcto), independientemente del idioma de BC.
        Body.Add('quantity', Quantity);
        Body.Add('movement_date', FormatDate(MovementDate));
        Body.Add('free_days', FreeDays);
        if Comments <> '' then
            Body.Add('comments', Comments);
        exit(SendRequest('POST', '/api/v1/inbound', JsonToText(Body), ResponseBody, StatusCode));
    end;

    // POST /api/v1/outbound — clave idempotencia: numero_albaran
    procedure SendOutbound(NumeroAlbaran: Text; WarehouseCode: Text; ProductCode: Text; CustomerCode: Text; Quantity: Decimal; MovementDate: Date; FreeDays: Integer; Comments: Text): Boolean
    var
        Body: JsonObject;
        ResponseBody: Text;
        StatusCode: Integer;
    begin
        Body.Add('numero_albaran', NumeroAlbaran);
        Body.Add('warehouse_code', WarehouseCode);
        Body.Add('product_code', ProductCode);
        if CustomerCode <> '' then
            Body.Add('customer_code', CustomerCode);
        Body.Add('quantity', Quantity);
        Body.Add('movement_date', FormatDate(MovementDate));
        Body.Add('free_days', FreeDays);
        if Comments <> '' then
            Body.Add('comments', Comments);
        exit(SendRequest('POST', '/api/v1/outbound', JsonToText(Body), ResponseBody, StatusCode));
    end;

    // POST /api/v1/puestas — clave idempotencia: numero_puesta
    procedure SendPuesta(NumeroPuesta: Text; WarehouseCode: Text; ProductCode: Text; CustomerCode: Text; CantidadInicial: Decimal; FechaPuesta: Date; DiasPlancha: Integer; Comentarios: Text): Boolean
    var
        Body: JsonObject;
        ResponseBody: Text;
        StatusCode: Integer;
    begin
        Body.Add('numero_puesta', NumeroPuesta);
        Body.Add('warehouse_code', WarehouseCode);
        Body.Add('product_code', ProductCode);
        if CustomerCode <> '' then
            Body.Add('customer_code', CustomerCode);
        Body.Add('cantidad_inicial', CantidadInicial);
        Body.Add('fecha_puesta', FormatDate(FechaPuesta));
        Body.Add('dias_plancha', DiasPlancha);
        if Comentarios <> '' then
            Body.Add('comentarios', Comentarios);
        exit(SendRequest('POST', '/api/v1/puestas', JsonToText(Body), ResponseBody, StatusCode));
    end;

    // ============================================================
    // HELPERS
    // ============================================================

    // Serializa un JsonObject a texto.
    local procedure JsonToText(JsonObj: JsonObject): Text
    var
        Result: Text;
    begin
        JsonObj.WriteTo(Result);
        exit(Result);
    end;

    // Formatea una fecha al patrón que exige la API: YYYY-MM-DD.
    // Usamos un formato explícito para que NO dependa del idioma/región
    // del usuario de BC (que podría dar DD/MM/YYYY).
    local procedure FormatDate(D: Date): Text
    begin
        exit(Format(D, 0, '<Year4>-<Month,2>-<Day,2>'));
    end;

    // Devuelve el último error registrado (para mostrarlo en pantalla).
    procedure GetLastError(): Text
    begin
        exit(LastErrorMsg);
    end;
}
