/** Extract plain text from user-uploaded brief files (no native deps). */

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "text",
  "log",
  "rtf",
]);

export function extensionOf(filename: string) {
  const parts = filename.trim().toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function isTextBriefFile(filename: string, mime?: string | null) {
  const ext = extensionOf(filename);
  if (TEXT_EXT.has(ext)) return true;
  if (mime && mime.startsWith("text/")) return true;
  if (mime === "application/json") return true;
  return false;
}

export function isSupportedBriefFile(filename: string, mime?: string | null) {
  const ext = extensionOf(filename);
  if (isTextBriefFile(filename, mime)) return true;
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return true;
  }
  if (ext === "pdf" || mime === "application/pdf") return true;
  return false;
}

export async function extractTextFromBriefFile(options: {
  buffer: Buffer;
  filename: string;
  mime?: string | null;
}): Promise<{ text: string; source: string }> {
  const { buffer, filename, mime } = options;
  const ext = extensionOf(filename);

  if (isTextBriefFile(filename, mime)) {
    const text = buffer.toString("utf8").replace(/\u0000/g, "").trim();
    if (!text) throw new Error("The uploaded file is empty.");
    return { text, source: filename };
  }

  if (
    ext === "docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value || "").trim();
      if (!text) throw new Error("Could not read text from that Word file.");
      return { text, source: filename };
    } catch (err) {
      if (err instanceof Error && err.message.includes("Could not read")) {
        throw err;
      }
      throw new Error(
        "Word (.docx) support needs the mammoth package. Paste the text instead, or upload a .txt / .md file."
      );
    }
  }

  if (ext === "pdf" || mime === "application/pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = (result.text || "").trim();
        if (!text) {
          throw new Error(
            "That PDF has little or no extractable text. Paste the notes instead."
          );
        }
        return { text, source: filename };
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    } catch (err) {
      if (err instanceof Error && /extractable text|PDF/i.test(err.message)) {
        throw err;
      }
      throw new Error(
        "Could not read that PDF. Paste the text, or upload a .txt / .md / .docx file."
      );
    }
  }

  throw new Error(
    "Unsupported file type. Upload .txt, .md, .docx, or .pdf, or paste your notes."
  );
}
