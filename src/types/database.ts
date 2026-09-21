/**
 * Supabase の生成型を入れる場所。
 * 本来は `npx supabase gen types typescript --project-id <id>` で自動生成するが、
 * 手書きでも動くよう最低限の型を定義しておく。
 *
 * スキーマを変えたら必ずこのファイルも更新する（または再生成する）。
 */

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type PaymentMethod = "in_store" | "stripe";
export type PaymentStatus = "unpaid" | "paid" | "refunded" | "failed";
export type MenuCategoryDb =
  | "cut"
  | "course"
  | "color"
  | "perm"
  | "straighten"
  | "option";
export type ProfileRole = "customer" | "admin";
export type ReservationSource = "web" | "phone" | "walkin" | "handwritten";
export type CustomerSource = "web" | "admin" | "handwritten";
export type HolidayType = "closed" | "special_hours";
export type EmailType = "confirmation" | "reminder" | "cancellation" | "admin_notice";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string | null;
          email: string;
          phone: string | null;
          role: ProfileRole;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string | null;
          email: string;
          phone?: string | null;
          role?: ProfileRole;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      menus: {
        Row: {
          id: string;
          slug: string;
          category: MenuCategoryDb;
          name: string;
          description: string | null;
          price: number;
          price_label: string | null;
          duration_min: number;
          note: string | null;
          is_option: boolean;
          age_group: string | null;
          sort_order: number;
          is_active: boolean;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["menus"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["menus"]["Insert"]>;
        Relationships: [];
      };
      business_hours: {
        Row: {
          day_of_week: number; // 0=Sun
          open_time: string; // HH:mm:ss
          close_time: string;
          is_open: boolean;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["business_hours"]["Row"], "updated_at">;
        Update: Partial<Database["public"]["Tables"]["business_hours"]["Insert"]>;
        Relationships: [];
      };
      holiday_overrides: {
        Row: {
          date: string; // YYYY-MM-DD
          type: HolidayType;
          open_time: string | null;
          close_time: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["holiday_overrides"]["Row"],
          "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["holiday_overrides"]["Insert"]>;
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          code: string;
          customer_id: string | null;
          status: ReservationStatus;
          start_at: string; // timestamptz ISO
          end_at: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          total_price: number;
          payment_method: PaymentMethod;
          payment_status: PaymentStatus;
          stripe_payment_intent: string | null;
          notes: string | null;
          source: ReservationSource;
          /** 顧客リスト（customers）への紐づけ。INSERT 時にトリガが自動で埋める。 */
          customer_record_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["reservations"]["Row"],
          "id" | "code" | "created_at" | "updated_at" | "customer_record_id"
        > & { id?: string; code?: string; customer_record_id?: string | null };
        Update: Partial<Database["public"]["Tables"]["reservations"]["Insert"]>;
        Relationships: [];
      };
      reservation_items: {
        Row: {
          id: string;
          reservation_id: string;
          menu_id: string | null;
          name_snapshot: string;
          price_snapshot: number;
          duration_snapshot: number;
          sort_order: number;
        };
        Insert: Omit<Database["public"]["Tables"]["reservation_items"]["Row"], "id"> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reservation_items"]["Insert"]>;
        Relationships: [];
      };
      email_log: {
        Row: {
          id: string;
          reservation_id: string | null;
          type: EmailType;
          to_email: string;
          subject: string;
          provider_message_id: string | null;
          error: string | null;
          sent_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["email_log"]["Row"], "id" | "sent_at"> & {
          id?: string;
          sent_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_log"]["Insert"]>;
        Relationships: [];
      };
      settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["settings"]["Row"], "updated_at">;
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          source: CustomerSource;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          source?: CustomerSource;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      customer_summaries: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          source: CustomerSource;
          created_at: string;
          updated_at: string;
          visit_count: number;
          last_visit_at: string | null;
          next_reservation_at: string | null;
          upcoming_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      lookup_reservation: {
        Args: { p_code: string; p_email: string };
        Returns: {
          id: string;
          code: string;
          status: ReservationStatus;
          start_at: string;
          end_at: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          total_price: number;
          payment_method: PaymentMethod;
          payment_status: PaymentStatus;
        }[];
      };
      create_reservation: {
        Args: {
          p_start_at: string;
          p_end_at: string;
          p_customer_name: string;
          p_customer_email: string;
          p_customer_phone: string;
          p_menu_ids: string[];
          p_payment_method: PaymentMethod;
          p_notes: string | null;
        };
        Returns: { id: string; code: string }[];
      };
      cancel_reservation: {
        Args: { p_code: string; p_email: string };
        Returns: ReservationStatus;
      };
      is_admin: {
        Args: { uid: string };
        Returns: boolean;
      };
    };
    Enums: {
      reservation_status: ReservationStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      menu_category: MenuCategoryDb;
      profile_role: ProfileRole;
      holiday_type: HolidayType;
      email_type: EmailType;
    };
  };
}
