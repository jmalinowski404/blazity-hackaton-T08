import { NextResponse } from "next/server";
import { htmlToText } from "@/lib/text-extract";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_CHARS = 50_000;

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (15 MB limit)." }, { status: 413 });
  }

  const kind = ext(file.name);
  const type = file.type;

  try {
    let text: string;

    if (kind === "docx" || type.includes("officedocument.wordprocessingml")) {
      const mammoth = (await import("mammoth")).default;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer });
      text = value;
    } else if (kind === "pdf" || type === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const res = await extractText(pdf, { mergePages: true });
      text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
    } else if (kind === "html" || kind === "htm" || type.includes("html")) {
      text = htmlToText(await file.text());
    } else {
      // txt, md, markdown, csv, json, log, rtf, and any text/* fallback
      text = await file.text();
    }

    text = text.replace(/\r\n/g, "\n").trim();
    if (!text) {
      return NextResponse.json(
        { error: "Couldn't extract any text from that file." },
        { status: 422 },
      );
    }
    return NextResponse.json({ text: text.slice(0, MAX_CHARS), name: file.name });
  } catch {
    return NextResponse.json(
      { error: `Couldn't read that ${kind || "file"}. Try a different format or paste the text.` },
      { status: 422 },
    );
  }
}
