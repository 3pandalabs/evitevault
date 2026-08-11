"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { getEvent, listTemplates, type EventSummary, type Template } from "@/lib/api/host";
import { CardEditor } from "./card-editor";

/**
 * Loads what the designer needs and gets out of the way.
 *
 * Client-rendered like the rest of the dashboard — see the note at the top of
 * lib/api/host.ts. The API is the authorization boundary; this page only
 * redirects on a 401 so the host lands somewhere sensible rather than staring
 * at a spinner.
 */
export default function DesignCardPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<(EventSummary & Record<string, unknown>) | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([getEvent(eventId), listTemplates()])
        .then(([ev, { templates: rows }]) => {
          setEvent(ev);
          setTemplates(rows);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) {
            router.replace("/login");
            return;
          }
          setError("This invitation couldn't be loaded.");
        }),
    [eventId, router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-slate-700">{error}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm underline">
          Back to your events
        </Link>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        {event.title}
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Design the card</h1>
        <p className="mt-1 max-w-2xl text-slate-600">
          The image you send to WhatsApp, and the preview people see when the invitation link is
          shared. The invitation page itself keeps its own layout — this is the picture of it.
        </p>
      </header>

      {/* Re-fetching after a save keeps coverImageKey and themeOverrides in step
          with what the API actually stored, so a reload can't surprise anyone. */}
      <CardEditor event={event} templates={templates} onSaved={load} />
    </div>
  );
}
