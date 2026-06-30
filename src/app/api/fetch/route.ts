import { NextResponse } from "next/server";

/* Fetch a public URL server-side and extract its readable text, so a user can
   pull in a post or article, check it, and download the corrected copy.

   Note: this works for publicly reachable HTML (articles, blog posts, public
   pages). Auth-gated, JS-rendered social feeds (private timelines, logged-in
   views) won't return usable HTML to a server fetch — those need the
   platform's OAuth API, which requires app credentials. */

const MAX_CHARS = 20_000;

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  if (h === "::1" || h === "[::1]") return true;
  // obvious private / link-local IPv4 ranges
  if (/^127\./.test(h) || /^10\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function extractText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // turn block-level closes into line breaks so paragraphs survive
  body = body.replace(/<\/(p|div|section|article|li|h[1-6]|br)\s*>/gi, "\n");
  body = body.replace(/<br\s*\/?>/gi, "\n");
  body = body.replace(/<[^>]+>/g, " ");
  body = decodeEntities(body);
  body = body
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return { title, text: body.slice(0, MAX_CHARS) };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export async function POST(req: Request) {
  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "Provide a URL to fetch." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only http and https URLs are supported." }, { status: 400 });
  }
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "That host isn't allowed." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; TonoBrandCheck/1.0; +https://example.com/tono)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `The page returned ${res.status}. It may require sign-in or block fetching.` },
        { status: 502 },
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();

    let text: string;
    let title = "";
    if (contentType.includes("text/html") || /<html[\s>]/i.test(raw)) {
      ({ text, title } = extractText(raw));
    } else {
      text = raw.slice(0, MAX_CHARS);
    }

    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "Couldn't extract readable text. The page may be JS-rendered or behind a login — paste the text directly instead.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ text, title, source: parsed.hostname });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "Fetching the URL timed out." : "Couldn't reach that URL." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
