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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: boolean
          lock_past_weeks: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          lock_past_weeks?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          lock_past_weeks?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      customer_prices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: number
          id: number
          price: number
          valid_from: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: number
          id?: never
          price: number
          valid_from: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: number
          id?: never
          price?: number
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_prices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: number
          is_active: boolean
          name: string
          name_key: string | null
          note: string | null
          type: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          name: string
          name_key?: string | null
          note?: string | null
          type: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: never
          is_active?: boolean
          name?: string
          name_key?: string | null
          note?: string | null
          type?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          balance_delta: number | null
          collection: number
          created_at: string
          created_by: string | null
          customer_id: number
          delivered_qty: number
          entry_date: string
          gross_amount: number | null
          id: number
          net_amount: number | null
          note: string | null
          return_amount: number | null
          returned_qty: number
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          balance_delta?: number | null
          collection?: number
          created_at?: string
          created_by?: string | null
          customer_id: number
          delivered_qty?: number
          entry_date: string
          gross_amount?: number | null
          id?: never
          net_amount?: number | null
          note?: string | null
          return_amount?: number | null
          returned_qty?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          balance_delta?: number | null
          collection?: number
          created_at?: string
          created_by?: string | null
          customer_id?: number
          delivered_qty?: number
          entry_date?: string
          gross_amount?: number | null
          id?: never
          net_amount?: number | null
          note?: string | null
          return_amount?: number | null
          returned_qty?: number
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      customer_overview: {
        Row: {
          address: string | null
          balance: number | null
          created_at: string | null
          current_price: number | null
          id: number | null
          is_active: boolean | null
          last_entry_date: string | null
          name: string | null
          note: string | null
          price_since: string | null
          type: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_customer: {
        Args: {
          p_address?: string
          p_name: string
          p_note?: string
          p_price: number
          p_type: number
        }
        Returns: number
      }
      get_customer_period_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          closing_balance: number
          collection: number
          customer_id: number
          customer_name: string
          customer_type: number
          delivered_qty: number
          entry_days: number
          gross_amount: number
          net_amount: number
          opening_balance: number
          period_delta: number
          return_amount: number
          returned_qty: number
        }[]
      }
      get_customer_statement: {
        Args: {
          p_customer_id: number
          p_from: string
          p_group?: string
          p_to: string
        }
        Returns: {
          collection: number
          delivered_qty: number
          gross_amount: number
          net_amount: number
          period_delta: number
          period_start: string
          return_amount: number
          returned_qty: number
          running_balance: number
        }[]
      }
      get_totals: {
        Args: { p_from: string; p_group?: string; p_to: string }
        Returns: {
          collection: number
          customer_count: number
          delivered_qty: number
          gross_amount: number
          net_amount: number
          period_delta: number
          period_start: string
          return_amount: number
          returned_qty: number
        }[]
      }
      get_week_board: {
        Args: { p_date: string }
        Returns: {
          balance_delta: number
          collection: number
          customer_id: number
          customer_name: string
          customer_type: number
          delivered_qty: number
          entry_date: string
          gross_amount: number
          id: number
          is_locked: boolean
          net_amount: number
          note: string
          return_amount: number
          returned_qty: number
          unit_price: number
        }[]
      }
      set_customer_price: {
        Args: { p_customer_id: number; p_price: number; p_valid_from?: string }
        Returns: undefined
      }
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
