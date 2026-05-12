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
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          address?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          address?: string | null;
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
          tax_id: string | null;
          comments: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          tax_id?: string | null;
          comments?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
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
          tax_id: string | null;
          comments: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          tax_id?: string | null;
          comments?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
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
