"use client";

import React, { useState, Suspense, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Folder, Eye, Zap,
  ChevronUp, ChevronDown, Trash, Check,
  Image as ImageIcon, Plus, GripVertical, XCircle,
  LayoutTemplate, Palette, Type, AlignLeft,
  Columns, CreditCard, BoxSelect, AppWindow, GalleryHorizontalEnd,
  Layout, Users, Calendar, ScrollText, ListChecks,
  Target, Package, Route, Ban, UserCheck, RefreshCw, ArrowRight, PenLine, BookmarkPlus, X,
  UploadCloud, Loader2, Send, Sparkles, FolderKanban, PanelRight, Save
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import { MenuSelect } from "@/components/MenuSelect";
import { SendProposalModal } from "@/components/SendProposalModal";
import { ProposalActivityLog } from "@/components/ProposalActivityLog";
import { ProposalAiWriteModal } from "@/components/ProposalAiWriteModal";
import { ConvertToProjectModal } from "@/components/ConvertToProjectModal";
import {
  ProposalSendMenu,
  isProposalAlreadySent,
  resumeStatusFromTimestamps,
} from "@/components/ProposalSendMenu";
import type { ProjectBillingType } from "@/lib/projects/billing";
import {
  DEFAULT_PROPOSAL_SEND_MESSAGE,
  asOrgFollowUpSequence,
  type FollowUpSequenceKey,
} from "@/lib/proposals/followups";
import type { Enums } from "@/types/database";
import { ModalOverlay, modalPanelClass } from "@/components/ModalFrame";
import {
  asProposalContent,
  blockTypesFromContent,
  mergeElementStyles,
  toProposalContentJson,
  type ProposalContentSnapshot,
  type ProposalHeaderTheme,
} from "@/lib/proposals/content";

type SectionType =
  | 'global'
  | 'header'
  | 'summary'
  | 'goals'
  | 'scope'
  | 'deliverables'
  | 'approach'
  | 'timeline'
  | 'pricing'
  | 'payment'
  | 'exclusions'
  | 'responsibilities'
  | 'revisions'
  | 'terms'
  | 'next-steps'
  | 'signature'
  | 'content'
  | 'image'
  | 'two-column'
  | 'media-text'
  | 'about';
type BlockType = Exclude<SectionType, 'global' | 'header'>;
type ThemeType = 'cover' | 'classic' | 'pastel' | 'alpine' | 'splash' | 'auburn';
type ElementKind = 'text' | 'heading' | 'image' | 'button';

type CanvasBlock = {
  id: string;
  type: BlockType;
  variant?: 'summary' | 'analysis' | 'blank';
};

type PaletteItem = {
  type: BlockType;
  label: string;
  variant?: CanvasBlock['variant'];
};

/** Canonical proposal flow — sell → clarify → protect */
const STANDARD_PROPOSAL_BLOCKS: BlockType[] = [
  'summary',
  'goals',
  'scope',
  'deliverables',
  'approach',
  'timeline',
  'pricing',
  'payment',
  'exclusions',
  'responsibilities',
  'revisions',
  'terms',
  'next-steps',
  'signature',
];

const SECTION_PALETTE: PaletteItem[] = [
  { type: 'summary', label: 'Executive Summary' },
  { type: 'goals', label: 'Goals' },
  { type: 'scope', label: 'Scope' },
  { type: 'deliverables', label: 'Deliverables' },
  { type: 'approach', label: 'Approach' },
  { type: 'timeline', label: 'Timeline' },
  { type: 'pricing', label: 'Pricing' },
  { type: 'payment', label: 'Payment' },
  { type: 'exclusions', label: 'Exclusions' },
  { type: 'responsibilities', label: 'Client Responsibilities' },
  { type: 'revisions', label: 'Revisions' },
  { type: 'terms', label: 'Terms' },
  { type: 'next-steps', label: 'Next Steps' },
  { type: 'signature', label: 'Acceptance' },
  { type: 'content', label: 'Text', variant: 'blank' },
  { type: 'image', label: 'Image' },
  { type: 'about', label: 'About Us' },
];

const createBlockId = () => `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function getInitialBlocks(_templateId: string): CanvasBlock[] {
  // Every template uses the same professional structure; visual theme only changes the cover.
  return STANDARD_PROPOSAL_BLOCKS.map((type) => ({ id: createBlockId(), type }));
}

type ElementStyle = {
  content?: string;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  fontSize?: number;
  lineHeight?: number;
  src?: string;
  borderRadius?: number;
  opacity?: number;
};

const DEFAULT_ELEMENT_STYLES: Record<string, ElementStyle> = {
  'header-logo-name': {
    content: 'Studio North',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#111827',
    fontSize: 14,
    lineHeight: 1.3,
  },
  'header-title': {
    content: 'Website Redesign Proposal',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#111827',
    fontSize: 36,
    lineHeight: 1.15,
  },
  'header-client': {
    content: 'Acme Consulting',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#4B5563',
    fontSize: 16,
    lineHeight: 1.4,
  },
  'header-date': {
    content: '',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 13,
    lineHeight: 1.4,
  },
  'header-validity': {
    content: '',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 13,
    lineHeight: 1.4,
  },
  'header-subtitle': {
    content: 'Proposal',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.4,
  },
  'header-cover-subtitle': {
    content: 'Prepared for Acme Consulting',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#D1D5DB',
    fontSize: 18,
    lineHeight: 1.4,
  },
  'header-from-name': {
    content: 'Studio North',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#111827',
    fontSize: 13,
    lineHeight: 1.4,
  },
  'header-from-email': {
    content: 'hello@studionorth.co',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 13,
    lineHeight: 1.4,
  },
  'header-from-address': {
    content: 'Your Address',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 1.5,
  },
  'header-to-name': {
    content: 'Acme Consulting',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#111827',
    fontSize: 13,
    lineHeight: 1.4,
  },
  'header-to-email': {
    content: 'hello@acme.com',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 13,
    lineHeight: 1.4,
  },
  'header-to-address': {
    content: '165 11th Street\nSan Francisco, CA 94013',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 13,
    lineHeight: 1.55,
  },
  'summary-heading': {
    content: 'Executive summary',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'summary-text': {
    content: "Acme’s current site no longer reflects the quality of your work or converts the traffic you’re already earning. You need a clearer brand presence, a faster path from visit to inquiry, and a site your team can update without calling a developer. This proposal outlines a focused redesign — discovery through launch — built around those outcomes.",
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 15,
    lineHeight: 1.65,
  },
  'goals-heading': {
    content: 'Project goals',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'goals-intro': {
    content: 'The outcomes this engagement is designed to achieve — measured by results, not activity.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'deliverables-heading': {
    content: 'Deliverables',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'deliverables-intro': {
    content: 'Concrete assets and outputs you will receive at the end of this engagement.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'approach-heading': {
    content: 'Approach',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'approach-intro': {
    content: 'How the work will be done — a clear process without unnecessary complexity.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'exclusions-heading': {
    content: 'What’s not included',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'exclusions-intro': {
    content: 'Items outside this agreement. These can be scoped separately if needed.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'responsibilities-heading': {
    content: 'Client responsibilities',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'responsibilities-intro': {
    content: 'What we need from you to keep the project on schedule.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'revisions-heading': {
    content: 'Revisions & change requests',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'revisions-text': {
    content: 'This engagement includes two rounds of revisions per major deliverable. Feedback must be consolidated and returned within five business days of each review. Additional rounds or out-of-scope changes are billed at the hourly rate listed in Pricing, after written approval.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 15,
    lineHeight: 1.65,
  },
  'next-steps-heading': {
    content: 'Next steps',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'next-steps-text': {
    content: 'To proceed: accept this proposal, confirm the selected investment, and return the signed acceptance below. We’ll invoice the deposit and schedule kickoff once payment is received.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 15,
    lineHeight: 1.65,
  },
  'signature-heading': {
    content: 'Acceptance',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'signature-intro': {
    content: 'By signing below, the client agrees to this proposal, the scope described, and the attached terms.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'hero-image': {
    src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80',
    borderRadius: 16,
    opacity: 100,
  },
  'about-heading': {
    content: 'We turn complex problems into elegant solutions.',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#111827',
    fontSize: 30,
    lineHeight: 1.25,
  },
  'about-text': {
    content: 'Founded in 2016, our agency brings together a diverse team of strategists, designers, and engineers. We believe in the power of collaboration and data-driven design to create impactful digital experiences that drive real business growth.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 1.6,
  },
  'about-image': {
    src: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
    borderRadius: 16,
    opacity: 100,
  },
  'scope-heading': {
    content: 'Scope of work',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'scope-intro': {
    content: 'Exactly what is included in this engagement — so expectations stay aligned.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'timeline-heading': {
    content: 'Timeline & milestones',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'timeline-intro': {
    content: 'Estimated 6–8 weeks from kickoff to launch. Start begins on deposit. Timelines may shift if feedback or assets are delayed.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'payment-heading': {
    content: 'Payment schedule',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'payment-intro': {
    content: 'Invoices are issued at each milestone below. Payment is due within 14 days of invoice date (Net 14).',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'payment-terms-note': {
    content: 'Work may pause if a milestone remains unpaid more than 7 days past due. Accepted methods: bank transfer and card. Late balances may incur a 1.5% monthly finance charge where permitted by law.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'terms-heading': {
    content: 'Terms & conditions',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'terms-intro': {
    content: 'Acceptance of this proposal constitutes agreement to the following terms.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 1.6,
  },
  'process-heading': {
    content: 'Our Process',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'process-text-1': {
    content: 'We begin with a comprehensive audit of your current digital footprint. This allows us to establish a baseline and identify immediate low-hanging fruit.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 15,
    lineHeight: 1.6,
  },
  'process-text-2': {
    content: 'Moving forward, our iterative design phases ensure you are involved at every milestone, mitigating risk and ensuring alignment with your core vision.',
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 15,
    lineHeight: 1.6,
  },
  'process-image': {
    src: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80',
    borderRadius: 12,
    opacity: 100,
  },
  'analysis-heading': {
    content: 'Situation Analysis',
    fontFamily: 'Inter',
    fontWeight: 'Bold',
    color: '#6D5D4B',
    fontSize: 24,
    lineHeight: 1.3,
  },
  'analysis-text': {
    content: "After conducting an in-depth analysis of [Client's Company]'s current marketing efforts, we have identified several areas that require attention. While your brand has strong recognition, your online presence and digital conversion funnels are underperforming compared to industry benchmarks.",
    fontFamily: 'Inter',
    fontWeight: 'Normal',
    color: '#374151',
    fontSize: 15,
    lineHeight: 1.6,
  },
  'about-stat-1-value': { content: '10+', fontFamily: 'Inter', fontWeight: 'Bold', color: '#111827', fontSize: 24, lineHeight: 1.2 },
  'about-stat-1-label': { content: 'Years Active', fontFamily: 'Inter', fontWeight: 'Normal', color: '#6B7280', fontSize: 12, lineHeight: 1.4 },
  'about-stat-2-value': { content: '120', fontFamily: 'Inter', fontWeight: 'Bold', color: '#111827', fontSize: 24, lineHeight: 1.2 },
  'about-stat-2-label': { content: 'Projects Done', fontFamily: 'Inter', fontWeight: 'Normal', color: '#6B7280', fontSize: 12, lineHeight: 1.4 },
  'about-stat-3-value': { content: '15', fontFamily: 'Inter', fontWeight: 'Bold', color: '#111827', fontSize: 24, lineHeight: 1.2 },
  'about-stat-3-label': { content: 'Industry Awards', fontFamily: 'Inter', fontWeight: 'Normal', color: '#6B7280', fontSize: 12, lineHeight: 1.4 },
};

const FONT_WEIGHT_MAP: Record<string, number> = {
  Light: 300,
  Normal: 400,
  Bold: 700,
};

type LineItem = {
  id: string;
  title: string;
  description: string;
  qty: number;
  price: number;
  unit: 'hr' | 'flat' | 'day';
};

type ScopeEntry = { id: string; text: string };
type ApproachStep = { id: string; title: string; description: string };
type AboutStat = { id: string; value: string; label: string };
type TimelinePhase = { id: string; week: string; title: string; detail: string };
type PaymentMilestone = { id: string; label: string; pct: string; when: string };
type TermEntry = { id: string; title: string; body: string };
type ElementPaletteKind = 'heading' | 'text' | 'image';
type InSectionElement = { id: string; kind: ElementPaletteKind };
type ListEditKind = 'scope-included' | 'scope-excluded' | 'timeline' | 'payment' | 'terms' | 'goals' | 'deliverables' | 'approach' | 'responsibilities' | 'about-stat';

const ELEMENT_PALETTE: { kind: ElementPaletteKind; label: string }[] = [
  { kind: 'heading', label: 'Heading' },
  { kind: 'text', label: 'Text' },
  { kind: 'image', label: 'Image' },
];

type CurrencyCode = 'USD' | 'EUR' | 'GBP';

const createEntryId = () => `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function splitApproachText(text: string) {
  const parts = text.split(/\s+[—–-]\s+/);
  if (parts.length >= 2) {
    return { title: parts[0], description: parts.slice(1).join(" — ") };
  }
  return { title: text, description: "" };
}

function normalizeApproachSteps(raw: unknown[]): ApproachStep[] {
  return raw.map((item) => {
    if (!item || typeof item !== "object") {
      return { id: createEntryId(), title: "New step", description: "" };
    }
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : createEntryId();
    if (typeof rec.title === "string") {
      return {
        id,
        title: rec.title,
        description:
          typeof rec.description === "string"
            ? rec.description
            : typeof rec.detail === "string"
              ? rec.detail
              : "",
      };
    }
    if (typeof rec.text === "string") {
      const parsed = splitApproachText(rec.text);
      return { id, title: parsed.title, description: parsed.description };
    }
    return { id, title: "New step", description: "" };
  });
}

const DEFAULT_SCOPE_INCLUDED: ScopeEntry[] = [
  { id: 'scope-in-1', text: 'Discovery workshop & research synthesis' },
  { id: 'scope-in-2', text: 'UX wireframes and high-fidelity UI design' },
  { id: 'scope-in-3', text: 'Responsive front-end implementation' },
  { id: 'scope-in-4', text: 'Two rounds of design revisions' },
  { id: 'scope-in-5', text: 'Launch support and handover documentation' },
];

const DEFAULT_SCOPE_EXCLUDED: ScopeEntry[] = [
  { id: 'scope-ex-1', text: 'Ongoing content creation or copywriting' },
  { id: 'scope-ex-2', text: 'Paid media / advertising management' },
  { id: 'scope-ex-3', text: 'Third-party software licensing fees' },
  { id: 'scope-ex-4', text: 'Custom backend / API development beyond CMS' },
  { id: 'scope-ex-5', text: 'Post-launch retainer (available separately)' },
];

const DEFAULT_TIMELINE: TimelinePhase[] = [
  { id: 'tl-1', week: 'Week 1', title: 'Discovery & Strategy', detail: 'Kickoff, stakeholder interviews, competitive audit, and success metrics.' },
  { id: 'tl-2', week: 'Week 2–3', title: 'Design', detail: 'Wireframes, visual direction, high-fidelity screens, and stakeholder review.' },
  { id: 'tl-3', week: 'Week 4–6', title: 'Build', detail: 'Front-end development, CMS setup, content integration, and QA.' },
  { id: 'tl-4', week: 'Week 7–8', title: 'Launch & Handoff', detail: 'Final polish, launch checklist, training, and documentation.' },
];

const DEFAULT_PAYMENT: PaymentMilestone[] = [
  { id: 'pay-1', label: 'Deposit', pct: '50%', when: 'Due on proposal acceptance' },
  { id: 'pay-2', label: 'Final', pct: '50%', when: 'Due before final delivery' },
];

const DEFAULT_TERMS: TermEntry[] = [
  { id: 'term-1', title: 'Validity', body: 'This proposal is valid for 30 days from the sent date unless otherwise agreed in writing.' },
  { id: 'term-2', title: 'Revisions', body: 'The fee includes two rounds of revisions per major deliverable. Additional revisions are billed at the hourly rate listed above.' },
  { id: 'term-3', title: 'Ownership', body: 'Final deliverables transfer to the client upon full payment. Working files and unused concepts remain property of the studio unless purchased separately.' },
  { id: 'term-4', title: 'Confidentiality', body: 'Both parties agree to keep proprietary information confidential during and after the engagement.' },
  { id: 'term-5', title: 'Cancellation', body: 'Either party may cancel with 14 days written notice. Work completed to date will be invoiced and due immediately.' },
];

const DEFAULT_GOALS: ScopeEntry[] = [
  { id: 'goal-1', text: 'Increase qualified inquiry conversions from the website.' },
  { id: 'goal-2', text: 'Present a clear, current brand story across every page.' },
  { id: 'goal-3', text: 'Give your team a CMS they can update without developer help.' },
];

const DEFAULT_DELIVERABLES: ScopeEntry[] = [
  { id: 'del-1', text: '5–7 page marketing website (design + build)' },
  { id: 'del-2', text: 'Component-based design system in Figma' },
  { id: 'del-3', text: 'CMS setup with training documentation' },
  { id: 'del-4', text: 'Launch checklist and 14-day post-launch support' },
];

const DEFAULT_APPROACH: ApproachStep[] = [
  { id: 'ap-1', title: 'Discover', description: 'Kickoff, stakeholder input, and success metrics' },
  { id: 'ap-2', title: 'Design', description: 'Wireframes, visual direction, and review cycles' },
  { id: 'ap-3', title: 'Build', description: 'Front-end, CMS, content integration, and QA' },
  { id: 'ap-4', title: 'Launch', description: 'Final polish, training, and handoff' },
];

const DEFAULT_RESPONSIBILITIES: ScopeEntry[] = [
  { id: 'resp-1', text: 'Provide brand assets, copy, and access within 5 business days of request' },
  { id: 'resp-2', text: 'Consolidate feedback into a single round per review checkpoint' },
  { id: 'resp-3', text: 'Assign one decision-maker for approvals' },
  { id: 'resp-4', text: 'Approve milestones within 5 business days to keep the timeline' },
];

const DEFAULT_ABOUT_STATS: AboutStat[] = [
  { id: 'stat-1', value: '10+', label: 'Years Active' },
  { id: 'stat-2', value: '120', label: 'Projects Done' },
  { id: 'stat-3', value: '15', label: 'Industry Awards' },
];

const ITEM_CATALOG: Omit<LineItem, 'id' | 'qty'>[] = [
  {
    title: 'Brand Discovery Workshop',
    description: 'Facilitate workshop. Brainstorm brand-related principles, objectives and ideas with workshop attendees. Submit Brand Discovery Report highlighting key outcomes and suggestions resulting from the brainstorming exercise.',
    price: 80,
    unit: 'hr',
  },
  {
    title: 'Brand Guidelines',
    description: 'Intervention includes five specific stages to establish brand guidelines. 1. Establish brand ethos and objectives. 2. Define users/customers 3. Choose appropriate brand format. 4. Determine definitive guideline variables based on prior stages. 5. Assemble guidelines.',
    price: 80,
    unit: 'hr',
  },
  {
    title: 'Brand Identity',
    description: 'Create a brand identity and strategy package including logo, typography, and color systems.',
    price: 500,
    unit: 'flat',
  },
  {
    title: 'Website Design',
    description: 'End-to-end UI/UX design for a marketing website including wireframes, high-fidelity mockups, and a component library.',
    price: 120,
    unit: 'hr',
  },
  {
    title: 'Development Sprint',
    description: 'Front-end implementation sprint covering responsive pages, CMS integration, and QA handoff.',
    price: 950,
    unit: 'day',
  },
];

const CURRENCY_META: Record<CurrencyCode, { symbol: string; label: string }> = {
  USD: { symbol: '$', label: 'USD ($)' },
  EUR: { symbol: '€', label: 'EUR (€)' },
  GBP: { symbol: '£', label: 'GBP (£)' },
};

const UNIT_LABEL: Record<LineItem['unit'], string> = {
  hr: '/ hr',
  flat: 'flat',
  day: '/ day',
};

type PricingType = 'fixed' | 'hourly' | 'daily' | 'retainer' | 'mixed';

const PRICING_TYPE_OPTIONS: { value: PricingType; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'retainer', label: 'Retainer' },
  { value: 'mixed', label: 'Mixed' },
];

function inferPricingType(items: LineItem[]): PricingType {
  if (!items.length) return 'fixed';
  const units = new Set(items.map((item) => item.unit));
  if (units.size > 1) return 'mixed';
  if (units.has('hr')) return 'hourly';
  if (units.has('day')) return 'daily';
  return 'fixed';
}

function defaultExpiresAtIso(from = new Date()) {
  const d = new Date(from);
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + 14);
  return d.toISOString();
}

function daysUntilExpiry(iso: string) {
  const end = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function formatExpiryLabel(iso: string) {
  const days = daysUntilExpiry(iso);
  if (days === 14) return "14 days";
  if (days <= 0) return "Expired";
  if (days === 1) return "1 day";
  if (days < 90) return `${days} days`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatHeaderDate(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatPreparedFor(name: string | null | undefined, company: string | null | undefined) {
  const person = name?.trim() || "";
  const org = company?.trim() || "";
  if (person && org && person.toLowerCase() !== org.toLowerCase()) {
    return `${person} · ${org}`;
  }
  return person || org || "";
}

function toDateInputValue(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return defaultExpiresAtIso();
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

function parseLocalDateValue(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const startOffset = first.getDay(); // Sunday = 0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function ProposalEditorPage() {
  return (
    <Suspense fallback={<div className="h-full min-h-0 bg-[#F7F8FA] flex flex-col font-sans"></div>}>
      <ProposalEditorContent />
    </Suspense>
  );
}

function ProposalEditorContent() {
  const params = useParams();
  const router = useRouter();
  const proposalId = typeof params.id === "string" ? params.id : "";
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template') || 'marketing';
  const { organizationId, fullName, logoUrl } = useProfile();
  const freelancerName = fullName?.trim() || "";

  const [proposalTitle, setProposalTitle] = useState('Untitled proposal');
  const [activeSection, setActiveSection] = useState<SectionType>('global');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeElement, setActiveElement] = useState<{ id: string, type: ElementKind } | null>(null);
  const [elementStyles, setElementStyles] = useState<Record<string, ElementStyle>>(DEFAULT_ELEMENT_STYLES);
  const [blocks, setBlocks] = useState<CanvasBlock[]>(() => getInitialBlocks(templateId));
  const [addMenuFor, setAddMenuFor] = useState<string | null>(null); // block id after which to insert, or 'header' / 'end'
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<BlockType | null>(null);
  const [draggingElementKind, setDraggingElementKind] = useState<ElementPaletteKind | null>(null);
  const [elementDropTarget, setElementDropTarget] = useState<string | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState('consulting');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const [needsAiGenerate, setNeedsAiGenerate] = useState(false);
  const [aiWriteOpen, setAiWriteOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [proposalClientId, setProposalClientId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [defaultFollowUpSequence, setDefaultFollowUpSequence] = useState<
    Exclude<FollowUpSequenceKey, "none">
  >("standard");
  const [sendAgainFeedback, setSendAgainFeedback] = useState<{
    to: string;
  } | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [sendMenuBusy, setSendMenuBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [proposalStatus, setProposalStatus] = useState<Enums<"proposal_status"> | null>(null);
  const [resumeStatus, setResumeStatus] = useState<Enums<"proposal_status"> | null>(null);
  const [clientShareUrl, setClientShareUrl] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientCompany, setClientCompany] = useState<string | null>(null);
  const [clientPersonName, setClientPersonName] = useState<string | null>(null);
  const [lastRecipientEmail, setLastRecipientEmail] = useState<string | null>(null);
  const [lastRecipientName, setLastRecipientName] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string>(() => defaultExpiresAtIso());
  const [expiryModalOpen, setExpiryModalOpen] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState(() =>
    toDateInputValue(defaultExpiresAtIso())
  );
  const [expiryCalendarMonth, setExpiryCalendarMonth] = useState(() =>
    startOfMonth(new Date(defaultExpiresAtIso()))
  );

  const updateElementStyle = (id: string, patch: Partial<ElementStyle>) => {
    setElementStyles((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const getTextStyle = (id: string): React.CSSProperties => {
    const style = elementStyles[id] || {};
    return {
      fontFamily: style.fontFamily === 'Georgia' ? 'Georgia, serif' : 'Inter, system-ui, sans-serif',
      fontWeight: FONT_WEIGHT_MAP[style.fontWeight || 'Normal'] || 400,
      color: style.color,
      fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
      lineHeight: style.lineHeight,
    };
  };

  // Helper to handle section clicks
  const handleSectionClick = (type: SectionType, blockId: string = type) => {
    if (type === 'global') {
      setActiveSection('global');
      setActiveBlockId(null);
      setActiveElement(null);
      setAddMenuFor(null);
      setEditingItemId(null);
      setIsAddingItem(false);
      setEditingEntry(null);
      return;
    }
    setActiveSection(type);
    setActiveBlockId(blockId);
    setActiveElement(null);
    setAddMenuFor(null);
    setEditingEntry(null);
    if (type !== 'pricing') {
      setEditingItemId(null);
      setIsAddingItem(false);
    }
    setMobileInspectorOpen(true);
  };

  // Helper to handle element clicks
  const handleElementClick = (e: React.MouseEvent, type: ElementKind, id: string, sectionId: SectionType, blockId?: string) => {
    e.stopPropagation();
    setActiveSection(sectionId);
    setActiveBlockId(blockId || sectionId);
    setActiveElement({ id, type });
    setAddMenuFor(null);
    setEditingItemId(null);
    setIsAddingItem(false);
    setEditingEntry(null);
    setMobileInspectorOpen(true);
  };

  const deleteActiveElement = () => {
    if (!activeElement) return;
    const elId = activeElement.id;
    const isExtra = Object.values(sectionElements).some((els) => els.some((el) => el.id === elId));
    if (isExtra) {
      setSectionElements((prev) => {
        const next: Record<string, InSectionElement[]> = {};
        for (const [blockId, els] of Object.entries(prev)) {
          next[blockId] = els.filter((el) => el.id !== elId);
        }
        return next;
      });
      setElementStyles((prev) => {
        const next = { ...prev };
        delete next[elId];
        return next;
      });
    } else {
      updateElementStyle(elId, { content: '' });
    }
    setActiveElement(null);
  };

  const addElementToSection = (blockId: string, kind: ElementPaletteKind, sectionId: SectionType) => {
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaults: ElementStyle =
      kind === 'heading'
        ? { content: 'New heading', fontFamily: 'Inter', fontWeight: 'Bold', color: '#111827', fontSize: 20, lineHeight: 1.3 }
        : kind === 'text'
          ? { content: 'Add your text here…', fontFamily: 'Inter', fontWeight: 'Normal', color: '#4B5563', fontSize: 14, lineHeight: 1.6 }
          : {
              src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80',
              borderRadius: 12,
              opacity: 100,
            };
    setElementStyles((prev) => ({ ...prev, [id]: defaults }));
    setSectionElements((prev) => ({
      ...prev,
      [blockId]: [...(prev[blockId] || []), { id, kind }],
    }));
    setActiveElement({ id, type: kind === 'heading' ? 'heading' : kind === 'text' ? 'text' : 'image' });
    setActiveSection(sectionId);
    setActiveBlockId(blockId);
    setEditingEntry(null);
    setDraggingElementKind(null);
    setElementDropTarget(null);
  };

  const removeSectionElement = (blockId: string, elId: string) => {
    setSectionElements((prev) => ({
      ...prev,
      [blockId]: (prev[blockId] || []).filter((x) => x.id !== elId),
    }));
    setElementStyles((prev) => {
      const next = { ...prev };
      delete next[elId];
      return next;
    });
    if (activeElement?.id === elId) setActiveElement(null);
  };

  const renderSectionExtras = (blockId: string, sectionId: SectionType) => {
    const extras = sectionElements[blockId] || [];
    if (extras.length === 0) return null;
    return (
      <div className="mt-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        {extras.map((el) => (
          <div key={el.id} className="group relative">
            {el.kind === 'image' ? (
              <div
                className={`overflow-hidden cursor-pointer border-2 transition-colors ${
                  activeElement?.id === el.id ? 'border-blue-400' : 'border-transparent hover:border-blue-200'
                }`}
                style={{ borderRadius: `${elementStyles[el.id]?.borderRadius ?? 12}px` }}
                onClick={(e) => handleElementClick(e, 'image', el.id, sectionId, blockId)}
              >
                <img
                  src={elementStyles[el.id]?.src || ''}
                  alt=""
                  className="w-full h-[220px] object-cover block"
                  style={{ opacity: (elementStyles[el.id]?.opacity ?? 100) / 100 }}
                />
              </div>
            ) : (
              <InlineEditableText
                as={el.kind === 'heading' ? 'h3' : 'p'}
                id={el.id}
                type={el.kind === 'heading' ? 'heading' : 'text'}
                sectionId={sectionId}
                style={getTextStyle(el.id)}
                content={elementStyles[el.id]?.content || ''}
                isActive={activeElement?.id === el.id}
                onSelect={(e) => handleElementClick(e, el.kind === 'heading' ? 'heading' : 'text', el.id, sectionId, blockId)}
                onChange={(value) => updateElementStyle(el.id, { content: value })}
              />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeSectionElement(blockId, el.id);
              }}
              className="absolute -right-6 top-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove element"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderElementPalette = () => (
    // Desktop only — on mobile, add via the canvas + button (no drag palette).
    <div className="mb-5 hidden md:block">
      <label className="block text-xs font-bold text-gray-900 mb-1">Elements</label>
      <p className="text-[11px] text-gray-500 mb-3">Drag an element into this section</p>
      <div className="grid grid-cols-3 gap-2">
        {ELEMENT_PALETTE.map((item) => (
          <div
            key={item.kind}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-element-kind', item.kind);
              e.dataTransfer.effectAllowed = 'copy';
              setDraggingElementKind(item.kind);
              setDraggingType(null);
            }}
            onDragEnd={() => {
              setDraggingElementKind(null);
              setElementDropTarget(null);
            }}
            className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-lg border bg-white cursor-grab active:cursor-grabbing transition-colors ${
              draggingElementKind === item.kind
                ? 'border-emerald-500 ring-1 ring-emerald-500'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {item.kind === 'heading' && <Type className="w-4 h-4 text-gray-500" />}
            {item.kind === 'text' && <AlignLeft className="w-4 h-4 text-gray-500" />}
            {item.kind === 'image' && <ImageIcon className="w-4 h-4 text-gray-500" />}
            <span className="text-[11px] font-semibold text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const insertBlockAt = (palette: PaletteItem, afterId: string | 'header' | 'end') => {
    const newBlock: CanvasBlock = {
      id: createBlockId(),
      type: palette.type,
      variant: palette.variant,
    };
    setBlocks((prev) => {
      if (afterId === 'header') return [newBlock, ...prev];
      if (afterId === 'end') return [...prev, newBlock];
      const idx = prev.findIndex((b) => b.id === afterId);
      if (idx === -1) return [...prev, newBlock];
      const next = [...prev];
      next.splice(idx + 1, 0, newBlock);
      return next;
    });
    setActiveSection(palette.type);
    setActiveBlockId(newBlock.id);
    setActiveElement(null);
    setAddMenuFor(null);
    setDropTarget(null);
    setDraggingType(null);
  };

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (activeBlockId === blockId) {
      setActiveSection('global');
      setActiveBlockId(null);
      setActiveElement(null);
    }
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handlePaletteDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData('application/x-section-type', item.type);
    if (item.variant) e.dataTransfer.setData('application/x-section-variant', item.variant);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingType(item.type);
  };

  const handlePaletteDragEnd = () => {
    setDraggingType(null);
    setDropTarget(null);
  };

  const handleDropAt = (e: React.DragEvent, afterId: string | 'header' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    const type = e.dataTransfer.getData('application/x-section-type') as BlockType;
    const variant = (e.dataTransfer.getData('application/x-section-variant') || undefined) as CanvasBlock['variant'];
    if (!type) return;
    insertBlockAt({ type, label: type, variant }, afterId);
  };
  
  type HeaderLayout = {
    backgroundImage: string;
    backgroundImagePath?: string;
    overlayOpacity: number;
    shellBackgroundColor: string;
    contentBackgroundColor: string;
    contentPadding: number;
    contentBorderRadius: number;
  };

  const MAX_HEADER_IMAGE_BYTES = 5 * 1024 * 1024;

  const HEADER_THEME_PRESETS: Record<ThemeType, HeaderLayout> = {
    cover: {
      backgroundImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80',
      overlayOpacity: 55,
      shellBackgroundColor: '#111827',
      contentBackgroundColor: 'transparent',
      contentPadding: 8,
      contentBorderRadius: 0,
    },
    classic: {
      backgroundImage: '',
      overlayOpacity: 0,
      shellBackgroundColor: '#FFFFFF',
      contentBackgroundColor: 'transparent',
      contentPadding: 0,
      contentBorderRadius: 0,
    },
    pastel: {
      backgroundImage: '',
      overlayOpacity: 0,
      shellBackgroundColor: '#FAF7F2',
      contentBackgroundColor: '#FFFFFF',
      contentPadding: 40,
      contentBorderRadius: 16,
    },
    alpine: {
      backgroundImage: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80',
      overlayOpacity: 28,
      shellBackgroundColor: '#E7EEF3',
      contentBackgroundColor: '#FFFFFF',
      contentPadding: 36,
      contentBorderRadius: 18,
    },
    splash: {
      backgroundImage: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80',
      overlayOpacity: 42,
      shellBackgroundColor: '#0F172A',
      contentBackgroundColor: 'transparent',
      contentPadding: 20,
      contentBorderRadius: 0,
    },
    auburn: {
      backgroundImage: '',
      overlayOpacity: 0,
      shellBackgroundColor: '#3F2417',
      contentBackgroundColor: '#FFF8F1',
      contentPadding: 40,
      contentBorderRadius: 14,
    },
  };

  const themeFromTemplateParam = (): ThemeType => {
    if (templateId === 'creative' || templateId === 'tech') return 'cover';
    if (templateId === 'minimalist' || templateId === 'blank') return 'classic';
    return 'pastel';
  };

  // Set initial header theme based on the selected template
  const [headerTheme, setHeaderTheme] = useState<ThemeType>(themeFromTemplateParam);
  const [headerLayout, setHeaderLayout] = useState<HeaderLayout>(
    () => HEADER_THEME_PRESETS[themeFromTemplateParam()]
  );

  const updateHeaderLayout = (patch: Partial<HeaderLayout>) => {
    setHeaderLayout((prev) => ({ ...prev, ...patch }));
  };

  const applyHeaderTheme = (theme: ThemeType) => {
    setHeaderTheme(theme);
    setHeaderLayout(HEADER_THEME_PRESETS[theme]);
  };

  const headerImageInputRef = useRef<HTMLInputElement>(null);
  const [headerImageUploading, setHeaderImageUploading] = useState(false);
  const [headerImageError, setHeaderImageError] = useState<string | null>(null);

  async function resolveHeaderImageUrl(pathOrUrl: string | null | undefined) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
      return pathOrUrl;
    }
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("org-assets")
      .createSignedUrl(pathOrUrl, 60 * 60 * 24 * 365);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }

  async function handleHeaderImageUpload(file: File | null) {
    if (!file) return;
    if (!organizationId || !proposalId) {
      setHeaderImageError("Save the proposal before uploading an image.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setHeaderImageError("Please choose a PNG, JPG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_HEADER_IMAGE_BYTES) {
      setHeaderImageError("Image must be 5MB or smaller.");
      return;
    }

    setHeaderImageUploading(true);
    setHeaderImageError(null);

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt =
        ext === "jpeg" ? "jpg" : ["png", "jpg", "webp", "gif"].includes(ext) ? ext : "jpg";
      const path = `${organizationId}/proposals/${proposalId}/header-${Date.now()}.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from("org-assets")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw new Error(uploadError.message);

      const signedUrl = await resolveHeaderImageUrl(path);
      if (!signedUrl) throw new Error("Could not create image URL.");

      updateHeaderLayout({
        backgroundImage: signedUrl,
        backgroundImagePath: path,
        overlayOpacity:
          headerLayout.overlayOpacity > 0 ? headerLayout.overlayOpacity : 45,
      });
    } catch (err) {
      setHeaderImageError(
        err instanceof Error ? err.message : "Failed to upload image."
      );
    } finally {
      setHeaderImageUploading(false);
      if (headerImageInputRef.current) headerImageInputRef.current.value = "";
    }
  }

  const [overviewOpen, setOverviewOpen] = useState(true);
  const [styleOpen, setStyleOpen] = useState(true);
  const [addSectionOpen, setAddSectionOpen] = useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: 'item-1',
      title: 'Brand Discovery Workshop',
      description: 'Facilitate workshop. Brainstorm brand-related principles, objectives and ideas with workshop attendees. Submit Brand Discovery Report highlighting key outcomes and suggestions resulting from the brainstorming exercise.',
      qty: 7,
      price: 80,
      unit: 'hr',
    },
    {
      id: 'item-2',
      title: 'Brand Guidelines',
      description: 'Intervention includes five specific stages to establish brand guidelines. 1. Establish brand ethos and objectives. 2. Define users/customers 3. Choose appropriate brand format. 4. Determine definitive guideline variables based on prior stages. 5. Assemble guidelines.',
      qty: 4,
      price: 80,
      unit: 'hr',
    },
  ]);
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [pricingType, setPricingType] = useState<PricingType>('hourly');
  const [proposalAmount, setProposalAmount] = useState(0);
  const [amountFocused, setAmountFocused] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  const [scopeIncluded, setScopeIncluded] = useState<ScopeEntry[]>(DEFAULT_SCOPE_INCLUDED);
  const [scopeExcluded, setScopeExcluded] = useState<ScopeEntry[]>(DEFAULT_SCOPE_EXCLUDED);
  const [timelinePhases, setTimelinePhases] = useState<TimelinePhase[]>(DEFAULT_TIMELINE);
  const [paymentMilestones, setPaymentMilestones] = useState<PaymentMilestone[]>(DEFAULT_PAYMENT);
  const [termEntries, setTermEntries] = useState<TermEntry[]>(DEFAULT_TERMS);
  const [editingEntry, setEditingEntry] = useState<{ kind: ListEditKind; id: string } | null>(null);
  const [sectionElements, setSectionElements] = useState<Record<string, InSectionElement[]>>({});
  const [projectGoals, setProjectGoals] = useState<ScopeEntry[]>(DEFAULT_GOALS);
  const [keyDeliverables, setKeyDeliverables] = useState<ScopeEntry[]>(DEFAULT_DELIVERABLES);
  const [approachSteps, setApproachSteps] = useState<ApproachStep[]>(DEFAULT_APPROACH);
  const [clientResponsibilities, setClientResponsibilities] = useState<ScopeEntry[]>(DEFAULT_RESPONSIBILITIES);
  const [aboutStats, setAboutStats] = useState<AboutStat[]>(DEFAULT_ABOUT_STATS);
  const [sectionStyles, setSectionStyles] = useState<Record<string, { backgroundColor?: string; paddingTop?: number; paddingBottom?: number }>>({});

  const applyContentSnapshot = useCallback((content: ProposalContentSnapshot) => {
    const rawTheme = (content.headerTheme || themeFromTemplateParam()) as ThemeType;
    const theme = HEADER_THEME_PRESETS[rawTheme] ? rawTheme : themeFromTemplateParam();
    setHeaderTheme(theme);
    if (content.headerLayout && typeof content.headerLayout === 'object') {
      const layout = {
        ...HEADER_THEME_PRESETS[theme],
        ...(content.headerLayout as Partial<HeaderLayout>),
      };
      setHeaderLayout(layout);
      const path = layout.backgroundImagePath;
      if (path && !path.startsWith("http")) {
        void resolveHeaderImageUrl(path).then((url) => {
          if (url) {
            setHeaderLayout((prev) => ({
              ...prev,
              backgroundImage: url,
              backgroundImagePath: path,
            }));
          }
        });
      }
    } else {
      setHeaderLayout(HEADER_THEME_PRESETS[theme]);
    }

    const types = blockTypesFromContent(content);
    setBlocks(
      types.map((type) => ({
        id: createBlockId(),
        type: type as BlockType,
      }))
    );

    if (content.elementStyles && typeof content.elementStyles === 'object') {
      setElementStyles(
        mergeElementStyles(
          DEFAULT_ELEMENT_STYLES as unknown as Record<string, unknown>,
          content.elementStyles as Record<string, unknown>
        ) as Record<string, ElementStyle>
      );
    }
    if (Array.isArray(content.lineItems) && content.lineItems.length) {
      setLineItems(content.lineItems as LineItem[]);
    }
    if (content.currency && content.currency in CURRENCY_META) {
      setCurrency(content.currency as CurrencyCode);
    }
    if (content.pricingType) {
      setPricingType(content.pricingType);
    } else if (Array.isArray(content.lineItems) && content.lineItems.length) {
      setPricingType(inferPricingType(content.lineItems as LineItem[]));
    }
    if (Array.isArray(content.scopeIncluded)) setScopeIncluded(content.scopeIncluded as ScopeEntry[]);
    if (Array.isArray(content.scopeExcluded)) setScopeExcluded(content.scopeExcluded as ScopeEntry[]);
    if (Array.isArray(content.timelinePhases)) setTimelinePhases(content.timelinePhases as TimelinePhase[]);
    if (Array.isArray(content.paymentMilestones)) setPaymentMilestones(content.paymentMilestones as PaymentMilestone[]);
    if (Array.isArray(content.termEntries)) setTermEntries(content.termEntries as TermEntry[]);
    if (Array.isArray(content.projectGoals)) setProjectGoals(content.projectGoals as ScopeEntry[]);
    if (Array.isArray(content.keyDeliverables)) setKeyDeliverables(content.keyDeliverables as ScopeEntry[]);
    if (Array.isArray(content.approachSteps)) {
      setApproachSteps(normalizeApproachSteps(content.approachSteps));
    }
    if (Array.isArray(content.clientResponsibilities)) {
      setClientResponsibilities(content.clientResponsibilities as ScopeEntry[]);
    }
    if (Array.isArray(content.aboutStats)) setAboutStats(content.aboutStats as AboutStat[]);
    if (content.sectionStyles && typeof content.sectionStyles === 'object') {
      setSectionStyles(content.sectionStyles as typeof sectionStyles);
    }
    if (content.sectionElements && typeof content.sectionElements === 'object') {
      setSectionElements(content.sectionElements as Record<string, InSectionElement[]>);
    }
  }, [templateId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    async function loadOrgFollowUpDefault() {
      const supabase = createClient();
      const { data } = await supabase
        .from("organizations")
        .select("default_proposal_followup_sequence")
        .eq("id", organizationId!)
        .maybeSingle();
      if (cancelled || !data) return;
      setDefaultFollowUpSequence(
        asOrgFollowUpSequence(data.default_proposal_followup_sequence)
      );
    }
    void loadOrgFollowUpDefault();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!proposalId) {
      setContentReady(true);
      return;
    }

    let cancelled = false;
    async function loadProposal() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('proposals')
        .select(
          'id, title, content, currency, amount, template_id, client_id, project_id, expires_at, status, sent_at, viewed_at, accepted_at, declined_at'
        )
        .eq('id', proposalId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setContentReady(true);
        return;
      }

      setProposalTitle(data.title || 'Untitled proposal');
      setProposalStatus(data.status);
      setLinkedProjectId(data.project_id || null);
      setProposalClientId(data.client_id || null);
      if (data.status === 'draft') {
        setResumeStatus(
          resumeStatusFromTimestamps({
            sent_at: data.sent_at,
            viewed_at: data.viewed_at,
            accepted_at: data.accepted_at,
            declined_at: data.declined_at,
          })
        );
      } else {
        setResumeStatus(null);
      }
      if (data.currency && data.currency in CURRENCY_META) {
        setCurrency(data.currency as CurrencyCode);
      }
      if (typeof data.amount === 'number') {
        setProposalAmount(Number(data.amount) || 0);
      }

      const nextExpiry = data.expires_at || defaultExpiresAtIso();
      setExpiresAt(nextExpiry);
      setExpiryDraft(toDateInputValue(nextExpiry));
      if (!data.expires_at) {
        await supabase
          .from('proposals')
          .update({ expires_at: nextExpiry })
          .eq('id', proposalId);
      }

      if (data.client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('name, company, email')
          .eq('id', data.client_id)
          .maybeSingle();
        if (!cancelled && client) {
          setClientEmail(client.email);
          setClientPersonName(client.name);
          setClientCompany(client.company);
          setClientName(
            formatPreparedFor(client.name, client.company) ||
              client.company ||
              client.name
          );
        }
      }

      const { data: shareLink } = await supabase
        .from('proposal_share_links')
        .select('token, recipient_email, recipient_name')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        const appUrl = (
          process.env.NEXT_PUBLIC_APP_URL ||
          (typeof window !== 'undefined' ? window.location.origin : '')
        ).replace(/\/$/, '');
        setClientShareUrl(
          shareLink?.token && appUrl ? `${appUrl}/p/${shareLink.token}` : null
        );
        setLastRecipientEmail(shareLink?.recipient_email || null);
        setLastRecipientName(shareLink?.recipient_name || null);
      }

      const content = asProposalContent(data.content);
      const hasTemplateShape =
        Boolean(content.blockTypes?.length) ||
        Boolean(content.blocks?.length) ||
        Boolean(content.headerTheme) ||
        Boolean(content.elementStyles);

      if (hasTemplateShape) {
        applyContentSnapshot(content);
      } else if (data.template_id) {
        const { data: template } = await supabase
          .from('proposal_templates')
          .select('content, header_theme')
          .eq('id', data.template_id)
          .maybeSingle();
        if (!cancelled && template) {
          applyContentSnapshot({
            ...asProposalContent(template.content),
            headerTheme: (template.header_theme as ProposalHeaderTheme) || undefined,
          });
        }
      }

      const meta = (content.meta || {}) as {
        creationMode?: string;
        aiBrief?: string;
      };
      const summaryText =
        (
          content.elementStyles as
            | Record<string, { content?: string }>
            | undefined
        )?.["summary-text"]?.content || "";
      const goalsCount = Array.isArray(content.projectGoals)
        ? content.projectGoals.length
        : 0;
      const brief = typeof meta.aiBrief === "string" ? meta.aiBrief.trim() : "";
      setNeedsAiGenerate(
        meta.creationMode === "ai" &&
          brief.length >= 40 &&
          (!summaryText.trim() || goalsCount === 0)
      );

      setContentReady(true);
    }

    void loadProposal();
    return () => {
      cancelled = true;
    };
  }, [proposalId, applyContentSnapshot]);

  function buildContentSnapshot(): ProposalContentSnapshot {
    return {
      version: 1,
      headerTheme: headerTheme as ProposalHeaderTheme,
      headerLayout: headerLayout as unknown as Record<string, unknown>,
      blockTypes: blocks.map((b) => b.type),
      blocks: blocks.map((b) => ({ type: b.type, variant: b.variant ?? null })),
      elementStyles: elementStyles as unknown as Record<string, unknown>,
      lineItems,
      currency,
      pricingType,
      scopeIncluded,
      scopeExcluded,
      timelinePhases,
      paymentMilestones,
      termEntries,
      projectGoals,
      keyDeliverables,
      approachSteps,
      clientResponsibilities,
      aboutStats,
      sectionStyles: sectionStyles as unknown as Record<string, unknown>,
      sectionElements: sectionElements as unknown as Record<string, unknown>,
    };
  }

  async function persistProposalContent() {
    if (!proposalId) return;
    const supabase = createClient();
    await supabase
      .from('proposals')
      .update({
        content: toProposalContentJson(buildContentSnapshot()),
        title: proposalTitle,
        expires_at: expiresAt,
        amount: proposalAmount,
        currency,
      })
      .eq('id', proposalId);
  }

  async function handleSaveDraft() {
    if (!proposalId || draftSaving || sendMenuBusy) return;
    setDraftSaving(true);
    try {
      await persistProposalContent();
      setTemplateMessage("Draft saved");
      window.setTimeout(() => setTemplateMessage(null), 2200);
    } finally {
      setDraftSaving(false);
    }
  }

  useEffect(() => {
    setPortalReady(true);
  }, []);

  async function persistOverviewPricing(next: {
    amount?: number;
    pricingType?: PricingType;
    currency?: CurrencyCode;
  }) {
    if (!proposalId) return;
    const supabase = createClient();
    const patch: {
      amount?: number;
      currency?: string;
      content?: ReturnType<typeof toProposalContentJson>;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };
    if (typeof next.amount === 'number') patch.amount = next.amount;
    if (next.currency) patch.currency = next.currency;
    if (next.pricingType) {
      patch.content = toProposalContentJson({
        ...buildContentSnapshot(),
        pricingType: next.pricingType,
      });
    }
    await supabase.from('proposals').update(patch).eq('id', proposalId);
  }

  async function saveExpiryDate(nextIso: string) {
    setExpiresAt(nextIso);
    setExpiryDraft(toDateInputValue(nextIso));
    setExpiryModalOpen(false);
    if (!proposalId) return;
    const supabase = createClient();
    await supabase
      .from('proposals')
      .update({ expires_at: nextIso, updated_at: new Date().toISOString() })
      .eq('id', proposalId);
  }

  async function handleSaveAsTemplate() {
    if (!organizationId || !templateName.trim()) return;
    setSavingTemplate(true);
    setTemplateMessage(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const snapshot = buildContentSnapshot();
    const { error } = await supabase.from('proposal_templates').insert({
      organization_id: organizationId,
      created_by: user?.id ?? null,
      name: templateName.trim(),
      category: templateCategory,
      is_system: false,
      is_blank: false,
      header_theme: headerTheme,
      thumbnail_url: headerLayout.backgroundImage || null,
      content: toProposalContentJson(snapshot),
    });

    setSavingTemplate(false);

    if (error) {
      setTemplateMessage(error.message);
      return;
    }

    await persistProposalContent();
    setSaveTemplateOpen(false);
    setTemplateName('');
    setTemplateMessage('Template saved.');
    window.setTimeout(() => setTemplateMessage(null), 2200);
  }

  const updateSectionStyle = (blockId: string, patch: { backgroundColor?: string; paddingTop?: number; paddingBottom?: number }) => {
    setSectionStyles((prev) => ({
      ...prev,
      [blockId]: { ...prev[blockId], ...patch },
    }));
  };

  const activeSectionStyle = activeBlockId ? sectionStyles[activeBlockId] || {} : {};

  const formatMoney = (amount: number) => {
    const { symbol } = CURRENCY_META[currency];
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const pricingTotal = lineItems.reduce((sum, item) => sum + item.qty * item.price, 0);

  useEffect(() => {
    if (!contentReady || amountFocused) return;
    setProposalAmount(pricingTotal);
  }, [pricingTotal, contentReady, amountFocused]);

  const proposalDateLabel = formatHeaderDate(new Date());
  const expiryDateLabel = formatHeaderDate(expiresAt);
  const preparedForLabel = formatPreparedFor(clientPersonName, clientCompany);

  useEffect(() => {
    setElementStyles((prev) => {
      const nextDate = prev["header-date"]?.content === proposalDateLabel
        ? prev["header-date"]
        : { ...prev["header-date"], content: proposalDateLabel };
      const nextValidity = prev["header-validity"]?.content === expiryDateLabel
        ? prev["header-validity"]
        : { ...prev["header-validity"], content: expiryDateLabel };
      const nextClient =
        !preparedForLabel || prev["header-client"]?.content === preparedForLabel
          ? prev["header-client"]
          : { ...prev["header-client"], content: preparedForLabel };
      const nextToName =
        !preparedForLabel || prev["header-to-name"]?.content === preparedForLabel
          ? prev["header-to-name"]
          : { ...prev["header-to-name"], content: preparedForLabel };
      const coverSubtitle = preparedForLabel
        ? `Prepared for ${preparedForLabel}`
        : prev["header-cover-subtitle"]?.content;
      const nextCover =
        !coverSubtitle || prev["header-cover-subtitle"]?.content === coverSubtitle
          ? prev["header-cover-subtitle"]
          : { ...prev["header-cover-subtitle"], content: coverSubtitle };
      const nextLogoName =
        !freelancerName || prev["header-logo-name"]?.content === freelancerName
          ? prev["header-logo-name"]
          : { ...prev["header-logo-name"], content: freelancerName };
      const nextFromName =
        !freelancerName || prev["header-from-name"]?.content === freelancerName
          ? prev["header-from-name"]
          : { ...prev["header-from-name"], content: freelancerName };

      if (
        nextDate === prev["header-date"] &&
        nextValidity === prev["header-validity"] &&
        nextClient === prev["header-client"] &&
        nextToName === prev["header-to-name"] &&
        nextCover === prev["header-cover-subtitle"] &&
        nextLogoName === prev["header-logo-name"] &&
        nextFromName === prev["header-from-name"]
      ) {
        return prev;
      }
      return {
        ...prev,
        "header-date": nextDate,
        "header-validity": nextValidity,
        "header-client": nextClient,
        "header-to-name": nextToName,
        "header-cover-subtitle": nextCover,
        "header-logo-name": nextLogoName,
        "header-from-name": nextFromName,
      };
    });
  }, [proposalDateLabel, expiryDateLabel, preparedForLabel, freelancerName]);

  const updateLineItem = (id: string, patch: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
    if (editingItemId === id) setEditingItemId(null);
  };

  const addLineItemFromCatalog = (catalogItem: Omit<LineItem, 'id' | 'qty'>, qty = 1) => {
    const newItem: LineItem = {
      id: `item-${Date.now()}`,
      title: catalogItem.title,
      description: catalogItem.description,
      price: catalogItem.price,
      unit: catalogItem.unit,
      qty,
    };
    setLineItems((prev) => [...prev, newItem]);
    setIsAddingItem(false);
    setItemSearch('');
    setEditingItemId(newItem.id);
  };

  const addBlankLineItem = () => {
    const newItem: LineItem = {
      id: `item-${Date.now()}`,
      title: itemSearch.trim() || 'New Line Item',
      description: 'Describe this deliverable...',
      qty: 1,
      price: 0,
      unit: 'flat',
    };
    setLineItems((prev) => [...prev, newItem]);
    setIsAddingItem(false);
    setItemSearch('');
    setEditingItemId(newItem.id);
  };

  const filteredCatalog = ITEM_CATALOG.filter((item) => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return true;
    return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
  });

  const handleCanvasClick = () => {
    setActiveSection('global');
    setActiveBlockId(null);
    setActiveElement(null);
    setEditingItemId(null);
    setIsAddingItem(false);
    setEditingEntry(null);
    setAddMenuFor(null);
  };

  const startEditingEntry = (kind: ListEditKind, id: string, section: SectionType, blockId: string) => {
    setActiveSection(section);
    setActiveBlockId(blockId);
    setActiveElement(null);
    setEditingEntry({ kind, id });
    setEditingItemId(null);
    setIsAddingItem(false);
  };

  const addScopeEntry = (list: 'included' | 'excluded') => {
    const entry: ScopeEntry = { id: createEntryId(), text: list === 'included' ? 'New included item' : 'New excluded item' };
    if (list === 'included') setScopeIncluded((prev) => [...prev, entry]);
    else setScopeExcluded((prev) => [...prev, entry]);
    setEditingEntry({ kind: list === 'included' ? 'scope-included' : 'scope-excluded', id: entry.id });
  };

  const removeScopeEntry = (list: 'included' | 'excluded', id: string) => {
    if (list === 'included') setScopeIncluded((prev) => prev.filter((e) => e.id !== id));
    else setScopeExcluded((prev) => prev.filter((e) => e.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const updateScopeEntry = (list: 'included' | 'excluded', id: string, text: string) => {
    if (list === 'included') setScopeIncluded((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
    else setScopeExcluded((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const addTimelinePhase = () => {
    const phase: TimelinePhase = { id: createEntryId(), week: 'Week', title: 'New phase', detail: 'Describe deliverables for this phase…' };
    setTimelinePhases((prev) => [...prev, phase]);
    setEditingEntry({ kind: 'timeline', id: phase.id });
  };

  const updateTimelinePhase = (id: string, patch: Partial<TimelinePhase>) => {
    setTimelinePhases((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removeTimelinePhase = (id: string) => {
    setTimelinePhases((prev) => prev.filter((p) => p.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const addPaymentMilestone = () => {
    const milestone: PaymentMilestone = { id: createEntryId(), label: 'New milestone', pct: '0%', when: 'Due date' };
    setPaymentMilestones((prev) => [...prev, milestone]);
    setEditingEntry({ kind: 'payment', id: milestone.id });
  };

  const updatePaymentMilestone = (id: string, patch: Partial<PaymentMilestone>) => {
    setPaymentMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const removePaymentMilestone = (id: string) => {
    setPaymentMilestones((prev) => prev.filter((m) => m.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const addTermEntry = () => {
    const term: TermEntry = { id: createEntryId(), title: 'New term', body: 'Describe this term…' };
    setTermEntries((prev) => [...prev, term]);
    setEditingEntry({ kind: 'terms', id: term.id });
  };

  const updateTermEntry = (id: string, patch: Partial<TermEntry>) => {
    setTermEntries((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTermEntry = (id: string) => {
    setTermEntries((prev) => prev.filter((t) => t.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const addGoalEntry = () => {
    const entry: ScopeEntry = { id: createEntryId(), text: 'New project goal' };
    setProjectGoals((prev) => [...prev, entry]);
    setEditingEntry({ kind: 'goals', id: entry.id });
  };

  const updateGoalEntry = (id: string, text: string) => {
    setProjectGoals((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const removeGoalEntry = (id: string) => {
    setProjectGoals((prev) => prev.filter((e) => e.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const addDeliverableEntry = () => {
    const entry: ScopeEntry = { id: createEntryId(), text: 'New deliverable' };
    setKeyDeliverables((prev) => [...prev, entry]);
    setEditingEntry({ kind: 'deliverables', id: entry.id });
  };

  const updateDeliverableEntry = (id: string, text: string) => {
    setKeyDeliverables((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const removeDeliverableEntry = (id: string) => {
    setKeyDeliverables((prev) => prev.filter((e) => e.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const addApproachStep = () => {
    const entry: ApproachStep = {
      id: createEntryId(),
      title: "New step",
      description: "Short description of this phase",
    };
    setApproachSteps((prev) => [...prev, entry]);
    setEditingEntry({ kind: "approach", id: entry.id });
  };

  const updateApproachStep = (id: string, patch: Partial<ApproachStep>) => {
    setApproachSteps((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  };

  const removeApproachStep = (id: string) => {
    setApproachSteps((prev) => prev.filter((e) => e.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const addResponsibility = () => {
    const entry: ScopeEntry = { id: createEntryId(), text: 'New client responsibility' };
    setClientResponsibilities((prev) => [...prev, entry]);
    setEditingEntry({ kind: 'responsibilities', id: entry.id });
  };

  const updateResponsibility = (id: string, text: string) => {
    setClientResponsibilities((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const removeResponsibility = (id: string) => {
    setClientResponsibilities((prev) => prev.filter((e) => e.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const updateAboutStat = (id: string, patch: Partial<AboutStat>) => {
    setAboutStats((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeAboutStat = (id: string) => {
    setAboutStats((prev) => prev.filter((s) => s.id !== id));
    if (editingEntry?.id === id) setEditingEntry(null);
  };

  const addAboutStat = () => {
    const stat: AboutStat = { id: createEntryId(), value: '0', label: 'New metric' };
    setAboutStats((prev) => [...prev, stat]);
    setEditingEntry({ kind: 'about-stat', id: stat.id });
  };

  const getEditableBlockProps = (blockId: string, sectionType: SectionType) => ({
    blockId,
    sectionType,
    activeBlockId,
    onSelect: handleSectionClick,
    addMenuOpen: addMenuFor === blockId,
    onOpenAddMenu: () => setAddMenuFor((prev) => (prev === blockId ? null : blockId)),
    onCloseAddMenu: () => setAddMenuFor(null),
    onAddSection: (item: PaletteItem) => insertBlockAt(item, blockId),
    isDropTarget: dropTarget === blockId,
    onDragOverGap: (e: React.DragEvent) => {
      if (draggingElementKind) return;
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(blockId);
    },
    onDragLeaveGap: () => setDropTarget((prev) => (prev === blockId ? null : prev)),
    onDropAt: (e: React.DragEvent) => {
      const elKind = e.dataTransfer.getData('application/x-element-kind') as ElementPaletteKind;
      if (elKind) {
        e.preventDefault();
        e.stopPropagation();
        addElementToSection(blockId, elKind, sectionType);
        return;
      }
      handleDropAt(e, blockId);
    },
    onMoveUp: sectionType === 'header' ? undefined : () => moveBlock(blockId, -1),
    onMoveDown: sectionType === 'header' ? undefined : () => moveBlock(blockId, 1),
    onDelete: sectionType === 'header' ? undefined : () => removeBlock(blockId),
    draggingActive: !!draggingType,
    isElementDropTarget: elementDropTarget === blockId,
    draggingElement: !!draggingElementKind,
    onElementDragOver: (e: React.DragEvent) => {
      if (!draggingElementKind && !e.dataTransfer.types.includes('application/x-element-kind')) return;
      e.preventDefault();
      e.stopPropagation();
      setElementDropTarget(blockId);
    },
    onElementDragLeave: () => setElementDropTarget((prev) => (prev === blockId ? null : prev)),
    onElementDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const kind = e.dataTransfer.getData('application/x-element-kind') as ElementPaletteKind;
      if (!kind) return;
      addElementToSection(blockId, kind, sectionType);
    },
  });

  // Pre-define reusable block renderers to dynamically assemble templates
  const renderHeaderBlock = () => {
    const {
      backgroundImage,
      overlayOpacity,
      shellBackgroundColor,
      contentBackgroundColor,
      contentPadding,
      contentBorderRadius,
    } = headerLayout;

    const contentIsTransparent =
      !contentBackgroundColor ||
      contentBackgroundColor === 'transparent' ||
      contentBackgroundColor === 'rgba(0,0,0,0)';
    const hasImage = !!backgroundImage;
    const useLightText = contentIsTransparent && (hasImage || overlayOpacity > 20 || shellBackgroundColor === '#111827');

    const muted = useLightText ? 'text-white/60' : 'text-gray-400';
    const label = useLightText ? 'text-white/50' : 'text-gray-400';
    const rule = useLightText ? 'border-white/15' : 'border-line';

    const titleStyle = useLightText
      ? { ...getTextStyle('header-title'), color: '#FFFFFF', fontSize: 40 }
      : getTextStyle('header-title');
    const clientStyle = useLightText
      ? { ...getTextStyle('header-client'), color: '#E5E7EB' }
      : getTextStyle('header-client');
    const logoStyle = useLightText
      ? { ...getTextStyle('header-logo-name'), color: '#FFFFFF' }
      : getTextStyle('header-logo-name');
    const dateStyle = useLightText
      ? { ...getTextStyle('header-date'), color: '#F3F4F6' }
      : getTextStyle('header-date');
    const validityStyle = useLightText
      ? { ...getTextStyle('header-validity'), color: '#F3F4F6' }
      : getTextStyle('header-validity');
    const subtitleStyle = useLightText
      ? { ...getTextStyle('header-subtitle'), color: '#D1D5DB' }
      : getTextStyle('header-subtitle');

    return (
      <EditableBlock key="header" {...getEditableBlockProps('header', 'header')}>
        <div
          className="relative overflow-hidden border-b border-line"
          style={{ backgroundColor: shellBackgroundColor }}
          onClick={(e) => {
            e.stopPropagation();
            handleSectionClick('header', 'header');
          }}
        >
          {hasImage && (
            <img
              src={backgroundImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}
          {(hasImage || overlayOpacity > 0) && (
            <div
              className="absolute inset-0 pointer-events-none bg-black"
              style={{ opacity: Math.min(100, Math.max(0, overlayOpacity)) / 100 }}
            />
          )}

          <div className="relative z-10 px-12 py-14 flex justify-center">
            <div
              className="w-full max-w-3xl"
              style={{
                backgroundColor: contentIsTransparent ? 'transparent' : contentBackgroundColor,
                padding: contentPadding,
                borderRadius: contentBorderRadius,
              }}
            >
              <div className="flex items-center justify-between gap-6 mb-12">
                <div className="flex items-center gap-3 min-w-0">
                  {logoUrl ? (
                    <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 bg-white/10 border border-black/5">
                      <img
                        src={logoUrl}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : null}
                  <InlineEditableText
                    as="div"
                    id="header-logo-name"
                    type="text"
                    sectionId="header"
                    style={logoStyle}
                    content={freelancerName || elementStyles['header-logo-name']?.content || ''}
                    isActive={activeElement?.id === 'header-logo-name'}
                    onSelect={(e) => handleElementClick(e, 'text', 'header-logo-name', 'header')}
                    onChange={() => {
                      // Bound to the freelancer profile name.
                    }}
                  />
                </div>
                <InlineEditableText
                  as="div"
                  id="header-subtitle"
                  type="text"
                  sectionId="header"
                  className={`text-right shrink-0 ${muted}`}
                  style={subtitleStyle}
                  content={elementStyles['header-subtitle']?.content || ''}
                  isActive={activeElement?.id === 'header-subtitle'}
                  onSelect={(e) => handleElementClick(e, 'text', 'header-subtitle', 'header')}
                  onChange={(value) => updateElementStyle('header-subtitle', { content: value })}
                />
              </div>

              <InlineEditableText
                as="h1"
                id="header-title"
                type="heading"
                sectionId="header"
                className="tracking-tight mb-3 max-w-3xl"
                style={titleStyle}
                content={elementStyles['header-title']?.content || ''}
                isActive={activeElement?.id === 'header-title'}
                onSelect={(e) => handleElementClick(e, 'heading', 'header-title', 'header')}
                onChange={(value) => updateElementStyle('header-title', { content: value })}
              />

              <div className={`flex items-baseline gap-2 mb-10 text-[15px] ${muted}`}>
                <span className={label}>Prepared for</span>
                <InlineEditableText
                  as="div"
                  id="header-client"
                  type="text"
                  sectionId="header"
                  style={clientStyle}
                  content={preparedForLabel || elementStyles['header-client']?.content || ''}
                  isActive={activeElement?.id === 'header-client'}
                  onSelect={(e) => handleElementClick(e, 'text', 'header-client', 'header')}
                  onChange={() => {
                    // Bound to the linked client name + company.
                  }}
                />
              </div>

              <div className={`grid grid-cols-2 gap-10 pt-8 border-t ${rule} max-w-xl`}>
                <div>
                  <div className={`text-[11px] font-medium uppercase tracking-wide mb-1.5 ${label}`}>Proposal date</div>
                  <InlineEditableText
                    as="div"
                    id="header-date"
                    type="text"
                    sectionId="header"
                    style={dateStyle}
                    content={proposalDateLabel}
                    isActive={activeElement?.id === 'header-date'}
                    onSelect={(e) => handleElementClick(e, 'text', 'header-date', 'header')}
                    onChange={() => {
                      // Date is live — styling only; content stays current date.
                    }}
                  />
                </div>
                <div>
                  <div className={`text-[11px] font-medium uppercase tracking-wide mb-1.5 ${label}`}>Valid until</div>
                  <InlineEditableText
                    as="div"
                    id="header-validity"
                    type="text"
                    sectionId="header"
                    style={validityStyle}
                    content={expiryDateLabel}
                    isActive={activeElement?.id === 'header-validity'}
                    onSelect={(e) => handleElementClick(e, 'text', 'header-validity', 'header')}
                    onChange={() => {
                      // Driven by Overview expiration — change it there.
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </EditableBlock>
    );
  };

  const renderHeaderStyleControls = () => (
    <div className="mb-5 space-y-5 animate-in fade-in duration-200">
      <div>
        <label className="block text-xs font-bold text-gray-900 mb-2">Background image</label>
        <input
          ref={headerImageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void handleHeaderImageUpload(e.target.files?.[0] ?? null);
          }}
        />
        <button
          type="button"
          disabled={headerImageUploading || !organizationId || !proposalId}
          onClick={() => headerImageInputRef.current?.click()}
          className="w-full py-2.5 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 mb-2 disabled:opacity-50"
        >
          {headerImageUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UploadCloud className="w-4 h-4" />
          )}
          {headerImageUploading
            ? "Uploading…"
            : headerLayout.backgroundImage
              ? "Upload new image"
              : "Upload image"}
        </button>
        {headerLayout.backgroundImage && (
          <div className="mb-2 rounded-lg overflow-hidden border border-gray-200 aspect-[16/9] bg-gray-50">
            <img
              src={headerLayout.backgroundImage}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <input
          type="text"
          value={headerLayout.backgroundImage}
          onChange={(e) =>
            updateHeaderLayout({
              backgroundImage: e.target.value,
              backgroundImagePath: undefined,
            })
          }
          placeholder="Or paste an image URL"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
        />
        {headerImageError && (
          <p className="mt-2 text-[12px] text-red-600">{headerImageError}</p>
        )}
        {headerLayout.backgroundImage && (
          <button
            type="button"
            onClick={() =>
              updateHeaderLayout({
                backgroundImage: "",
                backgroundImagePath: undefined,
                overlayOpacity: 0,
              })
            }
            className="mt-2 text-xs font-semibold text-red-500 hover:text-red-600"
          >
            Remove image
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-900 mb-2">
          Dark overlay opacity
          <span className="ml-2 font-medium text-gray-500">{headerLayout.overlayOpacity}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={90}
          value={headerLayout.overlayOpacity}
          onChange={(e) => updateHeaderLayout({ overlayOpacity: Number(e.target.value) })}
          className="w-full accent-gray-900"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-900 mb-2">Section background</label>
        <p className="text-[11px] text-gray-500 mb-2">Fallback color behind the image (or full background with no image).</p>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={headerLayout.shellBackgroundColor === 'transparent' ? '#111827' : headerLayout.shellBackgroundColor}
            onChange={(e) => updateHeaderLayout({ shellBackgroundColor: e.target.value })}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent p-0"
          />
          <input
            type="text"
            value={headerLayout.shellBackgroundColor}
            onChange={(e) => updateHeaderLayout({ shellBackgroundColor: e.target.value })}
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white uppercase font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-900 mb-2">Content container</label>
        <p className="text-[11px] text-gray-500 mb-2">Background for the header card only. Use transparent for full-bleed text.</p>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="color"
            value={
              !headerLayout.contentBackgroundColor || headerLayout.contentBackgroundColor === 'transparent'
                ? '#FFFFFF'
                : headerLayout.contentBackgroundColor
            }
            onChange={(e) => updateHeaderLayout({ contentBackgroundColor: e.target.value })}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent p-0"
          />
          <input
            type="text"
            value={headerLayout.contentBackgroundColor}
            onChange={(e) => updateHeaderLayout({ contentBackgroundColor: e.target.value })}
            placeholder="transparent or #FFFFFF"
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white font-mono"
          />
        </div>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => updateHeaderLayout({ contentBackgroundColor: 'transparent', contentPadding: 8, contentBorderRadius: 0 })}
            className="flex-1 border border-gray-200 rounded-md py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Transparent
          </button>
          <button
            type="button"
            onClick={() => updateHeaderLayout({ contentBackgroundColor: '#FFFFFF', contentPadding: 40, contentBorderRadius: 16 })}
            className="flex-1 border border-gray-200 rounded-md py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            White card
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Padding</label>
            <input
              type="number"
              min={0}
              value={headerLayout.contentPadding}
              onChange={(e) => updateHeaderLayout({ contentPadding: Number(e.target.value) || 0 })}
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Radius</label>
            <input
              type="number"
              min={0}
              value={headerLayout.contentBorderRadius}
              onChange={(e) => updateHeaderLayout({ contentBorderRadius: Number(e.target.value) || 0 })}
              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderApproachStepsList = (blockId: string) => (
    <div className="group/list">
      <ol className="relative space-y-0">
        {approachSteps.map((item, index) => {
          const isEditing =
            editingEntry?.kind === "approach" && editingEntry.id === item.id;
          const isLast = index === approachSteps.length - 1;
          if (isEditing) {
            return (
              <li key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
                {!isLast && (
                  <div className="absolute left-[17px] top-10 bottom-0 w-px bg-gray-200" />
                )}
                <div className="relative z-10 w-9 h-9 rounded-full bg-gray-900 text-white text-[13px] font-semibold flex items-center justify-center shrink-0">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      Title
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={item.title}
                      onChange={(e) =>
                        updateApproachStep(item.id, { title: e.target.value })
                      }
                      placeholder="Phase title"
                      className="w-full border border-emerald-500 rounded-lg px-3 py-2 text-[15px] font-semibold text-gray-900 outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                      Description
                    </label>
                    <textarea
                      value={item.description}
                      onChange={(e) =>
                        updateApproachStep(item.id, {
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      placeholder="What happens in this phase"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[14px] text-gray-700 outline-none bg-white resize-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => removeApproachStep(item.id)}
                      className="text-[12px] font-semibold text-red-500 hover:text-red-600"
                    >
                      Remove step
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntry(null)}
                      className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </li>
            );
          }
          return (
            <li
              key={item.id}
              className="group relative flex gap-4 pb-6 last:pb-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                startEditingEntry("approach", item.id, "approach", blockId);
              }}
            >
              {!isLast && (
                <div className="absolute left-[17px] top-10 bottom-0 w-px bg-gradient-to-b from-gray-200 to-transparent" />
              )}
              <div className="relative z-10 w-9 h-9 rounded-full bg-gray-900 text-white text-[13px] font-semibold flex items-center justify-center shrink-0 shadow-sm group-hover:bg-emerald-600 transition-colors">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="flex-1 min-w-0 rounded-2xl border border-transparent group-hover:border-gray-200 group-hover:bg-[#FAFBFC] transition-all px-3.5 py-2.5 -ml-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold text-gray-900 tracking-tight">
                      {item.title || "Untitled step"}
                    </div>
                    {item.description ? (
                      <p className="mt-1 text-[14px] text-gray-500 leading-relaxed">
                        {item.description}
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] text-gray-400 italic">
                        Add a description…
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeApproachStep(item.id);
                    }}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                    title="Remove"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setActiveSection("approach");
          setActiveBlockId(blockId);
          addApproachStep();
        }}
        className="mt-4 opacity-100 md:opacity-0 md:group-hover/list:opacity-100 focus:opacity-100 transition-opacity text-emerald-600 hover:text-emerald-700 font-semibold text-sm inline-flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Add step
      </button>
    </div>
  );

  const renderEditableBulletList = (
    blockId: string,
    sectionId: SectionType,
    kind: ListEditKind,
    entries: ScopeEntry[],
    onUpdate: (id: string, text: string) => void,
    onRemove: (id: string) => void,
    onAdd: () => void,
    addLabel: string,
    variant: "dash" | "check" | "deliverable" = "dash",
  ) => {
    const addButton = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setActiveSection(sectionId);
          setActiveBlockId(blockId);
          onAdd();
        }}
        className="mt-4 opacity-100 md:opacity-0 md:group-hover/list:opacity-100 focus:opacity-100 transition-opacity text-emerald-600 hover:text-emerald-700 font-semibold text-sm inline-flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> {addLabel}
      </button>
    );

    if (variant === "check") {
      return (
        <div className="group/list">
          <ul className="space-y-1">
            {entries.map((item) => {
              const isEditing = editingEntry?.kind === kind && editingEntry.id === item.id;
              if (isEditing) {
                return (
                  <li
                    key={item.id}
                    className="flex gap-3 items-start rounded-lg bg-emerald-50/50 -mx-2 px-2 py-2"
                  >
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3" strokeWidth={2.5} />
                    </div>
                    <input
                      autoFocus
                      type="text"
                      value={item.text}
                      onChange={(e) => onUpdate(item.id, e.target.value)}
                      onBlur={() => setEditingEntry(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingEntry(null);
                      }}
                      className="flex-1 border border-emerald-400 rounded-md px-2.5 py-1 text-[15px] text-gray-800 outline-none bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      className="text-gray-300 hover:text-red-500 mt-1"
                      title="Remove"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </li>
                );
              }
              return (
                <li
                  key={item.id}
                  className="group flex gap-3 items-start rounded-lg -mx-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50/80 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditingEntry(kind, item.id, sectionId, blockId);
                  }}
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3" strokeWidth={2.5} />
                  </div>
                  <span className="flex-1 text-[15px] text-gray-800 leading-relaxed">
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.id);
                    }}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                    title="Remove"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {addButton}
        </div>
      );
    }

    if (variant === "deliverable") {
      return (
        <div className="group/list">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entries.map((item, index) => {
              const isEditing = editingEntry?.kind === kind && editingEntry.id === item.id;
              if (isEditing) {
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                        Deliverable {String(index + 1).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        className="text-gray-300 hover:text-red-500"
                        title="Remove"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      autoFocus
                      value={item.text}
                      onChange={(e) => onUpdate(item.id, e.target.value)}
                      onBlur={() => setEditingEntry(null)}
                      rows={3}
                      className="w-full border border-blue-300 rounded-xl px-3 py-2 text-[15px] text-gray-800 outline-none bg-white resize-none"
                    />
                  </li>
                );
              }
              return (
                <li
                  key={item.id}
                  className="group relative flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 min-h-[120px] cursor-pointer hover:border-gray-300 hover:shadow-[0_4px_16px_rgba(16,24,40,0.06)] transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditingEntry(kind, item.id, sectionId, blockId);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4" strokeWidth={1.75} />
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(item.id);
                      }}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <p className="text-[15px] font-medium text-gray-900 leading-snug">
                      {item.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {addButton}
        </div>
      );
    }

    return (
      <div className="group/list">
        <ul className="space-y-3">
          {entries.map((item) => {
            const isEditing = editingEntry?.kind === kind && editingEntry.id === item.id;
            if (isEditing) {
              return (
                <li key={item.id} className="flex gap-2 items-start bg-blue-50/40 -mx-2 px-2 py-2 rounded-md">
                  <span className="text-gray-400 select-none mt-2">—</span>
                  <input
                    autoFocus
                    type="text"
                    value={item.text}
                    onChange={(e) => onUpdate(item.id, e.target.value)}
                    onBlur={() => setEditingEntry(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setEditingEntry(null);
                    }}
                    className="flex-1 border border-emerald-500 rounded-md px-3 py-1.5 text-[14px] text-gray-700 outline-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="text-gray-300 hover:text-red-500 mt-1.5"
                    title="Remove"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </li>
              );
            }
            return (
              <li
                key={item.id}
                className="group flex gap-3 text-[14px] text-gray-700 leading-relaxed cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-md"
                onClick={(e) => {
                  e.stopPropagation();
                  startEditingEntry(kind, item.id, sectionId, blockId);
                }}
              >
                <span className="text-gray-400 select-none mt-px">—</span>
                <span className="flex-1">{item.text}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
        {addButton}
      </div>
    );
  };

  const getSectionBodyProps = (blockId: string, sectionType: SectionType) => {
    const style = sectionStyles[blockId] || {};
    return {
      className: 'px-16 py-12',
      style: {
        backgroundColor: style.backgroundColor || undefined,
        paddingTop: style.paddingTop != null ? `${style.paddingTop}px` : undefined,
        paddingBottom: style.paddingBottom != null ? `${style.paddingBottom}px` : undefined,
      } as React.CSSProperties,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        handleSectionClick(sectionType, blockId);
      },
    };
  };

  const renderSectionStyleControls = () => {
    if (!activeBlockId) return null;
    const bg = activeSectionStyle.backgroundColor || '#FFFFFF';
    return (
      <div className="mb-5 space-y-5">
        <div>
          <label className="block text-xs font-bold text-gray-900 mb-2">Background Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bg}
              onChange={(e) => updateSectionStyle(activeBlockId, { backgroundColor: e.target.value })}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent p-0"
            />
            <input
              type="text"
              value={bg}
              onChange={(e) => updateSectionStyle(activeBlockId, { backgroundColor: e.target.value })}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white uppercase font-mono"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-900 mb-2">Padding Top</label>
            <input
              type="number"
              value={activeSectionStyle.paddingTop ?? 48}
              onChange={(e) => updateSectionStyle(activeBlockId, { paddingTop: Number(e.target.value) || 0 })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-900 mb-2">Padding Bottom</label>
            <input
              type="number"
              value={activeSectionStyle.paddingBottom ?? 48}
              onChange={(e) => updateSectionStyle(activeBlockId, { paddingBottom: Number(e.target.value) || 0 })}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'summary')}>
      <div {...getSectionBodyProps(blockId, 'summary')}>
        <InlineEditableText
          as="h2"
          id="summary-heading"
          type="heading"
          sectionId="summary"
          className="mb-3"
          style={getTextStyle('summary-heading')}
          content={elementStyles['summary-heading']?.content || ''}
          isActive={activeElement?.id === 'summary-heading'}
          onSelect={(e) => handleElementClick(e, 'heading', 'summary-heading', 'summary', blockId)}
          onChange={(value) => updateElementStyle('summary-heading', { content: value })}
        />
        <InlineEditableText
          as="p"
          id="summary-text"
          type="text"
          sectionId="summary"
          className="max-w-3xl"
          style={getTextStyle('summary-text')}
          content={elementStyles['summary-text']?.content || ''}
          isActive={activeElement?.id === 'summary-text'}
          onSelect={(e) => handleElementClick(e, 'text', 'summary-text', 'summary', blockId)}
          onChange={(value) => updateElementStyle('summary-text', { content: value })}
        />
        {renderSectionExtras(blockId, 'summary')}
      </div>
    </EditableBlock>
  );

  const renderContentAnalysis = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'content')}>
      <div className="px-16 py-6 pb-12" onClick={(e) => e.stopPropagation()}>
        <InlineEditableText
          as="h2"
          id="analysis-heading"
          type="heading"
          sectionId="content"
          className="mb-6"
          style={getTextStyle('analysis-heading')}
          content={elementStyles['analysis-heading']?.content || ''}
          isActive={activeElement?.id === 'analysis-heading'}
          onSelect={(e) => handleElementClick(e, 'heading', 'analysis-heading', 'content', blockId)}
          onChange={(value) => updateElementStyle('analysis-heading', { content: value })}
        />
        <InlineEditableText
          as="p"
          id="analysis-text"
          type="text"
          sectionId="content"
          style={getTextStyle('analysis-text')}
          content={elementStyles['analysis-text']?.content || ''}
          isActive={activeElement?.id === 'analysis-text'}
          onSelect={(e) => handleElementClick(e, 'text', 'analysis-text', 'content', blockId)}
          onChange={(value) => updateElementStyle('analysis-text', { content: value })}
        />
        {renderSectionExtras(blockId, 'content')}
      </div>
    </EditableBlock>
  );

  const renderContentBlank = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'content')}>
      <div className="px-16 py-12" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-gray-300 mb-6">Section Title</h2>
        <p className="text-gray-300 leading-relaxed text-[15px]">
          Start typing your proposal content here...
        </p>
        {renderSectionExtras(blockId, 'content')}
      </div>
    </EditableBlock>
  );

  const renderMediaText = (blockId: string) => {
    const processImg = elementStyles['process-image'] || {};
    return (
      <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'media-text')}>
        <div className="px-16 py-12" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-row gap-12 items-center">
            <div className="w-1/2">
              <div
                className={`overflow-hidden shadow-sm cursor-pointer border-2 transition-colors ${
                  activeElement?.id === 'process-image' ? 'border-blue-400' : 'border-transparent hover:border-blue-200'
                }`}
                style={{ borderRadius: `${processImg.borderRadius ?? 12}px` }}
                onClick={(e) => handleElementClick(e, 'image', 'process-image', 'media-text', blockId)}
              >
                <img
                  src={processImg.src}
                  alt="Process"
                  className="w-full h-[320px] object-cover block"
                  style={{ opacity: (processImg.opacity ?? 100) / 100 }}
                />
              </div>
            </div>
            <div className="w-1/2 space-y-4">
              <InlineEditableText
                as="h2"
                id="process-heading"
                type="heading"
                sectionId="media-text"
                style={getTextStyle('process-heading')}
                content={elementStyles['process-heading']?.content || ''}
                isActive={activeElement?.id === 'process-heading'}
                onSelect={(e) => handleElementClick(e, 'heading', 'process-heading', 'media-text', blockId)}
                onChange={(value) => updateElementStyle('process-heading', { content: value })}
              />
              <InlineEditableText
                as="p"
                id="process-text-1"
                type="text"
                sectionId="media-text"
                style={getTextStyle('process-text-1')}
                content={elementStyles['process-text-1']?.content || ''}
                isActive={activeElement?.id === 'process-text-1'}
                onSelect={(e) => handleElementClick(e, 'text', 'process-text-1', 'media-text', blockId)}
                onChange={(value) => updateElementStyle('process-text-1', { content: value })}
              />
              <InlineEditableText
                as="p"
                id="process-text-2"
                type="text"
                sectionId="media-text"
                style={getTextStyle('process-text-2')}
                content={elementStyles['process-text-2']?.content || ''}
                isActive={activeElement?.id === 'process-text-2'}
                onSelect={(e) => handleElementClick(e, 'text', 'process-text-2', 'media-text', blockId)}
                onChange={(value) => updateElementStyle('process-text-2', { content: value })}
              />
            </div>
          </div>
          {renderSectionExtras(blockId, 'media-text')}
        </div>
      </EditableBlock>
    );
  };

  const renderImage = (blockId: string) => {
    const img = elementStyles['hero-image'] || {};
    return (
      <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'image')}>
        <div className="px-16 py-8" onClick={(e) => e.stopPropagation()}>
          <div 
             className={`relative cursor-pointer border-2 transition-colors ${activeElement?.id === 'hero-image' ? 'border-blue-400' : 'border-transparent hover:border-blue-200'}`}
             style={{ borderRadius: `${img.borderRadius ?? 16}px` }}
             onClick={(e) => handleElementClick(e, 'image', 'hero-image', 'image', blockId)}
          >
            <img
              src={img.src}
              alt="Team"
              className="w-full h-[450px] object-cover shadow-sm block"
              style={{
                borderRadius: `${img.borderRadius ?? 16}px`,
                opacity: (img.opacity ?? 100) / 100,
              }}
            />
          </div>
          {renderSectionExtras(blockId, 'image')}
        </div>
      </EditableBlock>
    );
  };

  const renderAboutUs = (blockId: string) => {
    const aboutImg = elementStyles['about-image'] || {};
    return (
      <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'about')}>
        <div className="px-16 py-16 bg-slate-50 mt-8 mb-8" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col md:flex-row gap-12 items-center">
            <div className="flex-1 space-y-6">
              <div>
                <div className="text-xs font-bold text-[#3B82F6] uppercase tracking-wider mb-2">About Us</div>
                <InlineEditableText
                  as="h2"
                  id="about-heading"
                  type="heading"
                  sectionId="about"
                  style={getTextStyle('about-heading')}
                  content={elementStyles['about-heading']?.content || ''}
                  isActive={activeElement?.id === 'about-heading'}
                  onSelect={(e) => handleElementClick(e, 'heading', 'about-heading', 'about', blockId)}
                  onChange={(value) => updateElementStyle('about-heading', { content: value })}
                />
              </div>
              <InlineEditableText
                as="p"
                id="about-text"
                type="text"
                sectionId="about"
                style={getTextStyle('about-text')}
                content={elementStyles['about-text']?.content || ''}
                isActive={activeElement?.id === 'about-text'}
                onSelect={(e) => handleElementClick(e, 'text', 'about-text', 'about', blockId)}
                onChange={(value) => updateElementStyle('about-text', { content: value })}
              />
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-200 mt-2">
                {aboutStats.map((stat) => {
                  const isEditing = editingEntry?.kind === 'about-stat' && editingEntry.id === stat.id;
                  if (isEditing) {
                    return (
                      <div key={stat.id} className="space-y-2 bg-blue-50/50 -mx-1 px-2 py-2 rounded-md">
                        <input
                          autoFocus
                          type="text"
                          value={stat.value}
                          onChange={(e) => updateAboutStat(stat.id, { value: e.target.value })}
                          className="w-full border border-emerald-500 rounded-md px-2 py-1.5 text-2xl font-bold text-gray-900 outline-none bg-white"
                        />
                        <input
                          type="text"
                          value={stat.label}
                          onChange={(e) => updateAboutStat(stat.id, { label: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') setEditingEntry(null); }}
                          className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-500 outline-none bg-white"
                        />
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setEditingEntry(null)} className="flex-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 py-1 rounded">
                            Done
                          </button>
                          <button type="button" onClick={() => removeAboutStat(stat.id)} className="flex-1 text-[11px] font-semibold text-red-500 hover:bg-red-50 py-1 rounded">
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={stat.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingEntry('about-stat', stat.id, 'about', blockId);
                      }}
                      className="group text-left rounded-md -mx-1 px-2 py-1.5 border-2 border-transparent hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                    >
                      <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                      <div className="text-xs text-gray-500 font-medium mt-1">{stat.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="w-[40%] shrink-0 relative">
              <div
                className={`aspect-[4/5] overflow-hidden shadow-sm cursor-pointer border-2 transition-colors ${activeElement?.id === 'about-image' ? 'border-blue-400' : 'border-transparent hover:border-blue-200'}`}
                style={{ borderRadius: `${aboutImg.borderRadius ?? 16}px` }}
                onClick={(e) => handleElementClick(e, 'image', 'about-image', 'about', blockId)}
              >
                <img
                  src={aboutImg.src}
                  alt="Team"
                  className="w-full h-full object-cover"
                  style={{ opacity: (aboutImg.opacity ?? 100) / 100 }}
                />
              </div>
            </div>
          </div>
          {renderSectionExtras(blockId, 'about')}
        </div>
      </EditableBlock>
    );
  };

  const renderTwoColumn = (blockId: string) => {
    const renderEditableList = (
      entries: ScopeEntry[],
      kind: 'goals' | 'deliverables',
      accent: 'emerald' | 'blue',
      onUpdate: (id: string, text: string) => void,
      onRemove: (id: string) => void,
    ) => (
      <ul className="space-y-3">
        {entries.map((item) => {
          const isEditing = editingEntry?.kind === kind && editingEntry.id === item.id;
          if (isEditing) {
            return (
              <li key={item.id} className="flex items-start gap-2 bg-blue-50/40 -mx-2 px-2 py-2 rounded-md">
                <div className={`w-5 h-5 rounded-full shrink-0 mt-1.5 flex items-center justify-center ${
                  accent === 'emerald' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {accent === 'emerald' ? <Check className="w-3 h-3" /> : <BoxSelect className="w-3 h-3" />}
                </div>
                <input
                  autoFocus
                  type="text"
                  value={item.text}
                  onChange={(e) => onUpdate(item.id, e.target.value)}
                  onBlur={() => setEditingEntry(null)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setEditingEntry(null); }}
                  className="flex-1 border border-emerald-500 rounded-md px-2 py-1.5 text-[14px] text-gray-700 outline-none bg-white"
                />
                <button type="button" onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500 mt-1.5">
                  <XCircle className="w-4 h-4" />
                </button>
              </li>
            );
          }
          return (
            <li
              key={item.id}
              className="group flex items-start gap-3 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-md"
              onClick={(e) => {
                e.stopPropagation();
                startEditingEntry(kind, item.id, 'two-column', blockId);
              }}
            >
              <div className={`w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center ${
                accent === 'emerald' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {accent === 'emerald' ? <Check className="w-3 h-3" /> : <BoxSelect className="w-3 h-3" />}
              </div>
              <span className="flex-1 text-gray-700 text-[14px] leading-relaxed">{item.text}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </li>
          );
        })}
      </ul>
    );

    return (
      <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'two-column')}>
        <div className="px-16 py-12 bg-[#FAF7F2]/50 mt-8 mb-8" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-16">
            <div>
              <InlineEditableText
                as="h3"
                id="goals-heading"
                type="heading"
                sectionId="two-column"
                className="mb-4"
                style={getTextStyle('goals-heading')}
                content={elementStyles['goals-heading']?.content || ''}
                isActive={activeElement?.id === 'goals-heading'}
                onSelect={(e) => handleElementClick(e, 'heading', 'goals-heading', 'two-column', blockId)}
                onChange={(value) => updateElementStyle('goals-heading', { content: value })}
              />
              {renderEditableList(projectGoals, 'goals', 'emerald', updateGoalEntry, removeGoalEntry)}
            </div>
            <div>
              <InlineEditableText
                as="h3"
                id="deliverables-heading"
                type="heading"
                sectionId="two-column"
                className="mb-4"
                style={getTextStyle('deliverables-heading')}
                content={elementStyles['deliverables-heading']?.content || ''}
                isActive={activeElement?.id === 'deliverables-heading'}
                onSelect={(e) => handleElementClick(e, 'heading', 'deliverables-heading', 'two-column', blockId)}
                onChange={(value) => updateElementStyle('deliverables-heading', { content: value })}
              />
              {renderEditableList(keyDeliverables, 'deliverables', 'blue', updateDeliverableEntry, removeDeliverableEntry)}
            </div>
          </div>
          {renderSectionExtras(blockId, 'two-column')}
        </div>
      </EditableBlock>
    );
  };

  const renderScope = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'scope')}>
      <div {...getSectionBodyProps(blockId, 'scope')}>
        <div className="mb-8 max-w-2xl">
          <InlineEditableText
            as="h2"
            id="scope-heading"
            type="heading"
            sectionId="scope"
            className="mb-2"
            style={getTextStyle('scope-heading')}
            content={elementStyles['scope-heading']?.content || ''}
            isActive={activeElement?.id === 'scope-heading'}
            onSelect={(e) => handleElementClick(e, 'heading', 'scope-heading', 'scope', blockId)}
            onChange={(value) => updateElementStyle('scope-heading', { content: value })}
          />
          <InlineEditableText
            as="p"
            id="scope-intro"
            type="text"
            sectionId="scope"
            style={getTextStyle('scope-intro')}
            content={elementStyles['scope-intro']?.content || ''}
            isActive={activeElement?.id === 'scope-intro'}
            onSelect={(e) => handleElementClick(e, 'text', 'scope-intro', 'scope', blockId)}
            onChange={(value) => updateElementStyle('scope-intro', { content: value })}
          />
        </div>
        {renderEditableBulletList(
          blockId, 'scope', 'scope-included', scopeIncluded,
          (id, text) => updateScopeEntry('included', id, text),
          (id) => removeScopeEntry('included', id),
          () => addScopeEntry('included'),
          'Add item',
          'check',
        )}
        {renderSectionExtras(blockId, 'scope')}
      </div>
    </EditableBlock>
  );

  const renderGoals = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'goals')}>
      <div {...getSectionBodyProps(blockId, 'goals')}>
        <InlineEditableText as="h2" id="goals-heading" type="heading" sectionId="goals" className="mb-2" style={getTextStyle('goals-heading')} content={elementStyles['goals-heading']?.content || ''} isActive={activeElement?.id === 'goals-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'goals-heading', 'goals', blockId)} onChange={(value) => updateElementStyle('goals-heading', { content: value })} />
        <InlineEditableText as="p" id="goals-intro" type="text" sectionId="goals" className="mb-8 max-w-2xl" style={getTextStyle('goals-intro')} content={elementStyles['goals-intro']?.content || ''} isActive={activeElement?.id === 'goals-intro'} onSelect={(e) => handleElementClick(e, 'text', 'goals-intro', 'goals', blockId)} onChange={(value) => updateElementStyle('goals-intro', { content: value })} />
        {renderEditableBulletList(blockId, 'goals', 'goals', projectGoals, updateGoalEntry, removeGoalEntry, addGoalEntry, 'Add goal')}
        {renderSectionExtras(blockId, 'goals')}
      </div>
    </EditableBlock>
  );

  const renderDeliverables = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'deliverables')}>
      <div {...getSectionBodyProps(blockId, 'deliverables')}>
        <div className="mb-8 max-w-2xl">
          <InlineEditableText as="h2" id="deliverables-heading" type="heading" sectionId="deliverables" className="mb-2" style={getTextStyle('deliverables-heading')} content={elementStyles['deliverables-heading']?.content || ''} isActive={activeElement?.id === 'deliverables-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'deliverables-heading', 'deliverables', blockId)} onChange={(value) => updateElementStyle('deliverables-heading', { content: value })} />
          <InlineEditableText as="p" id="deliverables-intro" type="text" sectionId="deliverables" style={getTextStyle('deliverables-intro')} content={elementStyles['deliverables-intro']?.content || ''} isActive={activeElement?.id === 'deliverables-intro'} onSelect={(e) => handleElementClick(e, 'text', 'deliverables-intro', 'deliverables', blockId)} onChange={(value) => updateElementStyle('deliverables-intro', { content: value })} />
        </div>
        {renderEditableBulletList(blockId, 'deliverables', 'deliverables', keyDeliverables, updateDeliverableEntry, removeDeliverableEntry, addDeliverableEntry, 'Add deliverable', 'deliverable')}
        {renderSectionExtras(blockId, 'deliverables')}
      </div>
    </EditableBlock>
  );

  const renderApproach = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'approach')}>
      <div {...getSectionBodyProps(blockId, 'approach')}>
        <div className="mb-8 max-w-2xl">
          <InlineEditableText as="h2" id="approach-heading" type="heading" sectionId="approach" className="mb-2" style={getTextStyle('approach-heading')} content={elementStyles['approach-heading']?.content || ''} isActive={activeElement?.id === 'approach-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'approach-heading', 'approach', blockId)} onChange={(value) => updateElementStyle('approach-heading', { content: value })} />
          <InlineEditableText as="p" id="approach-intro" type="text" sectionId="approach" style={getTextStyle('approach-intro')} content={elementStyles['approach-intro']?.content || ''} isActive={activeElement?.id === 'approach-intro'} onSelect={(e) => handleElementClick(e, 'text', 'approach-intro', 'approach', blockId)} onChange={(value) => updateElementStyle('approach-intro', { content: value })} />
        </div>
        {renderApproachStepsList(blockId)}
        {renderSectionExtras(blockId, 'approach')}
      </div>
    </EditableBlock>
  );

  const renderExclusions = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'exclusions')}>
      <div {...getSectionBodyProps(blockId, 'exclusions')}>
        <InlineEditableText as="h2" id="exclusions-heading" type="heading" sectionId="exclusions" className="mb-2" style={getTextStyle('exclusions-heading')} content={elementStyles['exclusions-heading']?.content || ''} isActive={activeElement?.id === 'exclusions-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'exclusions-heading', 'exclusions', blockId)} onChange={(value) => updateElementStyle('exclusions-heading', { content: value })} />
        <InlineEditableText as="p" id="exclusions-intro" type="text" sectionId="exclusions" className="mb-8 max-w-2xl" style={getTextStyle('exclusions-intro')} content={elementStyles['exclusions-intro']?.content || ''} isActive={activeElement?.id === 'exclusions-intro'} onSelect={(e) => handleElementClick(e, 'text', 'exclusions-intro', 'exclusions', blockId)} onChange={(value) => updateElementStyle('exclusions-intro', { content: value })} />
        {renderEditableBulletList(
          blockId, 'exclusions', 'scope-excluded', scopeExcluded,
          (id, text) => updateScopeEntry('excluded', id, text),
          (id) => removeScopeEntry('excluded', id),
          () => addScopeEntry('excluded'),
          'Add exclusion',
        )}
        {renderSectionExtras(blockId, 'exclusions')}
      </div>
    </EditableBlock>
  );

  const renderResponsibilities = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'responsibilities')}>
      <div {...getSectionBodyProps(blockId, 'responsibilities')}>
        <InlineEditableText as="h2" id="responsibilities-heading" type="heading" sectionId="responsibilities" className="mb-2" style={getTextStyle('responsibilities-heading')} content={elementStyles['responsibilities-heading']?.content || ''} isActive={activeElement?.id === 'responsibilities-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'responsibilities-heading', 'responsibilities', blockId)} onChange={(value) => updateElementStyle('responsibilities-heading', { content: value })} />
        <InlineEditableText as="p" id="responsibilities-intro" type="text" sectionId="responsibilities" className="mb-8 max-w-2xl" style={getTextStyle('responsibilities-intro')} content={elementStyles['responsibilities-intro']?.content || ''} isActive={activeElement?.id === 'responsibilities-intro'} onSelect={(e) => handleElementClick(e, 'text', 'responsibilities-intro', 'responsibilities', blockId)} onChange={(value) => updateElementStyle('responsibilities-intro', { content: value })} />
        {renderEditableBulletList(blockId, 'responsibilities', 'responsibilities', clientResponsibilities, updateResponsibility, removeResponsibility, addResponsibility, 'Add responsibility')}
        {renderSectionExtras(blockId, 'responsibilities')}
      </div>
    </EditableBlock>
  );

  const renderRevisions = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'revisions')}>
      <div {...getSectionBodyProps(blockId, 'revisions')}>
        <InlineEditableText as="h2" id="revisions-heading" type="heading" sectionId="revisions" className="mb-3" style={getTextStyle('revisions-heading')} content={elementStyles['revisions-heading']?.content || ''} isActive={activeElement?.id === 'revisions-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'revisions-heading', 'revisions', blockId)} onChange={(value) => updateElementStyle('revisions-heading', { content: value })} />
        <InlineEditableText as="p" id="revisions-text" type="text" sectionId="revisions" className="max-w-3xl" style={getTextStyle('revisions-text')} content={elementStyles['revisions-text']?.content || ''} isActive={activeElement?.id === 'revisions-text'} onSelect={(e) => handleElementClick(e, 'text', 'revisions-text', 'revisions', blockId)} onChange={(value) => updateElementStyle('revisions-text', { content: value })} />
        {renderSectionExtras(blockId, 'revisions')}
      </div>
    </EditableBlock>
  );

  const renderNextSteps = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'next-steps')}>
      <div {...getSectionBodyProps(blockId, 'next-steps')}>
        <InlineEditableText as="h2" id="next-steps-heading" type="heading" sectionId="next-steps" className="mb-3" style={getTextStyle('next-steps-heading')} content={elementStyles['next-steps-heading']?.content || ''} isActive={activeElement?.id === 'next-steps-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'next-steps-heading', 'next-steps', blockId)} onChange={(value) => updateElementStyle('next-steps-heading', { content: value })} />
        <InlineEditableText as="p" id="next-steps-text" type="text" sectionId="next-steps" className="max-w-3xl" style={getTextStyle('next-steps-text')} content={elementStyles['next-steps-text']?.content || ''} isActive={activeElement?.id === 'next-steps-text'} onSelect={(e) => handleElementClick(e, 'text', 'next-steps-text', 'next-steps', blockId)} onChange={(value) => updateElementStyle('next-steps-text', { content: value })} />
        {renderSectionExtras(blockId, 'next-steps')}
      </div>
    </EditableBlock>
  );

  const renderSignature = (blockId: string) => (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'signature')}>
      <div {...getSectionBodyProps(blockId, 'signature')}>
        <InlineEditableText as="h2" id="signature-heading" type="heading" sectionId="signature" className="mb-2" style={getTextStyle('signature-heading')} content={elementStyles['signature-heading']?.content || ''} isActive={activeElement?.id === 'signature-heading'} onSelect={(e) => handleElementClick(e, 'heading', 'signature-heading', 'signature', blockId)} onChange={(value) => updateElementStyle('signature-heading', { content: value })} />
        <InlineEditableText as="p" id="signature-intro" type="text" sectionId="signature" className="mb-10 max-w-2xl" style={getTextStyle('signature-intro')} content={elementStyles['signature-intro']?.content || ''} isActive={activeElement?.id === 'signature-intro'} onSelect={(e) => handleElementClick(e, 'text', 'signature-intro', 'signature', blockId)} onChange={(value) => updateElementStyle('signature-intro', { content: value })} />
        <div className="grid grid-cols-2 gap-10 max-w-3xl">
          <div className="space-y-6">
            <div>
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-3">Client name</div>
              <div className="border-b border-gray-200 pb-2 text-[14px] text-gray-400">____________________________</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-3">Signature / typed acceptance</div>
              <div className="border-b border-gray-200 pb-2 h-10" />
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-3">Date</div>
              <div className="border-b border-gray-200 pb-2 text-[14px] text-gray-400">____________________________</div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-3">Selected package</div>
              <div className="border-b border-gray-200 pb-2 text-[14px] text-gray-400">____________________________</div>
            </div>
          </div>
        </div>
        <p className="mt-8 text-[13px] text-gray-500 max-w-2xl leading-relaxed">
          Confirmation: the client agrees to this proposal, payment schedule, and terms &amp; conditions.
        </p>
        {renderSectionExtras(blockId, 'signature')}
      </div>
    </EditableBlock>
  );

  const renderTimeline = (blockId: string) => {
    const bodyProps = getSectionBodyProps(blockId, 'timeline');
    return (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'timeline')}>
      <div {...bodyProps} className={`${bodyProps.className} group/list`}>
        <div className="mb-10">
          <InlineEditableText
            as="h2"
            id="timeline-heading"
            type="heading"
            sectionId="timeline"
            className="mb-2"
            style={getTextStyle('timeline-heading')}
            content={elementStyles['timeline-heading']?.content || ''}
            isActive={activeElement?.id === 'timeline-heading'}
            onSelect={(e) => handleElementClick(e, 'heading', 'timeline-heading', 'timeline', blockId)}
            onChange={(value) => updateElementStyle('timeline-heading', { content: value })}
          />
          <InlineEditableText
            as="p"
            id="timeline-intro"
            type="text"
            sectionId="timeline"
            style={getTextStyle('timeline-intro')}
            content={elementStyles['timeline-intro']?.content || ''}
            isActive={activeElement?.id === 'timeline-intro'}
            onSelect={(e) => handleElementClick(e, 'text', 'timeline-intro', 'timeline', blockId)}
            onChange={(value) => updateElementStyle('timeline-intro', { content: value })}
          />
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-200 text-[12px] font-semibold text-gray-400 uppercase tracking-wide">
              <th className="pb-3 pr-6 w-[22%] font-semibold">Phase</th>
              <th className="pb-3 pr-6 w-[28%] font-semibold">Focus</th>
              <th className="pb-3 font-semibold">Deliverables</th>
              <th className="pb-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {timelinePhases.map((phase) => {
              const isEditing = editingEntry?.kind === 'timeline' && editingEntry.id === phase.id;
              if (isEditing) {
                return (
                  <tr key={phase.id} className="align-top bg-blue-50/40">
                    <td className="py-4 pr-4">
                      <input
                        autoFocus
                        type="text"
                        value={phase.week}
                        onChange={(e) => updateTimelinePhase(phase.id, { week: e.target.value })}
                        className="w-full border border-emerald-500 rounded-md px-2 py-1.5 text-[14px] outline-none bg-white"
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <input
                        type="text"
                        value={phase.title}
                        onChange={(e) => updateTimelinePhase(phase.id, { title: e.target.value })}
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-[15px] font-semibold outline-none bg-white"
                      />
                    </td>
                    <td className="py-4 pr-2">
                      <textarea
                        value={phase.detail}
                        onChange={(e) => updateTimelinePhase(phase.id, { detail: e.target.value })}
                        rows={2}
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-[14px] outline-none bg-white resize-y"
                      />
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => setEditingEntry(null)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Done">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => removeTimelinePhase(phase.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Remove">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={phase.id}
                  className="align-top group cursor-pointer hover:bg-gray-50/80"
                  onClick={() => startEditingEntry('timeline', phase.id, 'timeline', blockId)}
                >
                  <td className="py-5 pr-6 text-[14px] font-medium text-gray-500 whitespace-nowrap">{phase.week}</td>
                  <td className="py-5 pr-6 text-[15px] font-semibold text-gray-900">{phase.title}</td>
                  <td className="py-5 text-[14px] text-gray-600 leading-relaxed">{phase.detail}</td>
                  <td className="py-5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeTimelinePhase(phase.id); }}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); addTimelinePhase(); }}
          className="mt-5 inline-flex opacity-100 md:opacity-0 md:group-hover/list:opacity-100 focus:opacity-100 transition-opacity text-emerald-600 hover:text-emerald-700 font-semibold text-sm items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add phase
        </button>
        {renderSectionExtras(blockId, 'timeline')}
      </div>
    </EditableBlock>
  );
  };

  const renderPayment = (blockId: string) => {
    const bodyProps = getSectionBodyProps(blockId, 'payment');
    return (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'payment')}>
      <div {...bodyProps} className={`${bodyProps.className} group/list`}>
        <InlineEditableText
          as="h2"
          id="payment-heading"
          type="heading"
          sectionId="payment"
          className="mb-2"
          style={getTextStyle('payment-heading')}
          content={elementStyles['payment-heading']?.content || ''}
          isActive={activeElement?.id === 'payment-heading'}
          onSelect={(e) => handleElementClick(e, 'heading', 'payment-heading', 'payment', blockId)}
          onChange={(value) => updateElementStyle('payment-heading', { content: value })}
        />
        <InlineEditableText
          as="p"
          id="payment-intro"
          type="text"
          sectionId="payment"
          className="mb-10 max-w-2xl"
          style={getTextStyle('payment-intro')}
          content={elementStyles['payment-intro']?.content || ''}
          isActive={activeElement?.id === 'payment-intro'}
          onSelect={(e) => handleElementClick(e, 'text', 'payment-intro', 'payment', blockId)}
          onChange={(value) => updateElementStyle('payment-intro', { content: value })}
        />
        <table className="w-full text-left mb-10">
          <thead>
            <tr className="border-b border-gray-200 text-[12px] font-semibold text-gray-400 uppercase tracking-wide">
              <th className="pb-3 pr-4 font-semibold">Milestone</th>
              <th className="pb-3 pr-4 font-semibold text-right w-[18%]">Share</th>
              <th className="pb-3 font-semibold">Due</th>
              <th className="pb-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paymentMilestones.map((m) => {
              const isEditing = editingEntry?.kind === 'payment' && editingEntry.id === m.id;
              if (isEditing) {
                return (
                  <tr key={m.id} className="bg-blue-50/40">
                    <td className="py-4 pr-4">
                      <input
                        autoFocus
                        type="text"
                        value={m.label}
                        onChange={(e) => updatePaymentMilestone(m.id, { label: e.target.value })}
                        className="w-full border border-emerald-500 rounded-md px-2 py-1.5 text-[15px] font-semibold outline-none bg-white"
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <input
                        type="text"
                        value={m.pct}
                        onChange={(e) => updatePaymentMilestone(m.id, { pct: e.target.value })}
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-[15px] font-semibold text-right outline-none bg-white tabular-nums"
                      />
                    </td>
                    <td className="py-4 pr-2">
                      <input
                        type="text"
                        value={m.when}
                        onChange={(e) => updatePaymentMilestone(m.id, { when: e.target.value })}
                        className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-[14px] outline-none bg-white"
                      />
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => setEditingEntry(null)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Done">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => removePaymentMilestone(m.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Remove">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={m.id}
                  className="group cursor-pointer hover:bg-gray-50/80"
                  onClick={() => startEditingEntry('payment', m.id, 'payment', blockId)}
                >
                  <td className="py-5 pr-4 text-[15px] font-semibold text-gray-900">{m.label}</td>
                  <td className="py-5 pr-4 text-[15px] font-semibold text-gray-900 text-right tabular-nums">{m.pct}</td>
                  <td className="py-5 text-[14px] text-gray-600">{m.when}</td>
                  <td className="py-5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removePaymentMilestone(m.id); }}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); addPaymentMilestone(); }}
          className="mb-8 inline-flex opacity-100 md:opacity-0 md:group-hover/list:opacity-100 focus:opacity-100 transition-opacity text-emerald-600 hover:text-emerald-700 font-semibold text-sm items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add milestone
        </button>
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Payment terms</h3>
          <InlineEditableText
            as="p"
            id="payment-terms-note"
            type="text"
            sectionId="payment"
            className="max-w-3xl"
            style={getTextStyle('payment-terms-note')}
            content={elementStyles['payment-terms-note']?.content || ''}
            isActive={activeElement?.id === 'payment-terms-note'}
            onSelect={(e) => handleElementClick(e, 'text', 'payment-terms-note', 'payment', blockId)}
            onChange={(value) => updateElementStyle('payment-terms-note', { content: value })}
          />
        </div>
        {renderSectionExtras(blockId, 'payment')}
      </div>
    </EditableBlock>
  );
  };

  const renderTerms = (blockId: string) => {
    const bodyProps = getSectionBodyProps(blockId, 'terms');
    return (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'terms')}>
      <div {...bodyProps} className={`${bodyProps.className} group/list`}>
        <InlineEditableText
          as="h2"
          id="terms-heading"
          type="heading"
          sectionId="terms"
          className="mb-2"
          style={getTextStyle('terms-heading')}
          content={elementStyles['terms-heading']?.content || ''}
          isActive={activeElement?.id === 'terms-heading'}
          onSelect={(e) => handleElementClick(e, 'heading', 'terms-heading', 'terms', blockId)}
          onChange={(value) => updateElementStyle('terms-heading', { content: value })}
        />
        <InlineEditableText
          as="p"
          id="terms-intro"
          type="text"
          sectionId="terms"
          className="mb-10"
          style={getTextStyle('terms-intro')}
          content={elementStyles['terms-intro']?.content || ''}
          isActive={activeElement?.id === 'terms-intro'}
          onSelect={(e) => handleElementClick(e, 'text', 'terms-intro', 'terms', blockId)}
          onChange={(value) => updateElementStyle('terms-intro', { content: value })}
        />
        <div className="divide-y divide-gray-100">
          {termEntries.map((term, idx) => {
            const isEditing = editingEntry?.kind === 'terms' && editingEntry.id === term.id;
            if (isEditing) {
              return (
                <div key={term.id} className="py-5 grid grid-cols-[2rem_1fr_auto] gap-4 bg-blue-50/40 -mx-2 px-2 rounded-md">
                  <div className="text-[13px] font-medium text-gray-400 tabular-nums pt-2">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                  <div className="space-y-2">
                    <input
                      autoFocus
                      type="text"
                      value={term.title}
                      onChange={(e) => updateTermEntry(term.id, { title: e.target.value })}
                      className="w-full border border-emerald-500 rounded-md px-3 py-1.5 text-[15px] font-semibold outline-none bg-white"
                    />
                    <textarea
                      value={term.body}
                      onChange={(e) => updateTermEntry(term.id, { body: e.target.value })}
                      rows={2}
                      className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-[14px] text-gray-600 outline-none bg-white resize-y"
                    />
                  </div>
                  <div className="flex flex-col gap-1 pt-1">
                    <button type="button" onClick={() => setEditingEntry(null)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Done">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => removeTermEntry(term.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Remove">
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={term.id}
                className="py-5 grid grid-cols-[2rem_1fr_auto] gap-4 group cursor-pointer hover:bg-gray-50/80 -mx-2 px-2 rounded-md"
                onClick={() => startEditingEntry('terms', term.id, 'terms', blockId)}
              >
                <div className="text-[13px] font-medium text-gray-400 tabular-nums pt-0.5">
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-gray-900 mb-1.5">{term.title}</div>
                  <p className="text-[14px] text-gray-600 leading-relaxed">{term.body}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeTermEntry(term.id); }}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity self-start mt-1"
                  title="Remove"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); addTermEntry(); }}
          className="mt-5 inline-flex opacity-100 md:opacity-0 md:group-hover/list:opacity-100 focus:opacity-100 transition-opacity text-emerald-600 hover:text-emerald-700 font-semibold text-sm items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add term
        </button>
        {renderSectionExtras(blockId, 'terms')}
      </div>
    </EditableBlock>
  );
  };

  const renderPricing = (blockId: string) => {
    const bodyProps = getSectionBodyProps(blockId, 'pricing');
    return (
    <EditableBlock key={blockId} {...getEditableBlockProps(blockId, 'pricing')}>
      <div
        {...bodyProps}
        className={`${bodyProps.className} group/pricing`}
      >
        <table className="w-full text-sm">
          <thead className="border-b-2 border-line text-gray-900 font-bold text-left">
            <tr>
              <th className="pb-4 w-[55%]">Items</th>
              <th className="pb-4 text-center w-[15%]">Qty</th>
              <th className="pb-4 text-right w-[15%]">Price</th>
              <th className="pb-4 text-right w-[15%]">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineItems.map((item) => {
              const isEditing = editingItemId === item.id;
              const rowTotal = item.qty * item.price;

              if (isEditing) {
                return (
                  <tr key={item.id} className="bg-blue-50/40">
                    <td className="py-4 pr-4 align-top">
                      <div className="flex items-start gap-2 -ml-6">
                        <GripVertical className="w-4 h-4 text-gray-300 mt-3 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <input
                            autoFocus
                            type="text"
                            value={item.title}
                            onChange={(e) => updateLineItem(item.id, { title: e.target.value })}
                            className="w-full border border-emerald-500 rounded-md px-3 py-2 text-[15px] font-bold text-gray-900 outline-none bg-white shadow-sm"
                          />
                          <textarea
                            value={item.description}
                            onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                            rows={3}
                            className="w-full border border-gray-200 rounded-md px-3 py-2 text-[13px] text-gray-600 outline-none bg-white resize-y"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-center align-top">
                      <input
                        type="number"
                        min={0}
                        value={item.qty}
                        onChange={(e) => updateLineItem(item.id, { qty: Number(e.target.value) || 0 })}
                        className="w-16 border border-gray-200 rounded-md px-2 py-2 text-center font-bold text-gray-900 outline-none bg-white"
                      />
                    </td>
                    <td className="py-4 text-right align-top">
                      <div className="inline-flex flex-col items-end gap-1">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.price}
                          onChange={(e) => updateLineItem(item.id, { price: Number(e.target.value) || 0 })}
                          className="w-24 border border-gray-200 rounded-md px-2 py-2 text-right font-bold text-gray-900 outline-none bg-white"
                        />
                        <select
                          value={item.unit}
                          onChange={(e) => updateLineItem(item.id, { unit: e.target.value as LineItem['unit'] })}
                          className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-600 outline-none bg-white"
                        >
                          <option value="hr">/ hr</option>
                          <option value="day">/ day</option>
                          <option value="flat">flat</option>
                        </select>
                      </div>
                    </td>
                    <td className="py-4 text-right relative align-top">
                      <div className="font-bold text-gray-900 pt-2">{formatMoney(rowTotal)}</div>
                      <div className="absolute right-[-28px] top-4 flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingItemId(null)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 bg-white border border-line rounded shadow-sm"
                          title="Done"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 bg-white border border-line rounded shadow-sm"
                          title="Remove item"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={item.id}
                  className="group cursor-pointer hover:bg-gray-50/80"
                  onClick={() => {
                    setActiveSection('pricing');
                    setEditingItemId(item.id);
                    setIsAddingItem(false);
                    setActiveElement(null);
                  }}
                >
                  <td className="py-6 pr-4">
                    <div className="font-bold text-gray-900 mb-2 text-[15px]">{item.title}</div>
                    <p className="text-gray-500 leading-relaxed text-[13px]">{item.description}</p>
                  </td>
                  <td className="py-6 text-center font-bold text-gray-900">{item.qty}</td>
                  <td className="py-6 text-right text-gray-600">
                    <span className="font-bold text-gray-900">{formatMoney(item.price)}</span>{' '}
                    {UNIT_LABEL[item.unit]}
                  </td>
                  <td className="py-6 text-right relative">
                    <span className="font-bold text-gray-900">{formatMoney(rowTotal)}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLineItem(item.id);
                      }}
                      className="absolute right-[-24px] top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove item"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Add item row — visible on section hover, not on item selection */}
            {isAddingItem ? (
              <tr>
                <td className="py-6 pr-4 relative" colSpan={4}>
                  <div className="flex items-center gap-2 -ml-6 max-w-[420px]">
                    <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsAddingItem(false);
                          setItemSearch('');
                        }
                        if (e.key === 'Enter' && filteredCatalog[0]) {
                          addLineItemFromCatalog(filteredCatalog[0], filteredCatalog[0].unit === 'flat' ? 1 : 1);
                        }
                      }}
                      placeholder="Search or create an item..."
                      className="border border-emerald-500 rounded-md px-3 py-2 w-full text-gray-900 font-medium bg-white shadow-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingItem(false);
                        setItemSearch('');
                      }}
                      className="text-gray-300 hover:text-red-500 shrink-0"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="absolute top-[72px] left-2 w-[380px] bg-white border border-line shadow-xl rounded-lg overflow-hidden z-30">
                    {filteredCatalog.length > 0 ? (
                      filteredCatalog.map((suggestion, idx) => (
                        <button
                          key={suggestion.title}
                          type="button"
                          onClick={() => addLineItemFromCatalog(suggestion)}
                          className={`w-full text-left p-3 border-b border-line last:border-0 transition-colors ${
                            idx === 0 ? 'bg-[#22c55e] text-white hover:bg-emerald-600' : 'hover:bg-gray-50 text-gray-900'
                          }`}
                        >
                          <div className="flex justify-between font-bold mb-1">
                            <span>{suggestion.title}</span>
                            <span>{CURRENCY_META[currency].symbol}{suggestion.price}</span>
                          </div>
                          <div className={`text-xs truncate ${idx === 0 ? 'text-green-100' : 'text-gray-500'}`}>
                            {suggestion.description}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-gray-500">No catalog matches.</div>
                    )}
                    <button
                      type="button"
                      onClick={addBlankLineItem}
                      className="w-full text-left p-3 text-sm font-semibold text-[#3B82F6] hover:bg-blue-50 flex items-center gap-2 border-t border-line"
                    >
                      <Plus className="w-4 h-4" />
                      Create &quot;{itemSearch.trim() || 'New Line Item'}&quot;
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr className="table-row md:hidden md:group-hover/pricing:table-row">
                <td colSpan={4} className="pt-4 border-t-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingItem(true);
                      setEditingItemId(null);
                      setItemSearch('');
                      setActiveSection('pricing');
                      setActiveBlockId(blockId);
                      setActiveElement(null);
                    }}
                    className="text-emerald-600 hover:text-emerald-700 font-semibold text-sm flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-gray-200">
            <tr>
              <td colSpan={3} className="py-6 text-right font-bold text-gray-900 text-base">Total</td>
              <td className="py-6 text-right font-bold text-xl text-gray-900">
                <span className="inline-flex items-center justify-end gap-1.5">
                  {formatMoney(pricingTotal)}
                  <span className="text-sm text-gray-400 font-semibold">{currency}</span>
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
        {renderSectionExtras(blockId, 'pricing')}
      </div>
    </EditableBlock>
  );
  };

  const renderCanvasBlock = (block: CanvasBlock) => {
    switch (block.type) {
      case 'summary':
        return renderSummary(block.id);
      case 'goals':
        return renderGoals(block.id);
      case 'scope':
        return renderScope(block.id);
      case 'deliverables':
        return renderDeliverables(block.id);
      case 'approach':
        return renderApproach(block.id);
      case 'timeline':
        return renderTimeline(block.id);
      case 'pricing':
        return renderPricing(block.id);
      case 'payment':
        return renderPayment(block.id);
      case 'exclusions':
        return renderExclusions(block.id);
      case 'responsibilities':
        return renderResponsibilities(block.id);
      case 'revisions':
        return renderRevisions(block.id);
      case 'terms':
        return renderTerms(block.id);
      case 'next-steps':
        return renderNextSteps(block.id);
      case 'signature':
        return renderSignature(block.id);
      case 'content':
        if (block.variant === 'analysis') return renderContentAnalysis(block.id);
        if (block.variant === 'blank') return renderContentBlank(block.id);
        return renderSummary(block.id);
      case 'about':
        return renderAboutUs(block.id);
      case 'media-text':
        return renderMediaText(block.id);
      case 'image':
        return renderImage(block.id);
      case 'two-column':
        return renderTwoColumn(block.id);
      default:
        return null;
    }
  };

  const paletteIcon = (type: BlockType) => {
    switch (type) {
      case 'summary': return <AlignLeft className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'goals': return <Target className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'scope': return <ListChecks className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'deliverables': return <Package className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'approach': return <Route className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'timeline': return <Calendar className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'pricing': return <CreditCard className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'payment': return <CreditCard className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'exclusions': return <Ban className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'responsibilities': return <UserCheck className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'revisions': return <RefreshCw className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'terms': return <ScrollText className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'next-steps': return <ArrowRight className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'signature': return <PenLine className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'content': return <Type className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'image': return <ImageIcon className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'two-column': return <Columns className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'media-text': return <Layout className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      case 'about': return <Users className="w-5 h-5 mb-2 group-hover:scale-110 transition-transform" />;
      default: return <LayoutTemplate className="w-5 h-5 mb-2" />;
    }
  };

  return (
    <div className="h-full min-h-0 bg-[#F7F8FA] flex flex-col font-sans">
      
      {/* Top Navbar */}
      <header className="h-14 md:h-16 bg-white border-b border-line px-3 md:px-4 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <Link href="/proposals" className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors shrink-0">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Proposals</span>
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 min-w-0">
            <Folder className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="truncate max-w-[140px] sm:max-w-[220px] md:max-w-[280px]">{proposalTitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
          {templateMessage && (
            <span className="hidden lg:inline text-[13px] font-medium text-emerald-600">
              {templateMessage}
            </span>
          )}
          <button
            type="button"
            disabled={!proposalId}
            onClick={() => setAiWriteOpen(true)}
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-[#2563EB]" /> Write with AI
          </button>
          <button
            type="button"
            onClick={() => {
              setTemplateName(proposalTitle ? `${proposalTitle} template` : '');
              setSaveTemplateOpen(true);
            }}
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            <BookmarkPlus className="w-4 h-4 text-[#2563EB]" /> Save as template
          </button>
          <button
            type="button"
            onClick={() => void persistProposalContent()}
            className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
          >
            <Eye className="w-4 h-4 text-emerald-500" /> Preview
          </button>
          {isProposalAlreadySent(proposalStatus) && (
            <>
              <div className="w-px h-4 bg-gray-200"></div>
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
              >
                <Zap className="w-4 h-4 text-emerald-500" /> Automation
              </button>
            </>
          )}
          {proposalStatus === "accepted" && proposalId && !linkedProjectId && (
            <button
              type="button"
              onClick={() => setConvertOpen(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
            >
              <FolderKanban className="w-4 h-4 text-emerald-600" /> Convert to project
            </button>
          )}
          {proposalStatus === "accepted" && linkedProjectId && (
            <Link
              href={
                proposalClientId
                  ? `/clients/${proposalClientId}`
                  : "/tasks"
              }
              className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <FolderKanban className="w-4 h-4" /> View project
            </Link>
          )}
          <ProposalSendMenu
            status={proposalStatus}
            clientUrl={clientShareUrl}
            proposalId={proposalId}
            editingPreviouslySent={
              proposalStatus === "draft" && Boolean(resumeStatus)
            }
            busy={sendMenuBusy || draftSaving}
            onSend={async () => {
              setSendMenuBusy(true);
              await persistProposalContent();
              setSendMenuBusy(false);
              setSendOpen(true);
            }}
            onSendAgain={async () => {
              if (!proposalId) return;
              setSendMenuBusy(true);
              setTemplateMessage(null);
              try {
                await persistProposalContent();
                const recipientEmail =
                  lastRecipientEmail || clientEmail || "";
                const recipientName =
                  lastRecipientName || clientPersonName || clientName || "";
                if (!recipientEmail) {
                  setTemplateMessage("Add a client email before sending again.");
                  window.setTimeout(() => setTemplateMessage(null), 3200);
                  return;
                }
                const res = await fetch(`/api/proposals/${proposalId}/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    recipientEmail,
                    recipientName,
                    message: DEFAULT_PROPOSAL_SEND_MESSAGE,
                    sequenceKey: "none",
                    followUpSteps: [],
                  }),
                });
                const json = (await res.json()) as {
                  error?: string;
                  url?: string;
                  recipientEmail?: string;
                };
                if (!res.ok) {
                  setTemplateMessage(json.error || "Could not send again.");
                  window.setTimeout(() => setTemplateMessage(null), 4000);
                  return;
                }
                setProposalStatus("sent");
                setResumeStatus(null);
                if (json.url) setClientShareUrl(json.url);
                if (json.recipientEmail) {
                  setLastRecipientEmail(json.recipientEmail);
                }
                setActivityRefreshKey((k) => k + 1);
                setSendAgainFeedback({
                  to: json.recipientEmail || recipientEmail,
                });
              } finally {
                setSendMenuBusy(false);
              }
            }}
            onMakeChanges={async () => {
              if (!proposalId || !proposalStatus) return;
              setSendMenuBusy(true);
              const previous = proposalStatus;
              const supabase = createClient();
              const now = new Date().toISOString();
              await supabase
                .from("proposals")
                .update({ status: "draft", updated_at: now })
                .eq("id", proposalId);
              await supabase.rpc("cancel_proposal_followups", {
                p_proposal_id: proposalId,
              });
              setResumeStatus(previous);
              setProposalStatus("draft");
              setSendMenuBusy(false);
              setTemplateMessage("Editing unlocked. Close when you are done.");
              window.setTimeout(() => setTemplateMessage(null), 3200);
            }}
            onCancelAutomation={async () => {
              if (!proposalId) return;
              setSendMenuBusy(true);
              setTemplateMessage(null);
              try {
                const supabase = createClient();
                const { error } = await supabase.rpc("cancel_proposal_followups", {
                  p_proposal_id: proposalId,
                });
                if (error) {
                  setTemplateMessage(
                    error.message || "Could not cancel automation."
                  );
                } else {
                  setTemplateMessage("Follow-up automation cancelled.");
                  setActivityRefreshKey((k) => k + 1);
                }
                window.setTimeout(() => setTemplateMessage(null), 3200);
              } finally {
                setSendMenuBusy(false);
              }
            }}
            onCloseEditing={async () => {
              if (!proposalId || !resumeStatus) return;
              setSendMenuBusy(true);
              try {
                await persistProposalContent();
                const supabase = createClient();
                const now = new Date().toISOString();
                await supabase
                  .from("proposals")
                  .update({ status: resumeStatus, updated_at: now })
                  .eq("id", proposalId);
                setProposalStatus(resumeStatus);
                setResumeStatus(null);
                setTemplateMessage("Back to the live proposal.");
                window.setTimeout(() => setTemplateMessage(null), 2800);
              } finally {
                setSendMenuBusy(false);
              }
            }}
            onResendSigned={
              proposalStatus === "accepted" && proposalId
                ? async () => {
                    setSendMenuBusy(true);
                    setTemplateMessage(null);
                    try {
                      const res = await fetch(
                        `/api/proposals/${proposalId}/resend-signed`,
                        { method: "POST" }
                      );
                      const json = (await res.json()) as {
                        error?: string;
                        to?: string;
                      };
                      if (!res.ok) {
                        setTemplateMessage(
                          json.error || "Could not email signed PDF."
                        );
                      } else {
                        setTemplateMessage(
                          `Signed PDF emailed to ${json.to || "the signer"}.`
                        );
                      }
                      window.setTimeout(() => setTemplateMessage(null), 4000);
                    } finally {
                      setSendMenuBusy(false);
                    }
                  }
                : undefined
            }
            onViewActivity={
              proposalId
                ? () => setActivityModalOpen(true)
                : undefined
            }
          />
          <button
            type="button"
            onClick={() => setMobileInspectorOpen((open) => !open)}
            aria-expanded={mobileInspectorOpen}
            aria-label={mobileInspectorOpen ? "Hide editor panel" : "Show editor panel"}
            className={`md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border transition-colors ${
              mobileInspectorOpen
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-line bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <PanelRight className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {needsAiGenerate && (
        <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-amber-950">
              AI copy was not generated for this proposal
            </p>
            <p className="text-[12px] text-amber-800/80 mt-0.5">
              Your notes were saved. Open Write with AI to generate the full
              proposal copy.
            </p>
          </div>
          <button
            type="button"
            disabled={!proposalId}
            onClick={() => setAiWriteOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-50 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Write with AI
          </button>
        </div>
      )}

      {aiWriteOpen && proposalId && (
        <ProposalAiWriteModal
          proposalId={proposalId}
          onClose={() => setAiWriteOpen(false)}
          onApplied={() => {
            setAiWriteOpen(false);
            setNeedsAiGenerate(false);
            setTemplateMessage("AI proposal copy ready.");
            window.setTimeout(() => setTemplateMessage(null), 3200);
            window.location.reload();
          }}
        />
      )}

      {convertOpen && proposalId && (
        <ConvertToProjectModal
          proposalId={proposalId}
          proposalTitle={proposalTitle}
          proposalAmount={proposalAmount}
          currency={currency}
          pricingType={pricingType as ProjectBillingType}
          proposalContent={{
            pricingType,
            paymentMilestones,
          }}
          clientName={clientName}
          hasClient={Boolean(proposalClientId)}
          onClose={() => setConvertOpen(false)}
          onConverted={({ projectId, invoiceId, taskCount }) => {
            setLinkedProjectId(projectId);
            setConvertOpen(false);
            const bits = ["Project created"];
            if (invoiceId) bits.push("draft invoice ready");
            if (taskCount > 0) bits.push(`${taskCount} tasks added`);
            setTemplateMessage(bits.join(" · ") + ".");
            window.setTimeout(() => setTemplateMessage(null), 4200);
          }}
        />
      )}

      {portalReady &&
        !isProposalAlreadySent(proposalStatus) &&
        createPortal(
          <div className="md:hidden fixed bottom-0 inset-x-0 z-[35] border-t border-line bg-white/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={!proposalId || draftSaving || sendMenuBusy}
                onClick={() => void handleSaveDraft()}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Save className="w-4 h-4 text-[#2563EB]" />
                {draftSaving ? "Saving…" : "Save as draft"}
              </button>
              <button
                type="button"
                disabled={!proposalId || draftSaving || sendMenuBusy}
                onClick={() => {
                  void (async () => {
                    setSendMenuBusy(true);
                    await persistProposalContent();
                    setSendMenuBusy(false);
                    setSendOpen(true);
                  })();
                }}
                className="btn-primary inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sendMenuBusy ? "Preparing…" : "Send proposal"}
              </button>
            </div>
          </div>,
          document.body
        )}

      {activityModalOpen && proposalId ? (
        <ProposalActivityLog
          proposalId={proposalId}
          open={activityModalOpen}
          onClose={() => setActivityModalOpen(false)}
          variant="modal"
          refreshKey={activityRefreshKey}
        />
      ) : null}

      {sendOpen && proposalId && (
        <SendProposalModal
          proposalId={proposalId}
          proposalTitle={proposalTitle}
          defaultEmail={clientEmail}
          defaultName={clientPersonName || clientName}
          defaultFollowUpSequence={defaultFollowUpSequence}
          onClose={() => setSendOpen(false)}
          onSent={({ url, recipientEmail }) => {
            setSendOpen(false);
            setProposalStatus("sent");
            setResumeStatus(null);
            setClientShareUrl(url);
            setLastRecipientEmail(recipientEmail);
            const qs = new URLSearchParams({
              sent: "1",
              to: recipientEmail,
              title: proposalTitle,
            });
            router.push(`/proposals?${qs.toString()}`);
          }}
        />
      )}

      {sendAgainFeedback && (
        <ModalOverlay onClose={() => setSendAgainFeedback(null)}>
          <div className={`${modalPanelClass("max-w-[420px]")} px-5 sm:px-6 pt-8 pb-6 text-center`}>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mb-4">
              <Send className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">
              Sent again
            </h2>
            <p className="text-[15px] text-gray-500 mt-2 leading-relaxed">
              <span className="font-medium text-gray-800">{proposalTitle}</span>
              {` was emailed to ${sendAgainFeedback.to}.`}
            </p>
            <p className="text-[13px] text-gray-400 mt-2">
              You will get an alert when they open, sign, or decline it.
            </p>
            <button
              type="button"
              onClick={() => setSendAgainFeedback(null)}
              className="btn-primary mt-6 w-full px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </ModalOverlay>
      )}

      {expiryModalOpen && (() => {
        const selectedDate = parseLocalDateValue(expiryDraft);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthLabel = expiryCalendarMonth.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        const cells = buildMonthCells(expiryCalendarMonth);
        const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

        return (
          <ModalOverlay onClose={() => setExpiryModalOpen(false)}>
            <div className={modalPanelClass("max-w-[380px]")}>
              <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 flex items-start justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                    Expiration date
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedDate.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {" · "}
                    {formatExpiryLabel(fromDateInputValue(expiryDraft))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpiryModalOpen(false)}
                  className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 pb-2">
                <div className="flex flex-wrap gap-2 mb-4">
                  {[7, 14, 30, 60].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setHours(23, 59, 59, 999);
                        d.setDate(d.getDate() + days);
                        const value = toDateInputValue(d.toISOString());
                        setExpiryDraft(value);
                        setExpiryCalendarMonth(startOfMonth(d));
                      }}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors ${
                        daysUntilExpiry(fromDateInputValue(expiryDraft)) === days
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {days} days
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-line bg-[#FAFBFC] p-3">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExpiryCalendarMonth(
                          new Date(
                            expiryCalendarMonth.getFullYear(),
                            expiryCalendarMonth.getMonth() - 1,
                            1
                          )
                        )
                      }
                      className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-white transition-colors"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[14px] font-semibold text-gray-900">
                      {monthLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpiryCalendarMonth(
                          new Date(
                            expiryCalendarMonth.getFullYear(),
                            expiryCalendarMonth.getMonth() + 1,
                            1
                          )
                        )
                      }
                      className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-white transition-colors"
                      aria-label="Next month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {weekdays.map((day) => (
                      <div
                        key={day}
                        className="h-8 flex items-center justify-center text-[11px] font-semibold text-gray-400"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((date, index) => {
                      if (!date) {
                        return <div key={`empty-${index}`} className="h-9" />;
                      }

                      const value = toDateInputValue(date.toISOString());
                      const disabled = date < today;
                      const selected = sameLocalDay(date, selectedDate);
                      const isToday = sameLocalDay(date, today);

                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={disabled}
                          onClick={() => setExpiryDraft(value)}
                          className={`h-9 rounded-xl text-[13px] font-medium transition-colors ${
                            selected
                              ? "bg-emerald-600 text-white shadow-sm"
                              : disabled
                                ? "text-gray-300 cursor-not-allowed"
                                : isToday
                                  ? "text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50"
                                  : "text-gray-700 hover:bg-white"
                          }`}
                        >
                          {date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 mt-2 border-t border-line flex items-center justify-end gap-2 bg-[#FAFBFC]">
                <button
                  type="button"
                  onClick={() => setExpiryModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!expiryDraft}
                  onClick={() => void saveExpiryDate(fromDateInputValue(expiryDraft))}
                  className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </ModalOverlay>
        );
      })()}

      {saveTemplateOpen && (
        <ModalOverlay onClose={() => setSaveTemplateOpen(false)}>
          <div className={modalPanelClass("max-w-[440px]")}>
            <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Save as template</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Reuse this layout and content for other clients.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaveTemplateOpen(false)}
                className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 pb-2 space-y-4">
              <label className="block">
                <span className="block text-[13px] font-medium text-gray-700 mb-1.5">Template name</span>
                <input
                  autoFocus
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Website redesign template"
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                />
              </label>
              <label className="block">
                <span className="block text-[13px] font-medium text-gray-700 mb-1.5">Category</span>
                <MenuSelect
                  value={templateCategory}
                  onChange={setTemplateCategory}
                  options={[
                    { value: 'consulting', label: 'Consulting' },
                    { value: 'marketing', label: 'Marketing' },
                    { value: 'design', label: 'Design' },
                    { value: 'development', label: 'Development' },
                    { value: 'general', label: 'General' },
                  ]}
                />
              </label>
              {templateMessage && !templateMessage.includes('saved') && (
                <p className="text-[13px] text-red-600">{templateMessage}</p>
              )}
            </div>
            <div className="px-6 py-5 mt-2 border-t border-line flex items-center justify-end gap-2 bg-[#FAFBFC]">
              <button
                type="button"
                onClick={() => setSaveTemplateOpen(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!templateName.trim() || savingTemplate || !organizationId}
                onClick={() => void handleSaveAsTemplate()}
                className="btn-primary px-5 py-2.5 rounded-xl text-sm disabled:opacity-50"
              >
                {savingTemplate ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Editor Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        
        {/* Main Canvas Area */}
        <main 
          className={`flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 md:p-12 relative custom-scrollbar block ${
            !isProposalAlreadySent(proposalStatus) ? "pb-28 md:pb-12" : ""
          }`}
          onClick={handleCanvasClick}
        >
          {/* The "Paper" Document */}
          <div 
            className={`w-full max-w-[850px] mx-auto bg-white shadow-sm border min-h-[min(1100px,100%)] mb-24 md:mb-32 flex flex-col h-fit transition-colors ${
              draggingType && dropTarget === 'end' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-line'
            }`}
            onClick={(e) => e.stopPropagation()}
            onDragOver={(e) => {
              if (!draggingType) return;
              e.preventDefault();
              setDropTarget('end');
            }}
            onDragLeave={() => setDropTarget((prev) => (prev === 'end' ? null : prev))}
            onDrop={(e) => handleDropAt(e, 'end')}
          >
            {renderHeaderBlock()}
            {blocks.map((block) => renderCanvasBlock(block))}

            {/* End-of-document drop / add zone */}
            <div
              className={`px-4 sm:px-8 md:px-16 py-6 flex items-center justify-center transition-colors ${
                dropTarget === 'end' && draggingType ? 'bg-emerald-50' : ''
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget('end');
              }}
              onDrop={(e) => handleDropAt(e, blocks.length ? blocks[blocks.length - 1].id : 'header')}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddMenuFor((prev) => (prev === 'end' ? null : 'end'));
                  }}
                  className="bg-white border border-blue-200 text-blue-500 hover:bg-blue-50 hover:text-blue-600 rounded-full p-2 md:p-1.5 shadow-sm transition-colors"
                  title="Add section"
                >
                  <Plus className="w-5 h-5 md:w-4 md:h-4" />
                </button>
                {addMenuFor === 'end' && (
                  <SectionAddMenu
                    onPick={(item) => insertBlockAt(item, blocks.length ? blocks[blocks.length - 1].id : 'header')}
                    onClose={() => setAddMenuFor(null)}
                  />
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Mobile inspector backdrop */}
        {mobileInspectorOpen && (
          <button
            type="button"
            aria-label="Close editor panel"
            className="md:hidden absolute inset-0 z-20 bg-gray-900/40"
            onClick={() => setMobileInspectorOpen(false)}
          />
        )}

        {/* Right Settings Sidebar — drawer on mobile, fixed column on md+ */}
        <aside 
          className={`bg-[#FAFBFC] border-l border-line overflow-y-auto min-h-0 flex flex-col z-30 transition-transform duration-300 ease-out
            absolute inset-y-0 right-0 w-[min(100vw,340px)] shadow-[0_0_40px_rgba(16,24,40,0.18)]
            md:static md:w-[340px] md:shrink-0 md:shadow-none md:translate-x-0 md:pointer-events-auto
            ${mobileInspectorOpen ? "translate-x-0 pointer-events-auto" : "translate-x-full pointer-events-none md:translate-x-0"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="md:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-line bg-white shrink-0">
            <div className="text-[15px] font-semibold text-gray-900">
              {activeSection === "global" ? "Proposal settings" : "Section settings"}
            </div>
            <button
              type="button"
              onClick={() => setMobileInspectorOpen(false)}
              className="p-2 -mr-1 rounded-full text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {isProposalAlreadySent(proposalStatus) && proposalId ? (
            <ProposalActivityLog
              proposalId={proposalId}
              open
              variant="panel"
              refreshKey={activityRefreshKey}
            />
          ) : (
          <>
          {/* Default / Global State */}
          {activeSection === 'global' && (
            <div className="animate-in fade-in duration-200 divide-y divide-line">
              
              {/* Overview Section */}
              <div className="bg-white">
                <button 
                  onClick={() => setOverviewOpen(!overviewOpen)}
                  className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
                >
                  <h3 className="font-semibold text-gray-900">Overview</h3>
                  {overviewOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                
                {overviewOpen && (
                  <div className="px-6 pb-6 space-y-4 text-[13px] animate-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Status</span>
                      <span className="font-semibold bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-xs">Drafted</span>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-gray-500 font-medium shrink-0">Pricing</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-gray-400 font-semibold">
                          {CURRENCY_META[currency].symbol}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={Number.isFinite(proposalAmount) ? proposalAmount : 0}
                          onFocus={() => setAmountFocused(true)}
                          onChange={(e) => {
                            setProposalAmount(Number(e.target.value) || 0);
                          }}
                          onBlur={() => {
                            setAmountFocused(false);
                            const next = Math.max(0, Number(proposalAmount) || 0);
                            setProposalAmount(next);
                            void persistOverviewPricing({ amount: next });
                          }}
                          className="w-[110px] text-right font-semibold text-gray-900 bg-transparent border border-transparent hover:border-gray-200 focus:border-emerald-400 focus:bg-white rounded-lg px-2 py-1 outline-none transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-gray-500 font-medium shrink-0">Pricing type</span>
                      <div className="w-[132px]">
                        <MenuSelect
                          value={pricingType}
                          options={PRICING_TYPE_OPTIONS}
                          onChange={(value) => {
                            setPricingType(value);
                            void persistOverviewPricing({ pricingType: value });
                          }}
                          className="[&_button]:py-1.5 [&_button]:px-2.5 [&_button]:rounded-lg [&_button]:text-[13px] [&_button]:font-semibold [&_button]:border-gray-200"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-gray-500 font-medium">Expiration</span>
                      <button
                        type="button"
                        onClick={() => {
                          setExpiryDraft(toDateInputValue(expiresAt));
                          setExpiryCalendarMonth(
                            startOfMonth(new Date(expiresAt))
                          );
                          setExpiryModalOpen(true);
                        }}
                        className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                        title={new Date(expiresAt).toLocaleString()}
                      >
                        {formatExpiryLabel(expiresAt)}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Style Section */}
              <div className="bg-white">
                <button 
                  onClick={() => setStyleOpen(!styleOpen)}
                  className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
                >
                  <h3 className="font-semibold text-gray-900">Style</h3>
                  {styleOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                
                {styleOpen && (
                  <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
                    <div className="mb-4">
                      <label className="text-[11px] font-bold text-gray-800 uppercase tracking-wide">Header Styles</label>
                    </div>
                    
                    <div className="flex items-center justify-between mb-5 text-[13px]">
                      <span className="font-medium text-gray-600">Theme</span>
                      <button className="flex items-center gap-1.5 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50 font-medium text-gray-700">
                        <LayoutTemplate className="w-4 h-4 text-emerald-500" /> {headerTheme.charAt(0).toUpperCase() + headerTheme.slice(1)}
                      </button>
                    </div>

                    <div className="mb-8">
                      <span className="block text-xs font-semibold text-gray-900 mb-3">Select a header theme:</span>
                      <div className="grid grid-cols-2 gap-3">
                        <ThemeCard name="Cover" active={headerTheme === 'cover'} onClick={() => applyHeaderTheme('cover')} icon={<BoxSelect className="w-4 h-4" />} />
                        <ThemeCard name="Classic" active={headerTheme === 'classic'} onClick={() => applyHeaderTheme('classic')} icon={<AlignLeft className="w-4 h-4" />} />
                        <ThemeCard name="Alpine" active={headerTheme === 'alpine'} onClick={() => applyHeaderTheme('alpine')} icon={<Columns className="w-4 h-4" />} />
                        <ThemeCard name="Splash" active={headerTheme === 'splash'} onClick={() => applyHeaderTheme('splash')} icon={<LayoutTemplate className="w-4 h-4" />} />
                        <ThemeCard name="Auburn" active={headerTheme === 'auburn'} onClick={() => applyHeaderTheme('auburn')} icon={<BoxSelect className="w-4 h-4" />} />
                        <ThemeCard name="Pastel" active={headerTheme === 'pastel'} onClick={() => applyHeaderTheme('pastel')} icon={<LayoutTemplate className="w-4 h-4" />} />
                      </div>
                    </div>

                    {renderHeaderStyleControls()}
                  </div>
                )}
              </div>

              {/* Add Section — desktop only; on mobile use the canvas + button */}
              <div className="bg-white hidden md:block">
                <button 
                  onClick={() => setAddSectionOpen(!addSectionOpen)}
                  className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
                >
                  <h3 className="font-semibold text-gray-900">Add Section</h3>
                  {addSectionOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                
                {addSectionOpen && (
                  <div className="px-6 pb-6 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-[11px] text-gray-500 mb-3">Drag onto the canvas, or click to append.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {SECTION_PALETTE.map((item) => (
                        <button
                          key={`${item.type}-${item.variant || 'default'}`}
                          type="button"
                          draggable
                          onDragStart={(e) => handlePaletteDragStart(e, item)}
                          onDragEnd={handlePaletteDragEnd}
                          onClick={() => insertBlockAt(item, blocks.length ? blocks[blocks.length - 1].id : 'header')}
                          className={`flex flex-col items-center justify-center py-4 px-2 rounded-lg border text-gray-500 transition-all bg-white group shadow-sm hover:shadow cursor-grab active:cursor-grabbing ${
                            draggingType === item.type
                              ? 'border-emerald-500 text-emerald-600 ring-1 ring-emerald-200'
                              : 'border-gray-200 hover:border-emerald-500 hover:text-emerald-600'
                          }`}
                        >
                          {paletteIcon(item.type)}
                          <span className="text-[11px] font-semibold">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Section Edit State */}
          {activeSection !== 'global' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-200 bg-white h-full flex flex-col">
              <div className="p-4 border-b border-line bg-white sticky top-0 z-10 shrink-0">
                <button 
                  onClick={() => { setActiveSection('global'); setActiveBlockId(null); setActiveElement(null); setAddMenuFor(null); setEditingEntry(null); setEditingItemId(null); setIsAddingItem(false); }} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors shadow-sm"
                >
                  Finish Styling
                </button>
              </div>
              
              <div className="p-6 space-y-6 bg-white flex-1">
                
                {activeElement ? (
                  // Deep Element Editing Mode — live-bound to canvas
                  (() => {
                    const style = elementStyles[activeElement.id] || {};
                    return (
                      <>
                        <div>
                          <h3 className="text-[13px] font-bold text-gray-900 mb-1">
                            Editing: {activeElement.type.charAt(0).toUpperCase() + activeElement.type.slice(1)} Element
                          </h3>
                        </div>

                        {(activeElement.type === 'text' || activeElement.type === 'heading') && (
                          <div className="animate-in fade-in duration-200">
                            <div className="mb-5">
                              <label className="block text-xs font-bold text-gray-900 mb-2">Content</label>
                              <textarea
                                value={style.content || ''}
                                onChange={(e) => updateElementStyle(activeElement.id, { content: e.target.value })}
                                rows={activeElement.type === 'heading' ? 2 : 5}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white resize-y"
                              />
                            </div>

                            <div className="mb-5">
                              <label className="block text-xs font-bold text-gray-900 mb-2">Typography</label>
                              <select
                                value={style.fontFamily || 'Inter'}
                                onChange={(e) => updateElementStyle(activeElement.id, { fontFamily: e.target.value })}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white mb-3"
                              >
                                <option>Inter</option>
                                <option>Georgia</option>
                              </select>
                              <select
                                value={style.fontWeight || 'Normal'}
                                onChange={(e) => updateElementStyle(activeElement.id, { fontWeight: e.target.value })}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                              >
                                <option>Normal</option>
                                <option>Bold</option>
                                <option>Light</option>
                              </select>
                            </div>
                            
                            <div className="mb-5">
                              <label className="block text-xs font-bold text-gray-900 mb-2">Color</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={style.color || '#6D5D4B'}
                                  onChange={(e) => updateElementStyle(activeElement.id, { color: e.target.value })}
                                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent p-0"
                                />
                                <input
                                  type="text"
                                  value={style.color || '#6D5D4B'}
                                  onChange={(e) => updateElementStyle(activeElement.id, { color: e.target.value })}
                                  className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white uppercase font-mono"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-gray-900 mb-2">Font Size</label>
                                <div className="flex items-center border border-gray-200 rounded-md bg-white">
                                  <input
                                    type="number"
                                    value={style.fontSize ?? (activeElement.type === 'heading' ? 24 : 15)}
                                    onChange={(e) => updateElementStyle(activeElement.id, { fontSize: Number(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-transparent"
                                  />
                                  <span className="pr-3 text-xs text-gray-400">px</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-900 mb-2">Line Height</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={style.lineHeight ?? 1.5}
                                  onChange={(e) => updateElementStyle(activeElement.id, { lineHeight: Number(e.target.value) || 1 })}
                                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {activeElement.type === 'image' && (
                          <div className="animate-in fade-in duration-200">
                            <div className="mb-5">
                              <label className="block text-xs font-bold text-gray-900 mb-2">Image Source</label>
                              <button
                                type="button"
                                onClick={() => updateElementStyle(activeElement.id, {
                                  src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80',
                                })}
                                className="w-full py-2.5 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 mb-3"
                              >
                                <ImageIcon className="w-4 h-4" /> Replace Image
                              </button>
                              <input
                                type="text"
                                value={style.src || ''}
                                onChange={(e) => updateElementStyle(activeElement.id, { src: e.target.value })}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white text-ellipsis overflow-hidden"
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-gray-900 mb-2">Corner Radius</label>
                                <input
                                  type="number"
                                  value={style.borderRadius ?? 16}
                                  onChange={(e) => updateElementStyle(activeElement.id, { borderRadius: Number(e.target.value) || 0 })}
                                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-900 mb-2">Opacity</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={style.opacity ?? 100}
                                  onChange={(e) => updateElementStyle(activeElement.id, { opacity: Number(e.target.value) || 0 })}
                                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="pt-6 border-t border-gray-200 mt-6 flex justify-between items-center">
                          <button 
                            onClick={() => setActiveElement(null)}
                            className="text-sm font-medium text-[#3B82F6] hover:text-blue-700 flex items-center gap-1"
                          >
                            <ChevronLeft className="w-4 h-4" /> Back to Section
                          </button>
                          <button
                            type="button"
                            onClick={deleteActiveElement}
                            className="text-gray-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded"
                            title="Delete Element"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  // Standard Section Editing Mode
                  <>
                    <div>
                      <h3 className="text-[13px] font-bold text-gray-900 mb-1">
                        Editing: {
                          activeSection === 'pricing' ? 'Pricing' :
                          activeSection === 'next-steps' ? 'Next Steps' :
                          activeSection === 'payment' ? 'Payment Schedule' :
                          activeSection.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                        } Section
                      </h3>
                      <div className="text-xs text-gray-500 mt-1">
                        {editingEntry || editingItemId
                          ? 'Editing a selected item. Click empty space in the section to return to section options.'
                          : 'Section options below. Click text or items on the canvas to edit them.'}
                      </div>
                    </div>

                    {renderElementPalette()}
                    {activeSection === 'header' ? renderHeaderStyleControls() : renderSectionStyleControls()}

                    {activeSection === 'about' && (
                      <div className="mb-5 space-y-3">
                        <label className="block text-xs font-bold text-gray-900 mb-2">Stats</label>
                        {aboutStats.map((stat) => (
                          <div key={stat.id} className="p-3 rounded-lg border border-line bg-gray-50/80 space-y-2">
                            <input
                              type="text"
                              value={stat.value}
                              onChange={(e) => updateAboutStat(stat.id, { value: e.target.value })}
                              onFocus={() => setEditingEntry({ kind: 'about-stat', id: stat.id })}
                              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm font-bold text-gray-900 outline-none bg-white"
                              placeholder="Value"
                            />
                            <input
                              type="text"
                              value={stat.label}
                              onChange={(e) => updateAboutStat(stat.id, { label: e.target.value })}
                              onFocus={() => setEditingEntry({ kind: 'about-stat', id: stat.id })}
                              className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-600 outline-none bg-white"
                              placeholder="Label"
                            />
                            <button
                              type="button"
                              onClick={() => removeAboutStat(stat.id)}
                              className="w-full text-[11px] font-semibold text-red-500 hover:bg-red-50 py-1 rounded"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addAboutStat}
                          className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 font-semibold py-2 rounded-md text-sm flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" /> Add stat
                        </button>
                      </div>
                    )}

                    {['summary', 'goals', 'scope', 'deliverables', 'approach', 'timeline', 'payment', 'exclusions', 'responsibilities', 'revisions', 'terms', 'next-steps', 'signature', 'content', 'header', 'image', 'two-column', 'media-text', 'about'].includes(activeSection as string) && (
                      <div className="animate-in fade-in duration-200">
                        {editingEntry && (
                        <div className="text-sm text-gray-500 mb-5 pb-5 border-b border-line">
                          <p className="font-semibold text-gray-900">
                            {activeSection === 'goals' && `${projectGoals.length} goals`}
                            {activeSection === 'scope' && `${scopeIncluded.length} items`}
                            {activeSection === 'deliverables' && `${keyDeliverables.length} deliverables`}
                            {activeSection === 'approach' && `${approachSteps.length} steps`}
                            {activeSection === 'timeline' && `${timelinePhases.length} phases`}
                            {activeSection === 'payment' && `${paymentMilestones.length} milestones`}
                            {activeSection === 'exclusions' && `${scopeExcluded.length} exclusions`}
                            {activeSection === 'responsibilities' && `${clientResponsibilities.length} responsibilities`}
                            {activeSection === 'terms' && `${termEntries.length} terms`}
                          </p>
                        </div>
                        )}

                        {editingEntry && activeSection === 'scope' && (() => {
                          const list = editingEntry.kind === 'scope-included' ? 'included' : editingEntry.kind === 'scope-excluded' ? 'excluded' : null;
                          if (!list) return null;
                          const entry = (list === 'included' ? scopeIncluded : scopeExcluded).find((e) => e.id === editingEntry.id);
                          if (!entry) return null;
                          return (
                            <div className="mb-5 p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-3">
                              <div className="text-xs font-bold text-gray-900">Selected item</div>
                              <input
                                type="text"
                                value={entry.text}
                                onChange={(e) => updateScopeEntry(list, entry.id, e.target.value)}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-900 outline-none bg-white"
                              />
                              <button type="button" onClick={() => removeScopeEntry(list, entry.id)} className="w-full border border-red-100 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-md text-sm">
                                Remove item
                              </button>
                            </div>
                          );
                        })()}

                        {editingEntry?.kind === 'approach' && (() => {
                          const step = approachSteps.find((s) => s.id === editingEntry.id);
                          if (!step) return null;
                          return (
                            <div className="mb-5 p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-3">
                              <div className="text-xs font-bold text-gray-900">Selected step</div>
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Title</label>
                                <input
                                  type="text"
                                  value={step.title}
                                  onChange={(e) => updateApproachStep(step.id, { title: e.target.value })}
                                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-semibold outline-none bg-white"
                                  placeholder="Phase title"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Description</label>
                                <textarea
                                  value={step.description}
                                  onChange={(e) => updateApproachStep(step.id, { description: e.target.value })}
                                  rows={3}
                                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none bg-white resize-y"
                                  placeholder="What happens in this phase"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeApproachStep(step.id)}
                                className="w-full border border-red-100 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-md text-sm"
                              >
                                Remove step
                              </button>
                            </div>
                          );
                        })()}

                        {editingEntry?.kind === 'timeline' && (() => {
                          const phase = timelinePhases.find((p) => p.id === editingEntry.id);
                          if (!phase) return null;
                          return (
                            <div className="mb-5 p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-3">
                              <div className="text-xs font-bold text-gray-900">Selected phase</div>
                              <input type="text" value={phase.week} onChange={(e) => updateTimelinePhase(phase.id, { week: e.target.value })} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none bg-white" placeholder="Week" />
                              <input type="text" value={phase.title} onChange={(e) => updateTimelinePhase(phase.id, { title: e.target.value })} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-semibold outline-none bg-white" placeholder="Focus" />
                              <textarea value={phase.detail} onChange={(e) => updateTimelinePhase(phase.id, { detail: e.target.value })} rows={3} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none bg-white resize-y" />
                              <button type="button" onClick={() => removeTimelinePhase(phase.id)} className="w-full border border-red-100 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-md text-sm">Remove phase</button>
                            </div>
                          );
                        })()}

                        {editingEntry?.kind === 'payment' && (() => {
                          const m = paymentMilestones.find((p) => p.id === editingEntry.id);
                          if (!m) return null;
                          return (
                            <div className="mb-5 p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-3">
                              <div className="text-xs font-bold text-gray-900">Selected milestone</div>
                              <input type="text" value={m.label} onChange={(e) => updatePaymentMilestone(m.id, { label: e.target.value })} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-semibold outline-none bg-white" />
                              <div className="grid grid-cols-2 gap-2">
                                <input type="text" value={m.pct} onChange={(e) => updatePaymentMilestone(m.id, { pct: e.target.value })} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none bg-white" placeholder="Share" />
                                <input type="text" value={m.when} onChange={(e) => updatePaymentMilestone(m.id, { when: e.target.value })} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none bg-white" placeholder="Due" />
                              </div>
                              <button type="button" onClick={() => removePaymentMilestone(m.id)} className="w-full border border-red-100 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-md text-sm">Remove milestone</button>
                            </div>
                          );
                        })()}

                        {editingEntry?.kind === 'terms' && (() => {
                          const term = termEntries.find((t) => t.id === editingEntry.id);
                          if (!term) return null;
                          return (
                            <div className="mb-5 p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-3">
                              <div className="text-xs font-bold text-gray-900">Selected term</div>
                              <input type="text" value={term.title} onChange={(e) => updateTermEntry(term.id, { title: e.target.value })} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-semibold outline-none bg-white" />
                              <textarea value={term.body} onChange={(e) => updateTermEntry(term.id, { body: e.target.value })} rows={3} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none bg-white resize-y" />
                              <button type="button" onClick={() => removeTermEntry(term.id)} className="w-full border border-red-100 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-md text-sm">Remove term</button>
                            </div>
                          );
                        })()}

                        <div className="space-y-2 mb-5">
                          {activeSection === 'goals' && (
                            <button type="button" onClick={addGoalEntry} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add goal
                            </button>
                          )}
                          {activeSection === 'scope' && (
                            <button type="button" onClick={() => addScopeEntry('included')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add scope item
                            </button>
                          )}
                          {activeSection === 'deliverables' && (
                            <button type="button" onClick={addDeliverableEntry} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add deliverable
                            </button>
                          )}
                          {activeSection === 'approach' && (
                            <button type="button" onClick={addApproachStep} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add step
                            </button>
                          )}
                          {activeSection === 'exclusions' && (
                            <button type="button" onClick={() => addScopeEntry('excluded')} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add exclusion
                            </button>
                          )}
                          {activeSection === 'responsibilities' && (
                            <button type="button" onClick={addResponsibility} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add responsibility
                            </button>
                          )}
                          {activeSection === 'timeline' && (
                            <button type="button" onClick={addTimelinePhase} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add phase
                            </button>
                          )}
                          {activeSection === 'payment' && (
                            <button type="button" onClick={addPaymentMilestone} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add milestone
                            </button>
                          )}
                          {activeSection === 'terms' && (
                            <button type="button" onClick={addTermEntry} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-1.5">
                              <Plus className="w-4 h-4" /> Add term
                            </button>
                          )}
                        </div>

                        <div className="pt-5 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => { if (activeBlockId && activeBlockId !== 'header') removeBlock(activeBlockId); }}
                            className="w-full border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 bg-white font-semibold py-2 rounded-md text-sm transition-colors"
                          >
                            Delete Section
                          </button>
                        </div>
                      </div>
                    )}

                    {activeSection === 'pricing' && (
                      <div className="animate-in fade-in duration-200">
                        <div className="text-sm text-gray-500 mb-5 pb-5 border-b border-line">
                          <p className="mb-1">Click a row to edit it. Use <span className="font-semibold text-gray-700">Add Item</span> to search the catalog or create a custom line.</p>
                          <p className="mt-2 font-semibold text-gray-900">{lineItems.length} items · {formatMoney(pricingTotal)}</p>
                        </div>
                        
                        <div className="mb-5">
                          <label className="block text-xs font-bold text-gray-900 mb-2">Currency</label>
                          <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-700 outline-none bg-white"
                          >
                            {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                              <option key={code} value={code}>{CURRENCY_META[code].label}</option>
                            ))}
                          </select>
                        </div>

                        {editingItemId && (() => {
                          const item = lineItems.find((i) => i.id === editingItemId);
                          if (!item) return null;
                          return (
                            <div className="mb-5 p-3 rounded-lg border border-blue-100 bg-blue-50/50 space-y-3">
                              <div className="text-xs font-bold text-gray-900">Selected Item</div>
                              <input
                                type="text"
                                value={item.title}
                                onChange={(e) => updateLineItem(item.id, { title: e.target.value })}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-medium text-gray-900 outline-none bg-white"
                              />
                              <textarea
                                value={item.description}
                                onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                rows={3}
                                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-600 outline-none bg-white resize-y"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Qty</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={item.qty}
                                    onChange={(e) => updateLineItem(item.id, { qty: Number(e.target.value) || 0 })}
                                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Price</label>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={item.price}
                                    onChange={(e) => updateLineItem(item.id, { price: Number(e.target.value) || 0 })}
                                    className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm outline-none bg-white"
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeLineItem(item.id)}
                                className="w-full border border-red-100 text-red-600 hover:bg-red-50 font-semibold py-2 rounded-md text-sm transition-colors"
                              >
                                Remove Item
                              </button>
                            </div>
                          );
                        })()}

                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingItem(true);
                            setEditingItemId(null);
                            setItemSearch('');
                          }}
                          className="w-full mb-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-md text-sm transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" /> Add Item
                        </button>

                        <div className="pt-5 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => { if (activeBlockId && activeBlockId !== 'header') removeBlock(activeBlockId); }}
                            className="w-full border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 bg-white font-semibold py-2 rounded-md text-sm transition-colors"
                          >
                            Delete Section
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          </>
          )}

        </aside>
      </div>
    </div>
  );
}

function InlineEditableText({
  as = 'p',
  content,
  style,
  className = '',
  isActive,
  onSelect,
  onChange,
}: {
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div';
  id: string;
  type: ElementKind;
  sectionId: SectionType;
  content: string;
  style?: React.CSSProperties;
  className?: string;
  isActive: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLHeadingElement | HTMLParagraphElement | HTMLDivElement>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current && ref.current && ref.current.textContent !== content) {
      ref.current.textContent = content;
    }
  }, [content]);

  const sharedProps = {
    ref: ref as React.RefObject<HTMLHeadingElement & HTMLParagraphElement & HTMLDivElement>,
    contentEditable: true as const,
    suppressContentEditableWarning: true,
    spellCheck: true,
    className: `outline-none cursor-text border-2 transition-colors rounded p-1 -m-1 relative z-10 ${
      isActive ? 'border-blue-400 bg-blue-50/30 ring-1 ring-blue-200' : 'border-transparent hover:border-blue-200'
    } ${className}`,
    style,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(e);
    },
    onMouseDown: (e: React.MouseEvent) => {
      e.stopPropagation();
    },
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      focusedRef.current = false;
      onChange(e.currentTarget.textContent || '');
    },
    onInput: (e: React.FormEvent<HTMLElement>) => {
      onChange(e.currentTarget.textContent || '');
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      e.stopPropagation();
      if ((as === 'h1' || as === 'h2' || as === 'h3') && e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };

  if (as === 'h1') return <h1 {...sharedProps} />;
  if (as === 'h2') return <h2 {...sharedProps} />;
  if (as === 'h3') return <h3 {...sharedProps} />;
  if (as === 'div') return <div {...sharedProps} />;
  return <p {...sharedProps} />;
}

function SectionAddMenu({
  onPick,
  onClose,
}: {
  onPick: (item: PaletteItem) => void;
  onClose: () => void;
}) {
  const iconClass = "w-5 h-5 md:w-3.5 md:h-3.5";
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-gray-900/40 md:bg-transparent"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] bg-white border-t border-line shadow-[0_-12px_40px_rgba(16,24,40,0.16)] rounded-t-[1.75rem] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 pb-[env(safe-area-inset-bottom)] md:absolute md:inset-x-auto md:bottom-auto md:left-1/2 md:top-full md:mt-2 md:w-[280px] md:max-h-[320px] md:-translate-x-1/2 md:rounded-xl md:border md:shadow-xl md:pb-0 md:animate-in md:zoom-in-95">
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-5 py-3.5 md:px-3 md:py-2 border-b border-line flex items-center justify-between gap-3">
          <div className="text-[16px] md:text-[11px] font-semibold text-gray-900 md:text-gray-500 md:uppercase md:tracking-wide">
            Add section
          </div>
          <button
            type="button"
            onClick={onClose}
            className="md:hidden p-2 -mr-1 rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 sm:p-3 md:p-2 grid grid-cols-2 gap-2 md:gap-1.5 max-h-[min(76dvh,640px)] md:max-h-[280px] overflow-y-auto">
          {SECTION_PALETTE.map((item) => (
            <button
              key={`${item.type}-${item.variant || 'default'}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(item);
              }}
              className="flex items-center gap-3 md:gap-2 px-3.5 py-3.5 md:px-2.5 md:py-2 rounded-xl md:rounded-lg text-left text-[15px] md:text-[12px] font-medium text-gray-800 md:text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-50 transition-colors border border-transparent md:border-0 bg-[#FAFBFC] md:bg-transparent"
            >
              <span className="text-gray-400 shrink-0">
                {item.type === 'summary' && <AlignLeft className={iconClass} />}
                {item.type === 'goals' && <Target className={iconClass} />}
                {item.type === 'scope' && <ListChecks className={iconClass} />}
                {item.type === 'deliverables' && <Package className={iconClass} />}
                {item.type === 'approach' && <Route className={iconClass} />}
                {item.type === 'timeline' && <Calendar className={iconClass} />}
                {item.type === 'pricing' && <CreditCard className={iconClass} />}
                {item.type === 'payment' && <CreditCard className={iconClass} />}
                {item.type === 'exclusions' && <Ban className={iconClass} />}
                {item.type === 'responsibilities' && <UserCheck className={iconClass} />}
                {item.type === 'revisions' && <RefreshCw className={iconClass} />}
                {item.type === 'terms' && <ScrollText className={iconClass} />}
                {item.type === 'next-steps' && <ArrowRight className={iconClass} />}
                {item.type === 'signature' && <PenLine className={iconClass} />}
                {item.type === 'content' && <Type className={iconClass} />}
                {item.type === 'image' && <ImageIcon className={iconClass} />}
                {item.type === 'about' && <Users className={iconClass} />}
              </span>
              <span className="min-w-0 leading-snug">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function EditableBlock({
  blockId,
  sectionType,
  activeBlockId,
  onSelect,
  addMenuOpen,
  onOpenAddMenu,
  onCloseAddMenu,
  onAddSection,
  isDropTarget,
  onDragOverGap,
  onDragLeaveGap,
  onDropAt,
  onMoveUp,
  onMoveDown,
  onDelete,
  draggingActive,
  isElementDropTarget,
  draggingElement,
  onElementDragOver,
  onElementDragLeave,
  onElementDrop,
  children,
}: {
  blockId: string;
  sectionType: SectionType;
  activeBlockId: string | null;
  onSelect: (type: SectionType, blockId: string) => void;
  addMenuOpen: boolean;
  onOpenAddMenu: () => void;
  onCloseAddMenu: () => void;
  onAddSection: (item: PaletteItem) => void;
  isDropTarget: boolean;
  onDragOverGap: (e: React.DragEvent) => void;
  onDragLeaveGap: () => void;
  onDropAt: (e: React.DragEvent) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  draggingActive: boolean;
  isElementDropTarget?: boolean;
  draggingElement?: boolean;
  onElementDragOver?: (e: React.DragEvent) => void;
  onElementDragLeave?: () => void;
  onElementDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  const isActive = activeBlockId === blockId;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { if (!addMenuOpen) setIsHovered(false); }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(sectionType, blockId); }}
        onDragOver={onElementDragOver}
        onDragLeave={onElementDragLeave}
        onDrop={onElementDrop}
        className={`relative transition-all cursor-pointer border-[2px] ${
          isElementDropTarget && draggingElement
            ? 'border-emerald-500 bg-emerald-50/40 z-10'
            : isActive
              ? 'border-[#3B82F6] z-10'
              : 'border-transparent hover:border-blue-200 z-0'
        }`}
      >
        {draggingElement && isElementDropTarget && (
          <div className="pointer-events-none absolute inset-x-4 top-3 z-20 rounded-md border border-dashed border-emerald-400 bg-emerald-50/90 px-3 py-1.5 text-center text-[11px] font-semibold text-emerald-700">
            Drop to add element
          </div>
        )}
        {children}
        
        {isActive && (
          <div className="absolute top-2 right-2 md:top-1/2 md:-right-12 md:-translate-y-1/2 flex flex-row md:flex-col gap-1 z-20">
            <button 
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 bg-white shadow-sm border border-line rounded-md md:mb-2 flex items-center justify-center transition-colors"
              title="Finish section"
              onClick={(e) => { e.stopPropagation(); onSelect('global', 'global'); }}
            >
              <Check className="w-4 h-4" />
            </button>
            
            <div className="bg-white shadow-sm border border-line rounded-md overflow-hidden flex flex-row md:flex-col">
              {onMoveUp && (
                <>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-colors" title="Move Up"><ChevronUp className="w-4 h-4" /></button>
                  <div className="hidden md:block h-px bg-gray-100 mx-1"></div>
                  <div className="md:hidden w-px bg-gray-100 my-1"></div>
                </>
              )}
              {onMoveDown && (
                <>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-colors" title="Move Down"><ChevronDown className="w-4 h-4" /></button>
                  <div className="hidden md:block h-px bg-gray-100 mx-1"></div>
                  <div className="md:hidden w-px bg-gray-100 my-1"></div>
                </>
              )}
              {onDelete && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><Trash className="w-4 h-4" /></button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Insert / drop gap — always tappable on mobile */}
      <div
        className={`relative h-10 md:h-8 w-full flex items-center justify-center transition-all duration-150 ${
          isHovered || isActive || addMenuOpen || (draggingActive && isDropTarget)
            ? 'opacity-100'
            : 'opacity-100 md:opacity-0'
        } ${isDropTarget && draggingActive ? 'bg-emerald-50' : ''}`}
        onDragOver={onDragOverGap}
        onDragLeave={onDragLeaveGap}
        onDrop={onDropAt}
      >
        <div className={`w-full h-px absolute left-0 right-0 ${isDropTarget && draggingActive ? 'bg-emerald-400' : 'bg-blue-100'}`}></div>
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenAddMenu();
          }}
          className={`relative z-10 bg-white border rounded-full p-1.5 md:p-1 shadow-sm transition-colors ${
            addMenuOpen || (isDropTarget && draggingActive)
              ? 'border-emerald-400 text-emerald-600'
              : 'border-blue-200 text-blue-500 hover:bg-blue-50 hover:text-blue-600'
          }`}
          title="Add section here"
        >
          <Plus className="w-4 h-4" />
        </button>
        {addMenuOpen && (
          <SectionAddMenu onPick={onAddSection} onClose={onCloseAddMenu} />
        )}
      </div>
    </div>
  );
}

function ThemeCard({ name, active, onClick, icon }: { name: string, active: boolean, onClick: () => void, icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center py-4 px-2 rounded-lg border transition-all bg-white ${
        active ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-sm' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className={`w-8 h-10 border-2 rounded mb-3 flex items-center justify-center ${active ? 'border-emerald-500 text-emerald-500' : 'border-gray-200 text-gray-400'}`}>
        {icon || <LayoutTemplate className="w-4 h-4" />}
      </div>
      <span className={`text-[11px] font-semibold ${active ? 'text-emerald-700' : 'text-gray-500'}`}>{name}</span>
    </button>
  );
}