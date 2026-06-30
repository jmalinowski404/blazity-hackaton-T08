import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const FORMATS = ["txt", "md", "html", "json", "docx", "pdf"] as const;
type Format = (typeof FORMATS)[number];

const MIME: Record<Format, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtml(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => `    <p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Corrected copy</title></head>
  <body>
${paras}
  </body>
</html>
`;
}

/** pdf-lib's standard fonts are WinAnsi — map common smart punctuation and drop
   anything it can't encode (but keep newlines/tabs) so drawText never throws. */
function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\n\t\x20-ÿ]/g, "");
}

async function toPdf(text: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 11;
  const lineHeight = 16;
  const margin = 56;

  let page = pdf.addPage();
  let { width, height } = page.getSize();
  let y = height - margin;
  const maxWidth = width - margin * 2;

  const newPage = () => {
    page = pdf.addPage();
    ({ width, height } = page.getSize());
    y = height - margin;
  };

  const paragraphs = toWinAnsi(text).split("\n");
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      y -= lineHeight; // blank line
      if (y < margin) newPage();
      continue;
    }
    let line = "";
    const flush = () => {
      if (y < margin) newPage();
      page.drawText(line, { x: margin, y, size, font });
      y -= lineHeight;
      line = "";
    };
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
        flush();
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) flush();
  }

  return pdf.save();
}

async function toDocx(text: string): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const children = text.split("\n").map(
    (line) =>
      new Paragraph({
        children: line ? [new TextRun(line)] : [],
      }),
  );
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function POST(req: Request) {
  let body: { text?: string; format?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { text, name } = body;
  const format = body.format as Format;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Nothing to export." }, { status: 400 });
  }
  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: "Unsupported format." }, { status: 400 });
  }

  const base = (name || "corrected").replace(/\.[^.]+$/, "") || "corrected";
  const filename = `${base}-corrected.${format}`;

  let data: Uint8Array | Buffer | string;
  if (format === "txt" || format === "md") data = text;
  else if (format === "json") data = JSON.stringify({ text }, null, 2);
  else if (format === "html") data = toHtml(text);
  else if (format === "pdf") data = await toPdf(text);
  else data = await toDocx(text); // docx

  const payload = typeof data === "string" ? data : new Uint8Array(data);
  return new Response(payload, {
    headers: {
      "content-type": MIME[format],
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
