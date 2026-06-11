// ============================================================
// TABLA DE CONFIGURACIÓN
// ------------------------------------------------------------
// Tabla de tipo "Setup" (un único registro) donde el usuario
// guarda la URL base de la API y la clave de acceso (BC_API_KEY).
// Así NO hardcodeamos credenciales en el código.
//
// La clave de API se guarda en Isolated Storage (cifrado y
// aislado por extensión), no como un campo normal de la tabla,
// para que no sea visible en exportaciones ni en la base de datos.
// ============================================================
table 50100 "GALM API Setup"
{
    Caption = 'Configuración GestiPuertos';
    DataClassification = CustomerContent;

    fields
    {
        // Las tablas de tipo Setup usan siempre una clave primaria
        // vacía (Code[10] = '') para forzar que solo exista 1 registro.
        field(1; "Primary Key"; Code[10])
        {
            Caption = 'Clave primaria';
            DataClassification = SystemMetadata;
        }

        // URL base de la API, p.ej. https://gestion-almacenajes.vercel.app
        // OJO: sin barra final. Los endpoints se concatenan después
        // (ej. .../api/v1/inbound).
        field(2; "API Base URL"; Text[250])
        {
            Caption = 'URL base de la API';
            DataClassification = CustomerContent;

            trigger OnValidate()
            begin
                // Normalizamos quitando la barra final si el usuario la pone,
                // para evitar URLs con doble barra (//api/v1).
                if "API Base URL".EndsWith('/') then
                    "API Base URL" := CopyStr("API Base URL", 1, StrLen("API Base URL") - 1);
            end;
        }

        // Campo "virtual": no almacena el valor real, solo indica si
        // ya hay una clave guardada en Isolated Storage. Sirve para
        // mostrar en la página si está configurada o no.
        field(3; "Api Key Set"; Boolean)
        {
            Caption = 'Clave de API configurada';
            Editable = false;
            FieldClass = FlowField;
            CalcFormula = exist("GALM API Setup" where("Primary Key" = field("Primary Key")));
            // Nota: el cálculo real de "hay clave" se hace en código
            // (HasApiKey) porque Isolated Storage no es consultable por SQL.
        }
    }

    keys
    {
        key(PK; "Primary Key")
        {
            Clustered = true;
        }
    }

    // ------------------------------------------------------------
    // Clave usada para guardar/leer la BC_API_KEY en Isolated Storage.
    // ------------------------------------------------------------
    var
        ApiKeyStorageKey: Label 'GALM_API_KEY', Locked = true;

    // Asegura que el registro de setup exista (lo crea si falta).
    procedure GetSetup()
    begin
        if not Get() then begin
            Init();
            Insert();
        end;
    end;

    // Guarda la clave de API de forma segura (cifrada por extensión).
    procedure SetApiKey(NewKey: Text)
    begin
        if not IsolatedStorage.Set(ApiKeyStorageKey, NewKey, DataScope::Module) then
            Error('No se ha podido guardar la clave de API.');
    end;

    // Devuelve la clave de API guardada (cadena vacía si no hay).
    procedure GetApiKey(): Text
    var
        KeyValue: Text;
    begin
        if IsolatedStorage.Contains(ApiKeyStorageKey, DataScope::Module) then
            IsolatedStorage.Get(ApiKeyStorageKey, DataScope::Module, KeyValue);
        exit(KeyValue);
    end;

    // Indica si ya hay una clave configurada.
    procedure HasApiKey(): Boolean
    begin
        exit(IsolatedStorage.Contains(ApiKeyStorageKey, DataScope::Module));
    end;
}
