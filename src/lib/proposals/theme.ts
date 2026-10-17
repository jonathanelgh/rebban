import type { CSSProperties } from "react";
import type { ProposalContentSnapshot, ProposalHeaderTheme } from "@/lib/proposals/content";
import { mergeElementStyles } from "@/lib/proposals/content";

export type HeaderLayout = {
  backgroundImage: string;
  backgroundImagePath?: string;
  overlayOpacity: number;
  shellBackgroundColor: string;
  contentBackgroundColor: string;
  contentPadding: number;
  contentBorderRadius: number;
};

export const HEADER_THEME_PRESETS: Record<ProposalHeaderTheme, HeaderLayout> = {
  cover: {
    backgroundImage:
      "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80",
    overlayOpacity: 55,
    shellBackgroundColor: "#111827",
    contentBackgroundColor: "transparent",
    contentPadding: 8,
    contentBorderRadius: 0,
  },
  classic: {
    backgroundImage: "",
    overlayOpacity: 0,
    shellBackgroundColor: "#FFFFFF",
    contentBackgroundColor: "transparent",
    contentPadding: 0,
    contentBorderRadius: 0,
  },
  pastel: {
    backgroundImage: "",
    overlayOpacity: 0,
    shellBackgroundColor: "#FAF7F2",
    contentBackgroundColor: "#FFFFFF",
    contentPadding: 40,
    contentBorderRadius: 16,
  },
  alpine: {
    backgroundImage:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80",
    overlayOpacity: 28,
    shellBackgroundColor: "#E7EEF3",
    contentBackgroundColor: "#FFFFFF",
    contentPadding: 36,
    contentBorderRadius: 18,
  },
  splash: {
    backgroundImage:
      "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80",
    overlayOpacity: 42,
    shellBackgroundColor: "#0F172A",
    contentBackgroundColor: "transparent",
    contentPadding: 20,
    contentBorderRadius: 0,
  },
  auburn: {
    backgroundImage: "",
    overlayOpacity: 0,
    shellBackgroundColor: "#3F2417",
    contentBackgroundColor: "#FFF8F1",
    contentPadding: 40,
    contentBorderRadius: 14,
  },
};

const FONT_WEIGHT_MAP: Record<string, number> = {
  Light: 300,
  Normal: 400,
  Bold: 700,
};

/** Typography defaults so AI content-only snapshots still look designed. */
export const DEFAULT_PROPOSAL_ELEMENT_STYLES: Record<
  string,
  {
    content?: string;
    fontFamily?: string;
    fontWeight?: string;
    color?: string;
    fontSize?: number;
    lineHeight?: number;
  }
> = {
  "header-logo-name": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#111827",
    fontSize: 14,
    lineHeight: 1.3,
  },
  "header-title": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#111827",
    fontSize: 36,
    lineHeight: 1.15,
  },
  "header-client": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#4B5563",
    fontSize: 16,
    lineHeight: 1.4,
  },
  "header-date": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#374151",
    fontSize: 13,
    lineHeight: 1.4,
  },
  "header-validity": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#374151",
    fontSize: 13,
    lineHeight: 1.4,
  },
  "header-subtitle": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 1.4,
  },
  "summary-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "summary-text": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#374151",
    fontSize: 15,
    lineHeight: 1.65,
  },
  "goals-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "goals-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "scope-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "scope-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "deliverables-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "deliverables-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "approach-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "approach-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "timeline-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "timeline-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "payment-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "payment-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "payment-terms-note": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#4B5563",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "exclusions-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "exclusions-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "responsibilities-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "responsibilities-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "revisions-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "revisions-text": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#374151",
    fontSize: 15,
    lineHeight: 1.65,
  },
  "terms-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "terms-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "next-steps-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "next-steps-text": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#374151",
    fontSize: 15,
    lineHeight: 1.65,
  },
  "signature-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#6D5D4B",
    fontSize: 24,
    lineHeight: 1.3,
  },
  "signature-intro": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.6,
  },
  "about-heading": {
    fontFamily: "Inter",
    fontWeight: "Bold",
    color: "#111827",
    fontSize: 30,
    lineHeight: 1.25,
  },
  "about-text": {
    fontFamily: "Inter",
    fontWeight: "Normal",
    color: "#4B5563",
    fontSize: 15,
    lineHeight: 1.6,
  },
};

export function resolveHeaderLayout(
  content: ProposalContentSnapshot
): { theme: ProposalHeaderTheme; layout: HeaderLayout } {
  const theme =
    content.headerTheme && content.headerTheme in HEADER_THEME_PRESETS
      ? content.headerTheme
      : "classic";
  const preset = HEADER_THEME_PRESETS[theme];
  const saved =
    content.headerLayout && typeof content.headerLayout === "object"
      ? (content.headerLayout as Partial<HeaderLayout>)
      : {};

  return {
    theme,
    layout: {
      ...preset,
      ...saved,
      backgroundImage:
        typeof saved.backgroundImage === "string"
          ? saved.backgroundImage
          : preset.backgroundImage,
      overlayOpacity:
        typeof saved.overlayOpacity === "number"
          ? saved.overlayOpacity
          : preset.overlayOpacity,
      shellBackgroundColor:
        saved.shellBackgroundColor || preset.shellBackgroundColor,
      contentBackgroundColor:
        saved.contentBackgroundColor || preset.contentBackgroundColor,
      contentPadding:
        typeof saved.contentPadding === "number"
          ? saved.contentPadding
          : preset.contentPadding,
      contentBorderRadius:
        typeof saved.contentBorderRadius === "number"
          ? saved.contentBorderRadius
          : preset.contentBorderRadius,
    },
  };
}

export function resolveElementStyles(
  content: ProposalContentSnapshot
): Record<string, { content?: string; fontFamily?: string; fontWeight?: string; color?: string; fontSize?: number; lineHeight?: number }> {
  return mergeElementStyles(
    DEFAULT_PROPOSAL_ELEMENT_STYLES as Record<string, unknown>,
    (content.elementStyles as Record<string, unknown> | undefined) || {}
  ) as Record<
    string,
    {
      content?: string;
      fontFamily?: string;
      fontWeight?: string;
      color?: string;
      fontSize?: number;
      lineHeight?: number;
    }
  >;
}

export function getProposalTextStyle(
  styles: Record<string, { fontFamily?: string; fontWeight?: string; color?: string; fontSize?: number; lineHeight?: number }>,
  id: string
): CSSProperties {
  const style = styles[id] || {};
  return {
    fontFamily:
      style.fontFamily === "Georgia"
        ? "Georgia, serif"
        : "Inter, system-ui, sans-serif",
    fontWeight: FONT_WEIGHT_MAP[style.fontWeight || "Normal"] || 400,
    color: style.color,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    lineHeight: style.lineHeight,
  };
}

export function headerUsesLightText(layout: HeaderLayout) {
  const contentIsTransparent =
    !layout.contentBackgroundColor ||
    layout.contentBackgroundColor === "transparent" ||
    layout.contentBackgroundColor === "rgba(0,0,0,0)";
  const hasImage = Boolean(layout.backgroundImage);
  return (
    contentIsTransparent &&
    (hasImage ||
      layout.overlayOpacity > 20 ||
      layout.shellBackgroundColor === "#111827")
  );
}
