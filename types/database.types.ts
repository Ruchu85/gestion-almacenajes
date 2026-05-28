export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      warehouses: {
        Row: {
          id: string;
          code: string;
          name: string;
          address: string | null;
          posicion_cerrada: string | null;
          storage_daily_price: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          address?: string | null;
          posicion_cerrada?: string | null;
          storage_daily_price?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          address?: string | null;
          posicion_cerrada?: string | null;
          storage_daily_price?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          code: string;
          name: string;
          storage_daily_price: number;
          unit: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          storage_daily_price?: number;
          unit?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          storage_daily_price?: number;
          unit?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          codigo: string | null;
          tax_id: string | null;
          comments: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          codigo?: string | null;
          tax_id?: string | null;
          comments?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          codigo?: string | null;
          tax_id?: string | null;
          comments?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          codigo: string | null;
          tax_id: string | null;
          comments: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          codigo?: string | null;
          tax_id?: string | null;
          comments?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          codigo?: string | null;
          tax_id?: string | null;
          comments?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: "admin" | "user";
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: "admin" | "user";
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: "admin" | "user";
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inbound_movements: {
        Row: {
          id: string;
          warehouse_id: string;
          product_id: string;
          supplier_id: string | null;
          quantity: number;
          movement_date: string;
          free_days: number;
          comments: string | null;
          numero_albaran: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          warehouse_id: string;
          product_id: string;
          supplier_id?: string | null;
          quantity: number;
          movement_date: string;
          free_days?: number;
          comments?: string | null;
          numero_albaran?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          warehouse_id?: string;
          product_id?: string;
          supplier_id?: string | null;
          quantity?: number;
          movement_date?: string;
          free_days?: number;
          comments?: string | null;
          numero_albaran?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inbound_movements_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inbound_movements_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          }
        ];
      };
      outbound_movements: {
        Row: {
          id: string;
          warehouse_id: string;
          product_id: string;
          customer_id: string | null;
          quantity: number;
          movement_date: string;
          free_days: number;
          comments: string | null;
          numero_albaran: string | null;
          matricula: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          warehouse_id: string;
          product_id: string;
          customer_id?: string | null;
          quantity: number;
          movement_date: string;
          free_days?: number;
          comments?: string | null;
          numero_albaran?: string | null;
          matricula?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          warehouse_id?: string;
          product_id?: string;
          customer_id?: string | null;
          quantity?: number;
          movement_date?: string;
          free_days?: number;
          comments?: string | null;
          numero_albaran?: string | null;
          matricula?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbound_movements_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbound_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbound_movements_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          }
        ];
      };
      matriculas: {
        Row: {
          id: string;
          value: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          value: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          value?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tarifa_tramos: {
        Row: {
          id: string;
          product_id: string;
          dias_desde: number;
          dias_hasta: number | null;
          precio_diario: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          dias_desde: number;
          dias_hasta?: number | null;
          precio_diario: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          dias_desde?: number;
          dias_hasta?: number | null;
          precio_diario?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tarifa_tramos_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      puestas_a_disposicion: {
        Row: {
          id: string;
          numero_contrato: string | null;
          customer_id: string | null;
          product_id: string;
          warehouse_id: string;
          cantidad_inicial: number;
          fecha_puesta: string;
          dias_plancha: number;
          fecha_fin_plancha: string;
          estado: "abierta" | "finalizada" | "cerrada_manual";
          comentarios: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          numero_contrato?: string | null;
          customer_id?: string | null;
          product_id: string;
          warehouse_id: string;
          cantidad_inicial: number;
          fecha_puesta: string;
          dias_plancha?: number;
          estado?: "abierta" | "finalizada" | "cerrada_manual";
          comentarios?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          numero_contrato?: string | null;
          customer_id?: string | null;
          product_id?: string;
          warehouse_id?: string;
          cantidad_inicial?: number;
          fecha_puesta?: string;
          dias_plancha?: number;
          estado?: "abierta" | "finalizada" | "cerrada_manual";
          comentarios?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "puestas_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "puestas_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "puestas_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          }
        ];
      };
      salidas_parciales: {
        Row: {
          id: string;
          puesta_id: string;
          fecha_salida: string;
          n_camion: string | null;
          matricula: string | null;
          cantidad: number;
          tipo: "real" | "plancha" | "desaplicacion";
          comentarios: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          puesta_id: string;
          fecha_salida: string;
          n_camion?: string | null;
          matricula?: string | null;
          cantidad: number;
          tipo?: "real" | "plancha" | "desaplicacion";
          comentarios?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          puesta_id?: string;
          fecha_salida?: string;
          n_camion?: string | null;
          matricula?: string | null;
          cantidad?: number;
          tipo?: "real" | "plancha" | "desaplicacion";
          comentarios?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "salidas_parciales_puesta_id_fkey";
            columns: ["puesta_id"];
            isOneToOne: false;
            referencedRelation: "puestas_a_disposicion";
            referencedColumns: ["id"];
          }
        ];
      };
      monthly_invoices: {
        Row: {
          id: string;
          warehouse_id: string;
          product_id: string;
          year_month: string;
          invoice_amount: number | null;
          invoice_ref: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          warehouse_id: string;
          product_id: string;
          year_month: string;
          invoice_amount?: number | null;
          invoice_ref?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          warehouse_id?: string;
          product_id?: string;
          year_month?: string;
          invoice_amount?: number | null;
          invoice_ref?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      puesta_facturacion_meses: {
        Row: {
          id: string;
          puesta_id: string;
          year_month: string;
          invoiced_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          puesta_id: string;
          year_month: string;
          invoiced_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          puesta_id?: string;
          year_month?: string;
          invoiced_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "puesta_facturacion_meses_puesta_id_fkey";
            columns: ["puesta_id"];
            isOneToOne: false;
            referencedRelation: "puestas_a_disposicion";
            referencedColumns: ["id"];
          }
        ];
      };
      storage_costs: {
        Row: {
          id: string;
          warehouse_id: string;
          product_id: string;
          cost_date: string;
          pending_quantity: number;
          daily_price: number;
          total_cost: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          warehouse_id: string;
          product_id: string;
          cost_date: string;
          pending_quantity?: number;
          daily_price?: number;
          total_cost?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          warehouse_id?: string;
          product_id?: string;
          cost_date?: string;
          pending_quantity?: number;
          daily_price?: number;
          total_cost?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storage_costs_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "warehouses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "storage_costs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      calculate_storage_costs_for_date: {
        Args: { target_date: string };
        Returns: {
          p_warehouse_id: string;
          p_product_id: string;
          p_cost_date: string;
          p_pending_qty: number;
          p_daily_price: number;
          p_total_cost: number;
        }[];
      };
      recalculate_storage_costs: {
        Args: { p_start_date: string; p_end_date: string };
        Returns: number;
      };
      get_stock_summary: {
        Args: Record<string, never>;
        Returns: {
          warehouse_id: string;
          warehouse_name: string;
          product_id: string;
          product_name: string;
          product_code: string;
          unit: string;
          total_inbound: number;
          total_outbound: number;
          pending_stock: number;
          daily_price: number;
          daily_cost: number;
        }[];
      };
      get_dashboard_kpis: {
        Args: { p_date?: string };
        Returns: {
          total_cost_today: number;
          total_cost_month: number;
          total_cost_year: number;
          active_warehouses: number;
          active_products: number;
          pending_stock_units: number;
          inbound_month: number;
          outbound_month: number;
        }[];
      };
      get_monthly_cost_evolution: {
        Args: { p_months?: number };
        Returns: { month: string; total_cost: number }[];
      };
      get_tarifa_for_puesta_day: {
        Args: { p_product_id: string; p_warehouse_id: string; p_dias_activos: number };
        Returns: number;
      };
      get_puesta_daily_breakdown: {
        Args: {
          p_puesta_id: string;
          p_fecha_inicio?: string | null;
          p_fecha_fin?: string;
        };
        Returns: {
          dia: string;
          dias_activos: number;
          cantidad_pendiente: number;
          tarifa_diaria: number;
          coste_dia: number;
        }[];
      };
      get_puesta_summary: {
        Args: { p_puesta_id: string; p_fecha?: string };
        Returns: {
          puesta_id: string;
          numero_contrato: string;
          customer_name: string;
          product_name: string;
          product_code: string;
          unit: string;
          warehouse_name: string;
          cantidad_inicial: number;
          cantidad_salida: number;
          cantidad_pendiente: number;
          cantidad_fisica_pendiente: number;
          fecha_puesta: string;
          dias_plancha: number;
          fecha_fin_plancha: string;
          dias_activos: number;
          coste_acumulado: number;
          estado: string;
          created_at: string;
        }[];
      };
      get_all_puestas_summary: {
        Args: { p_fecha?: string };
        Returns: {
          puesta_id: string;
          numero_contrato: string;
          customer_name: string;
          product_name: string;
          product_code: string;
          unit: string;
          warehouse_name: string;
          cantidad_inicial: number;
          cantidad_salida: number;
          cantidad_pendiente: number;
          cantidad_fisica_pendiente: number;
          fecha_puesta: string;
          dias_plancha: number;
          fecha_fin_plancha: string;
          dias_activos: number;
          coste_acumulado: number;
          estado: string;
          created_at: string;
        }[];
      };
      create_plancha_auto_exit: {
        Args: { p_puesta_id: string };
        Returns: void;
      };
    };
    Enums: {
      user_role: "admin" | "user";
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
