"use client";

import { MessageSquareHeart, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { listGreetings, type GreetingSummary } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/utils";
import { EmptyState, PageHeader, PageSpinner } from "../ui";
import { DeleteGreetingButton } from "./delete-greeting-button";

/** All greeting cards: the list that used to sit under the events on the dashboard. */
export default function GreetingsPage() {
  const router = useRouter();
  const [greetings, setGreetings] = useState<GreetingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listGreetings()
      .then((g) => setGreetings(g.greetings))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError("Couldn't load your greetings.");
      });
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!greetings) return [];
    return q
      ? greetings.filter(
          (g) =>
            g.title.toLowerCase().includes(q) ||
            (g.message ?? "").toLowerCase().includes(q) ||
            (g.occasion ?? "").toLowerCase().includes(q),
        )
      : greetings;
  }, [greetings, query]);

  const newButton = (
    <Link href="/dashboard/greetings/new">
      <Button className="rounded-full">
        <Plus className="size-4" />
        New greeting
      </Button>
    </Link>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Greetings"
        title="Greeting cards"
        description="A designed card with a message: a thank-you, a season's greeting, a hello. No date, place or RSVP. Save it, then email it."
        actions={newButton}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!greetings && !error ? <PageSpinner /> : null}

      {greetings && greetings.length === 0 ? (
        <EmptyState icon={MessageSquareHeart} title="No greetings yet" body="Design your first card." action={newButton} />
      ) : null}

      {greetings && greetings.length > 0 ? (
        <>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search greetings"
              aria-label="Search greetings"
              className="rounded-full border-zinc-200 bg-white/80 pl-9"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">No greetings match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {filtered.map((g) => (
                <li key={g.id}>
                  <article className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white/90 p-5 shadow-sm shadow-zinc-900/5 transition hover:border-zinc-300 hover:shadow-md">
                    <div className="flex items-center gap-2">
                      <MessageSquareHeart className="size-4 shrink-0 text-[#b98d4f]" />
                      {g.occasion ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                          {g.occasion}
                        </span>
                      ) : null}
                      <span className="ml-auto text-xs text-zinc-400">edited {formatRelative(g.updatedAt)}</span>
                    </div>
                    <Link
                      href={`/dashboard/greetings/${g.id}/edit`}
                      className="mt-2 block truncate font-semibold text-zinc-900 hover:underline"
                    >
                      {g.title}
                    </Link>
                    {g.message ? <p className="mt-1 line-clamp-2 flex-1 text-sm text-zinc-500">{g.message}</p> : <div className="flex-1" />}
                    <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-4">
                      <Link href={`/dashboard/greetings/${g.id}/edit`}>
                        <Button variant="outline" size="sm" className="rounded-full">
                          <Pencil className="size-4" />
                          Edit &amp; send
                        </Button>
                      </Link>
                      <DeleteGreetingButton
                        greetingId={g.id}
                        title={g.title}
                        onDeleted={() => setGreetings((cur) => (cur ?? []).filter((x) => x.id !== g.id))}
                      />
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
