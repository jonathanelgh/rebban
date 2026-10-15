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
          created_at: string
          created_by: string | null
          currency: string
          custom_tax_rates: number[]
          default_prices_include_tax: boolean
          default_tax_enabled: boolean
          default_tax_rate: number
          deleted_at: string | null
          description: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          org_number: string | null
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
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_tax_rates?: number[]
          default_prices_include_tax?: boolean
          default_tax_enabled?: boolean
          default_tax_rate?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          org_number?: string | null
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
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_tax_rates?: number[]
          default_prices_include_tax?: boolean
          default_tax_enabled?: boolean
          default_tax_rate?: number
          deleted_at?: string | null
          description?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          org_number?: string | null
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
          locale: string
          marketing_consent: boolean
          marketing_consent_at: string | null
          onboarding_completed_at: string | null
          timezone: string
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
          locale?: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          onboarding_completed_at?: string | null
          timezone?: string
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
          locale?: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          onboarding_completed_at?: string | null
          timezone?: string
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
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
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
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
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
          created_at: string
          created_by: string | null
          currency: string
          custom_tax_rates: number[]
          default_prices_include_tax: boolean
          default_tax_enabled: boolean
          default_tax_rate: number
          deleted_at: string | null
          description: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          org_number: string | null
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
      record_public_invoice_view: {
        Args: { p_ip?: string; p_token: string; p_user_agent?: string }
        Returns: Json
      }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      record_public_proposal_view: {
        Args: { p_ip?: string; p_token: string; p_user_agent?: string }
        Returns: Json
      }
      set_public_invoice_checkout: {
        Args: {
          p_payment_status?: string
          p_session_id: string
          p_token: string
        }
        Returns: undefined
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
      invoice_status: "draft" | "sent" | "viewed" | "paid" | "overdue" | "void"
      member_role: "owner" | "admin" | "member"
      member_status: "active" | "invited" | "removed"
      organization_type: "solo" | "agency"
      project_status: "active" | "on_hold" | "completed" | "archived"
      proposal_status: "draft" | "sent" | "viewed" | "accepted" | "declined"
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
      invoice_status: ["draft", "sent", "viewed", "paid", "overdue", "void"],
      member_role: ["owner", "admin", "member"],
      member_status: ["active", "invited", "removed"],
      organization_type: ["solo", "agency"],
      project_status: ["active", "on_hold", "completed", "archived"],
      proposal_status: ["draft", "sent", "viewed", "accepted", "declined"],
      task_column: ["backlog", "todo", "in_progress", "review", "done"],
      task_priority: ["low", "medium", "high", "urgent"],
    },
  },
} as const
