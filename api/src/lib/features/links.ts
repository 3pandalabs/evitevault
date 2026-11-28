import { z } from "zod";

// Registry / wishlist links, the playlist link and "chip in" handles
// (migration 0015). Tested in links.test.ts.
//
// Chip in: the host's own Venmo / Cash App / PayPal.me. The guest page shows
// deep links; RsvpVault never sees, holds or moves the money, and the page
// says so. Separate from (and never mixed with) the Stripe cash-gift flow.

const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), { message: "must be an http(s) URL" });

export const registryLinksSchema = z
  .array(z.object({ label: z.string().trim().max(80).default(""), url: httpUrl }))
  .max(5);

export const playlistUrlSchema = httpUrl;

// Handles, without the service's own prefix characters (we add those).
const VENMO = /^[A-Za-z0-9_-]{5,30}$/;
const CASHTAG = /^[A-Za-z][A-Za-z0-9_]{0,20}$/;
const PAYPAL = /^[A-Za-z0-9]{1,20}$/;

/** Accepts what a host is likely to paste ("@meera", "$meera", "paypal.me/meera") and returns the bare handle, or null. */
export function normaliseHandle(kind: "venmo" | "cashapp" | "paypal", raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (kind === "venmo") s = s.replace(/^venmo\.com\/(u\/)?/i, "").replace(/^@/, "");
  if (kind === "cashapp") s = s.replace(/^cash\.app\//i, "").replace(/^\$/, "");
  if (kind === "paypal") s = s.replace(/^paypal\.me\//i, "");
  s = s.replace(/\/$/, "");
  const re = kind === "venmo" ? VENMO : kind === "cashapp" ? CASHTAG : PAYPAL;
  return re.test(s) ? s : null;
}

export const chipInSchema = z
  .object({
    venmo: z.string().max(60).nullish(),
    cashapp: z.string().max(60).nullish(),
    paypal: z.string().max(60).nullish(),
  })
  .transform((v, ctx) => {
    const out: { venmo: string | null; cashapp: string | null; paypal: string | null } = {
      venmo: null,
      cashapp: null,
      paypal: null,
    };
    for (const k of ["venmo", "cashapp", "paypal"] as const) {
      const raw = v[k];
      if (!raw || !raw.trim()) continue;
      const h = normaliseHandle(k, raw);
      if (!h) {
        ctx.addIssue({ code: "custom", path: [k], message: `invalid ${k} handle` });
        continue;
      }
      out[k] = h;
    }
    return out;
  });

export type ChipIn = { venmo?: string | null; cashapp?: string | null; paypal?: string | null } | null;

export type ChipInLink = { kind: "venmo" | "cashapp" | "paypal"; label: string; handle: string; url: string };

export function chipInLinks(c: ChipIn): ChipInLink[] {
  if (!c) return [];
  const out: ChipInLink[] = [];
  const v = normaliseHandle("venmo", c.venmo);
  if (v) out.push({ kind: "venmo", label: "Venmo", handle: `@${v}`, url: `https://venmo.com/u/${encodeURIComponent(v)}` });
  const ca = normaliseHandle("cashapp", c.cashapp);
  if (ca) out.push({ kind: "cashapp", label: "Cash App", handle: `$${ca}`, url: `https://cash.app/$${encodeURIComponent(ca)}` });
  const p = normaliseHandle("paypal", c.paypal);
  if (p) out.push({ kind: "paypal", label: "PayPal", handle: `paypal.me/${p}`, url: `https://paypal.me/${encodeURIComponent(p)}` });
  return out;
}

/** A friendly name for a playlist link's service, for the button. */
export function playlistService(url: string | null): string | null {
  if (!url) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.endsWith("spotify.com")) return "Spotify";
  if (host === "music.apple.com" || host.endsWith(".music.apple.com")) return "Apple Music";
  if (host === "music.youtube.com") return "YouTube Music";
  if (host.endsWith("youtube.com") || host === "youtu.be") return "YouTube";
  return "Playlist";
}

/** Public shape of registry links: label falls back to the site's hostname. */
export function publicRegistry(links: { label: string; url: string }[] | null): { label: string; url: string }[] {
  if (!links) return [];
  return links
    .filter((l) => /^https?:\/\//i.test(l.url))
    .slice(0, 5)
    .map((l) => {
      let label = l.label?.trim();
      if (!label) {
        try {
          label = new URL(l.url).hostname.replace(/^www\./, "");
        } catch {
          label = "Registry";
        }
      }
      return { label, url: l.url };
    });
}
