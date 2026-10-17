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
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          access_token: string
          connected_at: string
          email: string
          id: string
          organization_id: string | null
          refresh_token: string
          revoked_at: string | null
          scope: string | null
          token_expiry: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          email: string
          id?: string
          organization_id?: string | null
          refresh_token: string
          revoked_at?: string | null
          scope?: string | null
          token_expiry: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          email?: string
          id?: string
          organization_id?: string | null
          refresh_token?: string
          revoked_at?: string | null
          scope?: string | null
          token_expiry?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_events: {
        Row: {
          actor_email: string | null
          actor_name: string | null
          actor_type: string
          created_at: string
          event_type: string
          id: string
          invoice_id: string
          ip_address: string | null
          metadata: Json
          organization_id: string
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          created_at?: string
          event_type: string
          id?: string
          invoice_id: string
          ip_address?: string | null
          metadata?: Json
          organization_id: string
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: string
          invoice_id?: string
          ip_address?: string | null
          metadata?: Json
          organization_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          organization_id: string
          position: number
          quantity: number
          time_entry_id: string | null
          unit: Database["public"]["Enums"]["invoice_line_unit"]
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          organization_id: string
          position?: number
          quantity?: number
          time_entry_id?: string | null
          unit?: Database["public"]["Enums"]["invoice_line_unit"]
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          organization_id?: string
          position?: number
          quantity?: number
          time_entry_id?: string | null
          unit?: Database["public"]["Enums"]["invoice_line_unit"]
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          invoice_id: string
          offset_days: number
          organization_id: string
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          sequence_key: string
          status: string
          step_index: number
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          invoice_id: string
          offset_days?: number
          organization_id: string
          recipient_email: string
          recipient_name?: string | null
          scheduled_for: string
          sent_at?: string | null
          sequence_key: string
          status?: string
          step_index?: number
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          invoice_id?: string
          offset_days?: number
          organization_id?: string
          recipient_email?: string
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sequence_key?: string
          status?: string
          step_index?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          banner_url: string | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          due_date: string | null
          id: string
          issue_date: string | null
          late_fee_enabled: boolean
          late_fee_percent: number
          notes: string | null
          number: string | null
          organization_id: string
          paid_at: string | null
          payment_token: string | null
          prices_include_tax: boolean
          project_id: string | null
          proposal_id: string | null
          recurrence_day_of_month: number | null
          recurrence_enabled: boolean
          recurrence_interval:
            | Database["public"]["Enums"]["invoice_recurrence_interval"]
            | null
          recurrence_last_sent_at: string | null
          recurrence_next_at: string | null
          recurrence_source_id: string | null
          recurrence_weekday: number | null
          reference_number: string | null
          sent_at: string | null
          shipping_address: string | null
          show_logo: boolean
          show_reference: boolean
          show_shipping_address: boolean
          show_tax_id: boolean
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_status: string | null
          subtotal: number
          tax_enabled: boolean
          tax_id: string | null
          tax_rate: number
          tax_total: number
          total: number
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          banner_url?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          late_fee_enabled?: boolean
          late_fee_percent?: number
          notes?: string | null
          number?: string | null
          organization_id: string
          paid_at?: string | null
          payment_token?: string | null
          prices_include_tax?: boolean
          project_id?: string | null
          proposal_id?: string | null
          recurrence_day_of_month?: number | null
          recurrence_enabled?: boolean
          recurrence_interval?:
            | Database["public"]["Enums"]["invoice_recurrence_interval"]
            | null
          recurrence_last_sent_at?: string | null
          recurrence_next_at?: string | null
          recurrence_source_id?: string | null
          recurrence_weekday?: number | null
          reference_number?: string | null
          sent_at?: string | null
          shipping_address?: string | null
          show_logo?: boolean
          show_reference?: boolean
          show_shipping_address?: boolean
          show_tax_id?: boolean
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          subtotal?: number
          tax_enabled?: boolean
          tax_id?: string | null
          tax_rate?: number
          tax_total?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          banner_url?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          late_fee_enabled?: boolean
          late_fee_percent?: number
          notes?: string | null
          number?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_token?: string | null
          prices_include_tax?: boolean
          project_id?: string | null
          proposal_id?: string | null
          recurrence_day_of_month?: number | null
          recurrence_enabled?: boolean
          recurrence_interval?:
            | Database["public"]["Enums"]["invoice_recurrence_interval"]
            | null
          recurrence_last_sent_at?: string | null
          recurrence_next_at?: string | null
          recurrence_source_id?: string | null
          recurrence_weekday?: number | null
          reference_number?: string | null
          sent_at?: string | null
          shipping_address?: string | null
          show_logo?: boolean
          show_reference?: boolean
          show_shipping_address?: boolean
          show_tax_id?: boolean
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_status?: string | null
          subtotal?: number
          tax_enabled?: boolean
          tax_id?: string | null
          tax_rate?: number
          tax_total?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          organization_id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          organization_id: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          organization_id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          country: string | null
          created_at: string
          created_by: string | null
          complimentary_pro: boolean
          currency: string
          custom_tax_rates: number[]
          default_hourly_rate: number
          default_prices_include_tax: boolean
          default_reminder_sequence: string | null
          default_tax_enabled: boolean
          default_tax_rate: number
          deleted_at: string | null
          description: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          org_number: string | null
          payment_bankgiro: string | null
          payment_iban: string | null
          slug: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_customer_id: string | null
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          tax_id: string | null
          trial_ends_at: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          complimentary_pro?: boolean
          currency?: string
          custom_tax_rates?: number[]
          default_hourly_rate?: number
          default_prices_include_tax?: boolean
          default_reminder_sequence?: string | null
          default_tax_enabled?: boolean
          default_tax_rate?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          org_number?: string | null
          payment_bankgiro?: string | null
          payment_iban?: string | null
          slug: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          complimentary_pro?: boolean
          currency?: string
          custom_tax_rates?: number[]
          default_hourly_rate?: number
          default_prices_include_tax?: boolean
          default_reminder_sequence?: string | null
          default_tax_enabled?: boolean
          default_tax_rate?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          org_number?: string | null
          payment_bankgiro?: string | null
          payment_iban?: string | null
          slug?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          stripe_subscription_status?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      outlook_connections: {
        Row: {
          access_token: string
          connected_at: string
          email: string
          id: string
          organization_id: string | null
          refresh_token: string
          revoked_at: string | null
          scope: string | null
          token_expiry: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          email: string
          id?: string
          organization_id?: string | null
          refresh_token: string
          revoked_at?: string | null
          scope?: string | null
          token_expiry: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          email?: string
          id?: string
          organization_id?: string | null
          refresh_token?: string
          revoked_at?: string | null
          scope?: string | null
          token_expiry?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlook_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_ai_analyses: {
        Row: {
          competitors_mentioned: string[]
          confidence: number | null
          created_at: string
          current_tools: string[]
          feature_requests: string[]
          id: string
          intent: string | null
          lead_id: string
          message_id: string | null
          objections: string[]
          pain_points: string[]
          positive_signals: string[]
          raw_output: Json | null
          recommended_action: string | null
          score: number
          sentiment: string | null
          suggested_reply: string | null
          summary: string | null
          temperature: Database["public"]["Enums"]["outreach_temperature"]
        }
        Insert: {
          competitors_mentioned?: string[]
          confidence?: number | null
          created_at?: string
          current_tools?: string[]
          feature_requests?: string[]
          id?: string
          intent?: string | null
          lead_id: string
          message_id?: string | null
          objections?: string[]
          pain_points?: string[]
          positive_signals?: string[]
          raw_output?: Json | null
          recommended_action?: string | null
          score: number
          sentiment?: string | null
          suggested_reply?: string | null
          summary?: string | null
          temperature: Database["public"]["Enums"]["outreach_temperature"]
        }
        Update: {
          competitors_mentioned?: string[]
          confidence?: number | null
          created_at?: string
          current_tools?: string[]
          feature_requests?: string[]
          id?: string
          intent?: string | null
          lead_id?: string
          message_id?: string | null
          objections?: string[]
          pain_points?: string[]
          positive_signals?: string[]
          raw_output?: Json | null
          recommended_action?: string | null
          score?: number
          sentiment?: string | null
          suggested_reply?: string | null
          summary?: string | null
          temperature?: Database["public"]["Enums"]["outreach_temperature"]
        }
        Relationships: [
          {
            foreignKeyName: "outreach_ai_analyses_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_ai_analyses_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "outreach_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_followups: {
        Row: {
          body: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          follow_up_number: number
          id: string
          lead_id: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["outreach_followup_status"]
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          follow_up_number?: number
          id?: string
          lead_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outreach_followup_status"]
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          follow_up_number?: number
          id?: string
          lead_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["outreach_followup_status"]
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_gmail_connections: {
        Row: {
          access_token: string
          connected_at: string
          email: string
          id: string
          last_sync_at: string | null
          refresh_token: string
          revoked_at: string | null
          scope: string | null
          token_expiry: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          email: string
          id?: string
          last_sync_at?: string | null
          refresh_token: string
          revoked_at?: string | null
          scope?: string | null
          token_expiry: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          email?: string
          id?: string
          last_sync_at?: string | null
          refresh_token?: string
          revoked_at?: string | null
          scope?: string | null
          token_expiry?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      outreach_leads: {
        Row: {
          bounce_status: string | null
          business_name: string | null
          caution_note: string | null
          competitors_mentioned: string[]
          created_at: string
          created_by: string | null
          current_tools: string[]
          display_name: string | null
          do_not_contact: boolean
          email: string
          email_normalized: string | null
          feature_requests: string[]
          first_name: string | null
          follow_up_count: number
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          initial_email_body: string | null
          last_contacted_at: string | null
          last_name: string | null
          last_replied_at: string | null
          lead_tier: Database["public"]["Enums"]["outreach_lead_tier"]
          location: string | null
          next_follow_up_at: string | null
          objections: string[]
          outreach_angle: string | null
          outreach_status: Database["public"]["Enums"]["outreach_status"]
          pain_points: string[]
          personalized_opener: string | null
          positive_signals: string[]
          queued_at: string | null
          ready_to_send: boolean
          rebban_fit: string | null
          research_confidence: Database["public"]["Enums"]["outreach_research_confidence"]
          role: string | null
          source_type: string | null
          source_url: string | null
          subject_line: string | null
          temperature:
            | Database["public"]["Enums"]["outreach_temperature"]
            | null
          temperature_reason: string | null
          temperature_score: number | null
          unsubscribe_reason: string | null
          unsubscribed_at: string | null
          updated_at: string
          website_summary: string | null
          website_url: string | null
        }
        Insert: {
          bounce_status?: string | null
          business_name?: string | null
          caution_note?: string | null
          competitors_mentioned?: string[]
          created_at?: string
          created_by?: string | null
          current_tools?: string[]
          display_name?: string | null
          do_not_contact?: boolean
          email: string
          email_normalized?: string | null
          feature_requests?: string[]
          first_name?: string | null
          follow_up_count?: number
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          initial_email_body?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          last_replied_at?: string | null
          lead_tier?: Database["public"]["Enums"]["outreach_lead_tier"]
          location?: string | null
          next_follow_up_at?: string | null
          objections?: string[]
          outreach_angle?: string | null
          outreach_status?: Database["public"]["Enums"]["outreach_status"]
          pain_points?: string[]
          personalized_opener?: string | null
          positive_signals?: string[]
          queued_at?: string | null
          ready_to_send?: boolean
          rebban_fit?: string | null
          research_confidence?: Database["public"]["Enums"]["outreach_research_confidence"]
          role?: string | null
          source_type?: string | null
          source_url?: string | null
          subject_line?: string | null
          temperature?:
            | Database["public"]["Enums"]["outreach_temperature"]
            | null
          temperature_reason?: string | null
          temperature_score?: number | null
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          website_summary?: string | null
          website_url?: string | null
        }
        Update: {
          bounce_status?: string | null
          business_name?: string | null
          caution_note?: string | null
          competitors_mentioned?: string[]
          created_at?: string
          created_by?: string | null
          current_tools?: string[]
          display_name?: string | null
          do_not_contact?: boolean
          email?: string
          email_normalized?: string | null
          feature_requests?: string[]
          first_name?: string | null
          follow_up_count?: number
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          initial_email_body?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          last_replied_at?: string | null
          lead_tier?: Database["public"]["Enums"]["outreach_lead_tier"]
          location?: string | null
          next_follow_up_at?: string | null
          objections?: string[]
          outreach_angle?: string | null
          outreach_status?: Database["public"]["Enums"]["outreach_status"]
          pain_points?: string[]
          personalized_opener?: string | null
          positive_signals?: string[]
          queued_at?: string | null
          ready_to_send?: boolean
          rebban_fit?: string | null
          research_confidence?: Database["public"]["Enums"]["outreach_research_confidence"]
          role?: string | null
          source_type?: string | null
          source_url?: string | null
          subject_line?: string | null
          temperature?:
            | Database["public"]["Enums"]["outreach_temperature"]
            | null
          temperature_reason?: string | null
          temperature_score?: number | null
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
          website_summary?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      outreach_messages: {
        Row: {
          ai_processed_at: string | null
          body_html: string | null
          body_text: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["outreach_message_direction"]
          from_email: string | null
          id: string
          lead_id: string
          provider: string
          provider_message_id: string | null
          provider_thread_id: string | null
          received_at: string | null
          send_error: string | null
          sent_at: string | null
          subject: string | null
          to_emails: string[]
        }
        Insert: {
          ai_processed_at?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["outreach_message_direction"]
          from_email?: string | null
          id?: string
          lead_id: string
          provider?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          subject?: string | null
          to_emails?: string[]
        }
        Update: {
          ai_processed_at?: string | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["outreach_message_direction"]
          from_email?: string | null
          id?: string
          lead_id?: string
          provider?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at?: string | null
          send_error?: string | null
          sent_at?: string | null
          subject?: string | null
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_send_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          lead_id: string | null
          message_id: string | null
          status: Database["public"]["Enums"]["outreach_send_log_status"]
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          message_id?: string | null
          status: Database["public"]["Enums"]["outreach_send_log_status"]
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          message_id?: string | null
          status?: Database["public"]["Enums"]["outreach_send_log_status"]
        }
        Relationships: [
          {
            foreignKeyName: "outreach_send_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_send_log_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "outreach_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_settings: {
        Row: {
          allowed_weekdays: number[]
          daily_send_limit: number
          follow_up_1_days: number
          follow_up_2_days: number
          id: number
          max_follow_ups: number
          send_window_end: string
          send_window_start: string
          sending_enabled: boolean
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_weekdays?: number[]
          daily_send_limit?: number
          follow_up_1_days?: number
          follow_up_2_days?: number
          id?: number
          max_follow_ups?: number
          send_window_end?: string
          send_window_start?: string
          sending_enabled?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_weekdays?: number[]
          daily_send_limit?: number
          follow_up_1_days?: number
          follow_up_2_days?: number
          id?: number
          max_follow_ups?: number
          send_window_end?: string
          send_window_start?: string
          sending_enabled?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          notes: string | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_organization_id: string | null
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          industry: string | null
          locale: string
          marketing_consent: boolean
          marketing_consent_at: string | null
          notification_prefs: Json
          onboarding_completed_at: string | null
          timezone: string
          title: string | null
          updated_at: string
        }
        Insert: {
          active_organization_id?: string | null
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          industry?: string | null
          locale?: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          notification_prefs?: Json
          onboarding_completed_at?: string | null
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          active_organization_id?: string | null
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          industry?: string | null
          locale?: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          notification_prefs?: Json
          onboarding_completed_at?: string | null
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_organization_id_fkey"
            columns: ["active_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          billing_type: Database["public"]["Enums"]["project_billing_type"]
          budget_amount: number | null
          budget_hours: number | null
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          organization_id: string
          proposal_id: string | null
          retainer_amount: number | null
          retainer_auto_invoice: boolean
          retainer_currency: string | null
          retainer_day_of_month: number
          retainer_last_invoiced_at: string | null
          retainer_next_invoice_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          billing_type?: Database["public"]["Enums"]["project_billing_type"]
          budget_amount?: number | null
          budget_hours?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          organization_id: string
          proposal_id?: string | null
          retainer_amount?: number | null
          retainer_auto_invoice?: boolean
          retainer_currency?: string | null
          retainer_day_of_month?: number
          retainer_last_invoiced_at?: string | null
          retainer_next_invoice_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["project_billing_type"]
          budget_amount?: number | null
          budget_hours?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          organization_id?: string
          proposal_id?: string | null
          retainer_amount?: number | null
          retainer_auto_invoice?: boolean
          retainer_currency?: string | null
          retainer_day_of_month?: number
          retainer_last_invoiced_at?: string | null
          retainer_next_invoice_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_events: {
        Row: {
          actor_email: string | null
          actor_name: string | null
          actor_type: string
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          organization_id: string
          proposal_id: string
          share_link_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          organization_id: string
          proposal_id: string
          share_link_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_name?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          organization_id?: string
          proposal_id?: string
          share_link_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_events_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "proposal_share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_followups: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          delay_days: number
          error: string | null
          id: string
          organization_id: string
          proposal_id: string
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          sequence_key: string
          share_link_id: string | null
          status: string
          step_index: number
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          delay_days?: number
          error?: string | null
          id?: string
          organization_id: string
          proposal_id: string
          recipient_email: string
          recipient_name?: string | null
          scheduled_for: string
          sent_at?: string | null
          sequence_key: string
          share_link_id?: string | null
          status?: string
          step_index?: number
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          delay_days?: number
          error?: string | null
          id?: string
          organization_id?: string
          proposal_id?: string
          recipient_email?: string
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sequence_key?: string
          share_link_id?: string | null
          status?: string
          step_index?: number
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_followups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_followups_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_followups_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "proposal_share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          organization_id: string
          proposal_id: string
          recipient_email: string | null
          recipient_name: string | null
          revoked_at: string | null
          token: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          organization_id: string
          proposal_id: string
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          organization_id?: string
          proposal_id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_share_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_share_links_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_signatures: {
        Row: {
          consent_text: string
          created_at: string
          document_hash: string
          id: string
          ip_address: string | null
          organization_id: string
          pdf_byte_size: number | null
          pdf_filename: string | null
          pdf_path: string | null
          pdf_stored_at: string | null
          proposal_id: string
          share_link_id: string | null
          signature_image: string | null
          signature_text: string | null
          signature_type: string
          signed_at: string
          signer_company: string | null
          signer_email: string
          signer_name: string
          signer_title: string | null
          user_agent: string | null
        }
        Insert: {
          consent_text: string
          created_at?: string
          document_hash: string
          id?: string
          ip_address?: string | null
          organization_id: string
          pdf_byte_size?: number | null
          pdf_filename?: string | null
          pdf_path?: string | null
          pdf_stored_at?: string | null
          proposal_id: string
          share_link_id?: string | null
          signature_image?: string | null
          signature_text?: string | null
          signature_type: string
          signed_at?: string
          signer_company?: string | null
          signer_email: string
          signer_name: string
          signer_title?: string | null
          user_agent?: string | null
        }
        Update: {
          consent_text?: string
          created_at?: string
          document_hash?: string
          id?: string
          ip_address?: string | null
          organization_id?: string
          pdf_byte_size?: number | null
          pdf_filename?: string | null
          pdf_path?: string | null
          pdf_stored_at?: string | null
          proposal_id?: string
          share_link_id?: string | null
          signature_image?: string | null
          signature_text?: string | null
          signature_type?: string
          signed_at?: string
          signer_company?: string | null
          signer_email?: string
          signer_name?: string
          signer_title?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_signatures_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_signatures_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "proposal_share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          category: string
          content: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          header_theme: string
          id: string
          industry: string | null
          is_blank: boolean
          is_system: boolean
          name: string
          organization_id: string | null
          slug: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          header_theme?: string
          id?: string
          industry?: string | null
          is_blank?: boolean
          is_system?: boolean
          name: string
          organization_id?: string | null
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          header_theme?: string
          id?: string
          industry?: string | null
          is_blank?: boolean
          is_system?: boolean
          name?: string
          organization_id?: string | null
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          amount: number
          client_id: string | null
          content: Json
          created_at: string
          created_by: string | null
          currency: string
          declined_at: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          project_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          template_id: string | null
          title: string
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount?: number
          client_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          declined_at?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          project_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          template_id?: string | null
          title: string
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount?: number
          client_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          declined_at?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          project_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          template_id?: string | null
          title?: string
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "proposal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          id: string
          payload: Json | null
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          organization_id: string
          storage_path: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          organization_id: string
          storage_path: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          organization_id?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          organization_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          organization_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          organization_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          agent: Database["public"]["Enums"]["support_agent"]
          author_user_id: string | null
          body: string
          created_at: string
          email_sent_at: string | null
          id: string
          is_internal: boolean
          metadata: Json
          ticket_id: string
        }
        Insert: {
          agent: Database["public"]["Enums"]["support_agent"]
          author_user_id?: string | null
          body: string
          created_at?: string
          email_sent_at?: string | null
          id?: string
          is_internal?: boolean
          metadata?: Json
          ticket_id: string
        }
        Update: {
          agent?: Database["public"]["Enums"]["support_agent"]
          author_user_id?: string | null
          body?: string
          created_at?: string
          email_sent_at?: string | null
          id?: string
          is_internal?: boolean
          metadata?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          actor_user_id: string | null
          agent: Database["public"]["Enums"]["support_agent"] | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          ticket_id: string
        }
        Insert: {
          actor_user_id?: string | null
          agent?: Database["public"]["Enums"]["support_agent"] | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          ticket_id: string
        }
        Update: {
          actor_user_id?: string | null
          agent?: Database["public"]["Enums"]["support_agent"] | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_agent: Database["public"]["Enums"]["support_agent"]
          channel: Database["public"]["Enums"]["support_ticket_channel"]
          closed_at: string | null
          created_at: string
          escalated_at: string | null
          escalation_reason: string | null
          first_human_reply_at: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          message_count: number
          metadata: Json
          organization_id: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_email: string | null
          requester_name: string | null
          resolved_at: string | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          tags: string[]
          ticket_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_agent?: Database["public"]["Enums"]["support_agent"]
          channel?: Database["public"]["Enums"]["support_ticket_channel"]
          closed_at?: string | null
          created_at?: string
          escalated_at?: string | null
          escalation_reason?: string | null
          first_human_reply_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          message_count?: number
          metadata?: Json
          organization_id: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          requester_email?: string | null
          requester_name?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          tags?: string[]
          ticket_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_agent?: Database["public"]["Enums"]["support_agent"]
          channel?: Database["public"]["Enums"]["support_ticket_channel"]
          closed_at?: string | null
          created_at?: string
          escalated_at?: string | null
          escalation_reason?: string | null
          first_human_reply_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          message_count?: number
          metadata?: Json
          organization_id?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          requester_email?: string | null
          requester_name?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          tags?: string[]
          ticket_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          column_id: Database["public"]["Enums"]["task_column"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          column_id?: Database["public"]["Enums"]["task_column"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          column_id?: Database["public"]["Enums"]["task_column"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          billable: boolean
          client_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          duration_minutes: number | null
          ended_at: string | null
          hourly_rate: number | null
          id: string
          invoice_id: string | null
          organization_id: string
          project_id: string | null
          started_at: string
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          hourly_rate?: number | null
          id?: string
          invoice_id?: string | null
          organization_id: string
          project_id?: string | null
          started_at: string
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          client_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          hourly_rate?: number | null
          id?: string
          invoice_id?: string | null
          organization_id?: string
          project_id?: string | null
          started_at?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_invoice_reminders: {
        Args: { p_invoice_id: string }
        Returns: number
      }
      cancel_proposal_followups: {
        Args: { p_proposal_id: string }
        Returns: number
      }
      claim_due_invoice_reminders: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          invoice_id: string
          offset_days: number
          organization_id: string
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          sequence_key: string
          status: string
          step_index: number
          subject: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_reminders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_proposal_followups: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          created_at: string
          created_by: string | null
          delay_days: number
          error: string | null
          id: string
          organization_id: string
          proposal_id: string
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          sequence_key: string
          share_link_id: string | null
          status: string
          step_index: number
          subject: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "proposal_followups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_organization: {
        Args: {
          p_name: string
          p_type?: Database["public"]["Enums"]["organization_type"]
        }
        Returns: {
          address: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          custom_tax_rates: number[]
          default_hourly_rate: number
          default_prices_include_tax: boolean
          default_reminder_sequence: string | null
          default_tax_enabled: boolean
          default_tax_rate: number
          deleted_at: string | null
          description: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          org_number: string | null
          payment_bankgiro: string | null
          payment_iban: string | null
          slug: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_customer_id: string | null
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          stripe_subscription_status: string | null
          tax_id: string | null
          trial_ends_at: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_user_notification: {
        Args: {
          p_body: string
          p_entity_id?: string
          p_entity_type?: string
          p_link?: string
          p_organization_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      decline_public_proposal: {
        Args: {
          p_email?: string
          p_ip?: string
          p_name?: string
          p_reason?: string
          p_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      get_public_invoice: { Args: { p_token: string }; Returns: Json }
      get_public_proposal: { Args: { p_token: string }; Returns: Json }
      get_signed_proposal_bundle: { Args: { p_token: string }; Returns: Json }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      record_public_invoice_view: {
        Args: { p_ip?: string; p_token: string; p_user_agent?: string }
        Returns: Json
      }
      record_public_proposal_view: {
        Args: { p_ip?: string; p_token: string; p_user_agent?: string }
        Returns: Json
      }
      resolve_share_link: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          organization_id: string
          proposal_id: string
          recipient_email: string | null
          recipient_name: string | null
          revoked_at: string | null
          token: string
          view_count: number
        }
        SetofOptions: {
          from: "*"
          to: "proposal_share_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_public_invoice_checkout: {
        Args: {
          p_payment_status?: string
          p_session_id: string
          p_token: string
        }
        Returns: undefined
      }
      sign_public_proposal: {
        Args: {
          p_consent_text?: string
          p_document_hash?: string
          p_ip?: string
          p_signature_image?: string
          p_signature_text?: string
          p_signature_type?: string
          p_signer_company?: string
          p_signer_email: string
          p_signer_name: string
          p_signer_title?: string
          p_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      slugify: { Args: { input: string }; Returns: string }
    }
    Enums: {
      client_status: "active" | "idle" | "prospect"
      invoice_line_unit: "qty" | "hr" | "day" | "flat"
      invoice_recurrence_interval:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
      invoice_status: "draft" | "sent" | "viewed" | "paid" | "overdue" | "void"
      member_role: "owner" | "admin" | "member"
      member_status: "active" | "invited" | "removed"
      organization_type: "solo" | "agency"
      outreach_followup_status:
        | "scheduled"
        | "due"
        | "sent"
        | "cancelled"
        | "skipped"
      outreach_lead_tier: "a" | "b" | "c"
      outreach_message_direction: "outbound" | "inbound"
      outreach_research_confidence: "high" | "medium" | "low" | "unknown"
      outreach_send_log_status: "queued" | "sent" | "failed" | "skipped"
      outreach_status:
        | "new"
        | "ready"
        | "queued"
        | "contacted"
        | "replied"
        | "not_interested"
        | "bounced"
      outreach_temperature: "hot" | "warm" | "cold"
      project_billing_type: "fixed" | "hourly" | "daily" | "retainer" | "mixed"
      project_status: "active" | "on_hold" | "completed" | "archived"
      proposal_status: "draft" | "sent" | "viewed" | "accepted" | "declined"
      support_agent: "ai" | "human" | "user" | "system"
      support_ticket_channel: "in_app_chat" | "email"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status:
        | "open"
        | "awaiting_human"
        | "awaiting_user"
        | "resolved"
        | "closed"
      task_column: "backlog" | "todo" | "in_progress" | "review" | "done"
      task_priority: "low" | "medium" | "high" | "urgent"
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
    Enums: {
      client_status: ["active", "idle", "prospect"],
      invoice_line_unit: ["qty", "hr", "day", "flat"],
      invoice_recurrence_interval: [
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
      ],
      invoice_status: ["draft", "sent", "viewed", "paid", "overdue", "void"],
      member_role: ["owner", "admin", "member"],
      member_status: ["active", "invited", "removed"],
      organization_type: ["solo", "agency"],
      outreach_followup_status: [
        "scheduled",
        "due",
        "sent",
        "cancelled",
        "skipped",
      ],
      outreach_lead_tier: ["a", "b", "c"],
      outreach_message_direction: ["outbound", "inbound"],
      outreach_research_confidence: ["high", "medium", "low", "unknown"],
      outreach_send_log_status: ["queued", "sent", "failed", "skipped"],
      outreach_status: [
        "new",
        "ready",
        "queued",
        "contacted",
        "replied",
        "not_interested",
        "bounced",
      ],
      outreach_temperature: ["hot", "warm", "cold"],
      project_billing_type: ["fixed", "hourly", "daily", "retainer", "mixed"],
      project_status: ["active", "on_hold", "completed", "archived"],
      proposal_status: ["draft", "sent", "viewed", "accepted", "declined"],
      support_agent: ["ai", "human", "user", "system"],
      support_ticket_channel: ["in_app_chat", "email"],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: [
        "open",
        "awaiting_human",
        "awaiting_user",
        "resolved",
        "closed",
      ],
      task_column: ["backlog", "todo", "in_progress", "review", "done"],
      task_priority: ["low", "medium", "high", "urgent"],
    },
  },
} as const
