/** Shared Rebban-branded HTML email chrome (matches app: accent blue, soft gray, rounded card). */

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function rebbanEmailLayout(options: {
  preheader?: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  footerNote?: string | null;
}) {
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>`
    : "";
  const cta = options.cta
    ? `<p style="margin:28px 0 0;">
        <a href="${escapeHtml(options.cta.url)}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px;">
          ${escapeHtml(options.cta.label)}
        </a>
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F0F1F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Satoshi,Helvetica,Arial,sans-serif;color:#1A1D23;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F0F1F3;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 16px;">
              <span style="display:inline-block;font-size:15px;font-weight:700;letter-spacing:-0.02em;color:#1A1D23;">Rebban</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #E2E5EA;border-radius:20px;padding:32px 28px;box-shadow:0 1px 2px rgba(16,24,40,0.04);">
              <div style="width:36px;height:4px;border-radius:999px;background:#2563EB;margin-bottom:20px;"></div>
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#1A1D23;">
                ${escapeHtml(options.title)}
              </h1>
              <div style="font-size:15px;line-height:1.55;color:#374151;">
                ${options.bodyHtml}
              </div>
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:#9CA3AF;">
              ${
                options.footerNote
                  ? `<p style="margin:0 0 8px;">${escapeHtml(options.footerNote)}</p>`
                  : ""
              }
              <p style="margin:0;">Sent with Rebban</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailDetailCard(rows: Array<{ label: string; value: string }>) {
  const items = rows
    .map((row, index) => {
      const border =
        index < rows.length - 1 ? "border-bottom:1px solid #E2E5EA;" : "";
      return `<tr>
      <td style="padding:10px 0;font-size:13px;color:#6B7280;${border}">${escapeHtml(row.label)}</td>
      <td style="padding:10px 0;font-size:13px;font-weight:600;color:#1A1D23;text-align:right;${border}">${escapeHtml(row.value)}</td>
    </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 0;background:#FAFBFC;border:1px solid #E2E5EA;border-radius:14px;">
    <tr><td style="padding:6px 18px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
    </td></tr>
  </table>`;
}
