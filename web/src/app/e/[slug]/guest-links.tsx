import { ExternalLink, Gift, HandCoins, Music } from "lucide-react";
import type { PublicExtras } from "@/lib/api/public";

// Registry / wishlist links, the playlist, and "chip in" handles on the
// invitation. Plain links, server-rendered. Every link is host-supplied and
// http(s)-validated by the API; noreferrer keeps the guest's personal URL
// (their credential) from travelling to other sites.

export function RegistryAndPlaylist({ extras }: { extras: PublicExtras }) {
  if (extras.registry.length === 0 && !extras.playlist) return null;
  return (
    <section className="ev-surface mt-8 rounded-2xl p-5 shadow-sm sm:p-8">
      {extras.registry.length ? (
        <>
          <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
            <Gift className="size-5" style={{ color: "var(--ev-accent)" }} />
            Registry &amp; wishlist
          </h2>
          <ul className="mt-3 space-y-2">
            {extras.registry.map((r) => (
              <li key={r.url}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3 text-sm font-medium hover:bg-black/5"
                >
                  <span className="min-w-0 truncate">{r.label}</span>
                  <ExternalLink className="size-4 shrink-0 opacity-60" />
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {extras.playlist ? (
        <div className={extras.registry.length ? "mt-6 border-t border-black/5 pt-6" : ""}>
          <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
            <Music className="size-5" style={{ color: "var(--ev-accent)" }} />
            The playlist
          </h2>
          <p className="ev-muted mt-1 text-sm">Listen ahead, or add a song if the playlist is shared.</p>
          <a
            href={extras.playlist.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
            style={{ backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" }}
          >
            <Music className="size-4" />
            Open in {extras.playlist.service ?? "your music app"}
          </a>
        </div>
      ) : null}
    </section>
  );
}

// Deliberately NOT styled like the "Send a gift" card (Stripe, through
// RsvpVault): a dashed, neutral box with its own heading and a plain
// statement that the money goes straight to the host.
export function ChipIn({ extras, hostName }: { extras: PublicExtras; hostName: string | null }) {
  if (extras.chipIn.length === 0) return null;
  const who = hostName ?? "the host";
  return (
    <section className="mt-8 rounded-2xl border-2 border-dashed border-black/15 p-5 sm:p-8">
      <h2 className="ev-heading flex items-center gap-2 text-xl font-semibold">
        <HandCoins className="size-5" />
        Chip in directly
      </h2>
      <p className="ev-muted mt-1 text-sm">
        Pay {who} directly in your own app — not through RsvpVault. We never see or hold this money and
        there&apos;s no receipt from us.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {extras.chipIn.map((c) => (
          <a
            key={c.kind}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            {c.label}
            <span className="ev-muted text-xs">{c.handle}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
