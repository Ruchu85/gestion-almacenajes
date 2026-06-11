// ============================================================
// PÁGINA DE CONFIGURACIÓN
// ------------------------------------------------------------
// Pantalla donde el usuario introduce la URL y la clave de API,
// y desde donde puede lanzar un "Probar conexión" (healthcheck).
//
// Búscala en BC por su nombre: "Configuración GestiPuertos".
// ============================================================
page 50100 "GALM API Setup"
{
    Caption = 'Configuración GestiPuertos';
    PageType = Card;
    ApplicationArea = All;
    UsageCategory = Administration;
    SourceTable = "GALM API Setup";
    InsertAllowed = false;
    DeleteAllowed = false;

    layout
    {
        area(Content)
        {
            group(Conexion)
            {
                Caption = 'Conexión con la API';

                field("API Base URL"; Rec."API Base URL")
                {
                    ApplicationArea = All;
                    ToolTip = 'URL base de la app, p.ej. https://gestion-almacenajes.vercel.app (sin barra final).';
                }

                // Campo NO ligado a la tabla: lo usamos solo para capturar
                // la clave que el usuario teclea y guardarla cifrada.
                // ExtendedDatatype = Masked oculta el texto al escribirlo.
                field(ApiKeyInput; ApiKeyInput)
                {
                    ApplicationArea = All;
                    Caption = 'Clave de API (BC_API_KEY)';
                    ExtendedDatatype = Masked;
                    ToolTip = 'Pega aquí la BC_API_KEY. Se guarda cifrada; no vuelve a mostrarse.';

                    trigger OnValidate()
                    begin
                        // En cuanto el usuario introduce un valor, lo
                        // persistimos en Isolated Storage y limpiamos la caja.
                        Rec.SetApiKey(ApiKeyInput);
                        Clear(ApiKeyInput);
                        CurrPage.Update(false);
                    end;
                }

                field(ApiKeyConfigured; Rec.HasApiKey())
                {
                    ApplicationArea = All;
                    Caption = 'Clave configurada';
                    Editable = false;
                    ToolTip = 'Indica si ya hay una clave de API guardada.';
                }
            }
        }
    }

    actions
    {
        area(Processing)
        {
            action(TestConnection)
            {
                ApplicationArea = All;
                Caption = 'Probar conexión';
                Image = Server;
                ToolTip = 'Llama al endpoint /api/v1/health para verificar URL y clave.';

                trigger OnAction()
                var
                    ApiClient: Codeunit "GALM API Client";
                begin
                    if ApiClient.TestConnection() then
                        Message('Conexión correcta. La API responde y la clave es válida.')
                    else
                        Error('No se ha podido conectar:\%1', ApiClient.GetLastError());
                end;
            }
        }
    }

    var
        // Variable temporal en memoria para teclear la clave.
        ApiKeyInput: Text;

    // Al abrir la página garantizamos que exista el registro único.
    trigger OnOpenPage()
    begin
        Rec.GetSetup();
        if not Rec.Get() then
            Rec.Insert();
    end;
}
