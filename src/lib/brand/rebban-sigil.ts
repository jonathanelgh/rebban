import type PDFDocument from "pdfkit";

type PdfDoc = InstanceType<typeof PDFDocument>;

/**
 * Circular verification seal used on signed-proposal certificate pages.
 * Center: brand mark "R."  ·  Ring copy: rebban.com / verified.
 */
export function drawRebbanSigil(
  doc: PdfDoc,
  cx: number,
  cy: number,
  radius = 54,
  options?: { fill?: string; ink?: string; accent?: string }
) {
  const fill = options?.fill ?? "#111827";
  const ink = options?.ink ?? "#1A1D23";
  const accent = options?.accent ?? "#2563EB";

  // Soft plate behind the seal
  doc
    .circle(cx, cy, radius + 6)
    .fillOpacity(0.06)
    .fill(accent)
    .fillOpacity(1);

  // Outer & inner rings
  doc
    .circle(cx, cy, radius)
    .lineWidth(2)
    .strokeColor(ink)
    .stroke();
  doc
    .circle(cx, cy, radius - 11)
    .lineWidth(1)
    .strokeColor(accent)
    .stroke();
  doc
    .circle(cx, cy, radius - 13.5)
    .lineWidth(0.6)
    .strokeColor(ink)
    .strokeOpacity(0.35)
    .stroke()
    .strokeOpacity(1);

  // Ring legend (top + bottom arcs — PDFKit has no native path text)
  drawArcLegend(
    doc,
    "REBBAN.COM",
    cx,
    cy,
    radius - 5.5,
    -Math.PI * 0.72,
    -Math.PI * 0.28,
    ink,
    false
  );
  drawArcLegend(
    doc,
    "VERIFIED",
    cx,
    cy,
    radius - 5.5,
    Math.PI * 0.72,
    Math.PI * 0.28,
    ink,
    true
  );

  // Side ticks
  for (const angle of [-Math.PI / 2, Math.PI / 2]) {
    const inner = radius - 18;
    const outer = radius - 14;
    doc
      .moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
      .lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
      .lineWidth(1.25)
      .strokeColor(accent)
      .stroke();
  }

  // Brand mark tile
  const tile = radius * 0.72;
  const tileX = cx - tile / 2;
  const tileY = cy - tile / 2;
  doc.roundedRect(tileX, tileY, tile, tile, tile * 0.22).fill(fill);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(Math.max(14, tile * 0.42))
    .text("R.", tileX, cy - tile * 0.2, {
      width: tile,
      align: "center",
      characterSpacing: -0.5,
    });
}

function drawArcLegend(
  doc: PdfDoc,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: string,
  inverted: boolean
) {
  const chars = text.split("");
  if (!chars.length) return;
  const span = endAngle - startAngle;
  const step = span / Math.max(chars.length - 1, 1);

  doc.fillColor(color).font("Helvetica-Bold").fontSize(6.5);

  chars.forEach((char, index) => {
    const angle = startAngle + step * index;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const rotation =
      (angle * 180) / Math.PI + (inverted ? -90 : 90);

    doc.save();
    doc.translate(x, y);
    doc.rotate(rotation);
    doc.text(char, -2.2, -3, { lineBreak: false, width: 8, align: "center" });
    doc.restore();
  });
}
