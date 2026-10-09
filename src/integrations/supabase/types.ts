export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_allowed_users: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          id: string
          match_key: string
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_key?: string
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          match_key?: string
          name?: string
          sort_order?: number
          user_id?: string | null
        }
        Relationships: []
      }
      counter_note_items: {
        Row: {
          created_at: string
          id: string
          model_id: string | null
          note_id: string
          qty: number
          size: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          model_id?: string | null
          note_id: string
          qty?: number
          size?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string | null
          note_id?: string
          qty?: number
          size?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "counter_note_items_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "resale_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_note_items_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "counter_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_notes: {
        Row: {
          created_at: string
          cycle_id: string | null
          doc: string
          id: string
          note_date: string
          status: string
          supplier: string
        }
        Insert: {
          created_at?: string
          cycle_id?: string | null
          doc?: string
          id?: string
          note_date?: string
          status?: string
          supplier?: string
        }
        Update: {
          created_at?: string
          cycle_id?: string | null
          doc?: string
          id?: string
          note_date?: string
          status?: string
          supplier?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_notes_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "resale_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      fabric_moves: {
        Row: {
          company_id: string
          created_at: string
          doc: string
          id: string
          kg: number
          kind: string
          moved_on: string
          note: string
          period_id: string | null
          shipment_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          doc?: string
          id?: string
          kg?: number
          kind?: string
          moved_on?: string
          note?: string
          period_id?: string | null
          shipment_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          doc?: string
          id?: string
          kg?: number
          kind?: string
          moved_on?: string
          note?: string
          period_id?: string | null
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabric_moves_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_moves_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabric_moves_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      factories: {
        Row: {
          created_at: string
          id: string
          monthly_limit: number
          name: string
          sort_order: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_limit?: number
          name: string
          sort_order?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          monthly_limit?: number
          name?: string
          sort_order?: number
          user_id?: string | null
        }
        Relationships: []
      }
      periods: {
        Row: {
          closed_at: string | null
          created_at: string
          fabric_price_per_kg: number
          id: string
          label: string
          reference_label: string
          reopened_at: string | null
          user_id: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          fabric_price_per_kg?: number
          id?: string
          label: string
          reference_label?: string
          reopened_at?: string | null
          user_id?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          fabric_price_per_kg?: number
          id?: string
          label?: string
          reference_label?: string
          reopened_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      product_groups: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          sort_order: number
          unit_price: number | null
          user_id: string | null
          yield_per_kg: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          sort_order?: number
          unit_price?: number | null
          user_id?: string | null
          yield_per_kg?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          sort_order?: number
          unit_price?: number | null
          user_id?: string | null
          yield_per_kg?: number | null
        }
        Relationships: []
      }
      resale_code_map: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          is_own: boolean
          last_description: string
          model_id: string | null
          own_group: string
          size: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_own?: boolean
          last_description?: string
          model_id?: string | null
          own_group?: string
          size?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_own?: boolean
          last_description?: string
          model_id?: string | null
          own_group?: string
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "resale_code_map_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resale_code_map_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "resale_models"
            referencedColumns: ["id"]
          },
        ]
      }
      resale_cycle_allocations: {
        Row: {
          company_id: string | null
          company_name: string
          created_at: string
          cycle_id: string
          id: string
          model_id: string | null
          model_name: string
          qty: number
          size: string
        }
        Insert: {
          company_id?: string | null
          company_name?: string
          created_at?: string
          cycle_id: string
          id?: string
          model_id?: string | null
          model_name?: string
          qty?: number
          size?: string
        }
        Update: {
          company_id?: string | null
          company_name?: string
          created_at?: string
          cycle_id?: string
          id?: string
          model_id?: string | null
          model_name?: string
          qty?: number
          size?: string
        }
        Relationships: [
          {
            foreignKeyName: "resale_cycle_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resale_cycle_allocations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "resale_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resale_cycle_allocations_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "resale_models"
            referencedColumns: ["id"]
          },
        ]
      }
      resale_cycles: {
        Row: {
          closed_on: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          closed_on?: string
          created_at?: string
          id?: string
          label?: string
        }
        Update: {
          closed_on?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      resale_models: {
        Row: {
          created_at: string
          id: string
          name: string
          sizes: string[]
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sizes?: string[]
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sizes?: string[]
          sort_order?: number
        }
        Relationships: []
      }
      resale_sales: {
        Row: {
          code: string
          company_id: string
          created_at: string
          description: string
          group_name: string
          id: string
          period_id: string
          qty: number
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          description?: string
          group_name?: string
          id?: string
          period_id: string
          qty?: number
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          description?: string
          group_name?: string
          id?: string
          period_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "resale_sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resale_sales_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_totals: {
        Row: {
          company_id: string
          created_at: string
          group_name: string
          id: string
          period_id: string
          qty_adjusted: number | null
          qty_from_sets: number
          qty_sheet: number
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          group_name: string
          id?: string
          period_id: string
          qty_adjusted?: number | null
          qty_from_sets?: number
          qty_sheet?: number
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          group_name?: string
          id?: string
          period_id?: string
          qty_adjusted?: number | null
          qty_from_sets?: number
          qty_sheet?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_totals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_totals_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_items: {
        Row: {
          created_at: string
          group_name: string
          id: string
          qty: number
          shipment_id: string
          sort_order: number
          unit_price: number | null
          user_id: string | null
          yield_per_kg: number | null
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          qty?: number
          shipment_id: string
          sort_order?: number
          unit_price?: number | null
          user_id?: string | null
          yield_per_kg?: number | null
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          qty?: number
          shipment_id?: string
          sort_order?: number
          unit_price?: number | null
          user_id?: string | null
          yield_per_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          company_id: string | null
          created_at: string
          factory_id: string | null
          id: string
          is_extra: boolean
          period_id: string
          sort_order: number
          title: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          factory_id?: string | null
          id?: string
          is_extra?: boolean
          period_id: string
          sort_order?: number
          title?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          factory_id?: string | null
          id?: string
          is_extra?: boolean
          period_id?: string
          sort_order?: number
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_factory_id_fkey"
            columns: ["factory_id"]
            isOneToOne: false
            referencedRelation: "factories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_internal_app: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
