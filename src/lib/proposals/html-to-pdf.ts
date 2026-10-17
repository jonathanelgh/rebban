import type { Browser } from "puppeteer-core";

async function launchBrowser(): Promise<Browser> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1600, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  try {
    const puppeteer = await import("puppeteer");
    return puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1280, height: 1600, deviceScaleFactor: 1 },
    });
  } catch {
    const puppeteer = await import("puppeteer-core");
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1600, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
}

/** Resolve the origin Chromium should open for print pages. */
export function pdfRenderOrigin(request?: Request | null) {
  if (process.env.PDF_RENDER_ORIGIN) {
    return process.env.PDF_RENDER_ORIGIN.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }
  if (process.env.NODE_ENV !== "production") {
    const host = request?.headers.get("x-forwarded-host") || request?.headers.get("host");
    const proto = request?.headers.get("x-forwarded-proto") || "http";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      // Prefer loopback when the app is running locally even if public APP_URL is set.
    }
    return "http://127.0.0.1:3000";
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
}

/** Render the designed print page to a PDF buffer. */
export async function renderPrintPageToPdf(printUrl: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: 60_000,
    });
    // Wait for proposal article + certificate to paint.
    await page.waitForSelector("article, .print-certificate", { timeout: 30_000 });
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map(
          (img) =>
            img.complete ||
            new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      );
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function renderSignedProposalPrintPdf(input: {
  token: string;
  origin?: string;
  request?: Request | null;
}): Promise<Buffer> {
  const origin = (input.origin || pdfRenderOrigin(input.request)).replace(
    /\/$/,
    ""
  );
  const url = `${origin}/p/${encodeURIComponent(input.token)}/print`;
  return renderPrintPageToPdf(url);
}
