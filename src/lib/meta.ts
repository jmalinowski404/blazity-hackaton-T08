/* Server-only helpers for Meta (Facebook / Instagram) Graph API.
   Tokens never reach the browser — routes read the user token from an
   httpOnly cookie and resolve per-page tokens here on each request. */

import type { SocialAccount, SocialPost, SocialProvider } from "@/lib/types";

const VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

export const TOKEN_COOKIE = "tono_meta_token";
export const STATE_COOKIE = "tono_oauth_state";

/** Scopes for reading + editing Facebook Page posts and reading Instagram media. */
export const SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export class MetaError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export function metaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function creds() {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new MetaError("Meta app is not configured on the server.", 500);
  return { id, secret };
}

/** Public origin of the request. On Vercel, `new URL(req.url).origin` can be an
   internal host or wrong protocol, so prefer the forwarded headers. */
export function originFromRequest(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

/** The OAuth redirect URI. Override with META_REDIRECT_URI; otherwise derived.
   Set META_REDIRECT_URI on Vercel to a fixed URL so the login dialog and the
   token exchange always use the identical string (Meta requires an exact match). */
export function redirectUri(origin: string): string {
  return process.env.META_REDIRECT_URI || `${origin}/api/auth/facebook/callback`;
}

export function buildAuthUrl(origin: string, state: string): string {
  const { id } = creds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(origin),
    state,
    scope: SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${params}`;
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${GRAPH}/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MetaError(data?.error?.message ?? `Graph API error (${res.status}).`, res.status);
  }
  return data as T;
}

export async function exchangeCode(origin: string, code: string): Promise<string> {
  const { id, secret } = creds();
  const data = await graphGet<{ access_token: string }>("oauth/access_token", {
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri(origin),
    code,
  });
  return data.access_token;
}

export async function getLongLivedToken(shortToken: string): Promise<string> {
  const { id, secret } = creds();
  const data = await graphGet<{ access_token: string }>("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: id,
    client_secret: secret,
    fb_exchange_token: shortToken,
  });
  return data.access_token;
}

export async function getMe(userToken: string): Promise<{ id: string; name: string }> {
  return graphGet("me", { fields: "id,name", access_token: userToken });
}

type RawPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

async function getPages(userToken: string): Promise<RawPage[]> {
  const data = await graphGet<{ data: RawPage[] }>("me/accounts", {
    fields: "name,access_token,instagram_business_account{id,username}",
    access_token: userToken,
  });
  return data.data ?? [];
}

/** Selectable targets: each Page (editable) plus any linked IG account (read-only). */
export async function listAccounts(userToken: string): Promise<SocialAccount[]> {
  const pages = await getPages(userToken);
  const out: SocialAccount[] = [];
  for (const p of pages) {
    out.push({ target: `fb:${p.id}`, provider: "facebook", id: p.id, name: p.name, canEdit: true });
    if (p.instagram_business_account) {
      const ig = p.instagram_business_account;
      out.push({
        target: `ig:${ig.id}`,
        provider: "instagram",
        id: ig.id,
        name: ig.username ? `@${ig.username}` : `${p.name} (Instagram)`,
        canEdit: false,
      });
    }
  }
  return out;
}

type Resolved = { provider: SocialProvider; objectId: string; pageToken: string };

/** Re-resolve a target to its current page token server-side (never trust the client). */
async function resolve(userToken: string, target: string): Promise<Resolved> {
  const [kind, objectId] = target.split(":");
  const pages = await getPages(userToken);
  if (kind === "fb") {
    const page = pages.find((p) => p.id === objectId);
    if (!page) throw new MetaError("That Facebook Page is no longer accessible.", 404);
    return { provider: "facebook", objectId, pageToken: page.access_token };
  }
  if (kind === "ig") {
    const page = pages.find((p) => p.instagram_business_account?.id === objectId);
    if (!page) throw new MetaError("That Instagram account is no longer accessible.", 404);
    return { provider: "instagram", objectId, pageToken: page.access_token };
  }
  throw new MetaError("Unknown target.", 400);
}

export async function listPosts(userToken: string, target: string): Promise<SocialPost[]> {
  const r = await resolve(userToken, target);
  if (r.provider === "facebook") {
    const data = await graphGet<{
      data: { id: string; message?: string; created_time?: string; permalink_url?: string }[];
    }>(`${r.objectId}/posts`, {
      fields: "id,message,created_time,permalink_url",
      limit: "15",
      access_token: r.pageToken,
    });
    return (data.data ?? [])
      .filter((p) => p.message)
      .map((p) => ({
        id: p.id,
        provider: "facebook" as const,
        text: p.message ?? "",
        permalink: p.permalink_url,
        timestamp: p.created_time,
        canEdit: true,
      }));
  }
  const data = await graphGet<{
    data: { id: string; caption?: string; permalink?: string; timestamp?: string }[];
  }>(`${r.objectId}/media`, {
    fields: "id,caption,permalink,timestamp,media_type",
    limit: "15",
    access_token: r.pageToken,
  });
  return (data.data ?? [])
    .filter((m) => m.caption)
    .map((m) => ({
      id: m.id,
      provider: "instagram" as const,
      text: m.caption ?? "",
      permalink: m.permalink,
      timestamp: m.timestamp,
      canEdit: false,
    }));
}

/** Edit a Facebook Page post's message in place. Instagram is not editable. */
export async function repost(
  userToken: string,
  target: string,
  postId: string,
  text: string,
): Promise<{ permalink?: string }> {
  const r = await resolve(userToken, target);
  if (r.provider !== "facebook") {
    throw new MetaError(
      "Instagram doesn't allow editing a published caption via the API. Copy the corrected caption, or publish it as a new post.",
      422,
    );
  }
  const body = new URLSearchParams({ message: text, access_token: r.pageToken });
  const res = await fetch(`${GRAPH}/${postId}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MetaError(data?.error?.message ?? `Couldn't update the post (${res.status}).`, res.status);
  }
  return {};
}
