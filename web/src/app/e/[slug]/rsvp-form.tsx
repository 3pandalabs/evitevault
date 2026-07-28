"use client";

import { CalendarPlus, Check, HelpCircle, Loader2, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, submitRsvp, type RsvpResult } from "@/lib/api/browser";
import type { PublicEvent } from "@/lib/api/public";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Status = "attending" | "declined" | "maybe";

const CHOICES: { value: Status; label: string; icon: typeof Check }[] = [
  { value: "attending", label: "Going", icon: Check },
  { value: "maybe", label: "Maybe", icon: HelpCircle },
  { value: "declined", label: "Can't make it", icon: X },
];

const ERROR_COPY: Record<string, string> = {
  at_capacity: "This event just reached capacity.",
  rsvp_closed: "RSVPs for this event have closed.",
  already_invited:
    "That email address already has an invitation. Please use the personal link you were sent.",
  email_already_used: "Another guest is already using that email address.",
  invitation_required: "This event is invitation only — please use the link you were sent.",
  name_required: "Please tell us your name.",
  email_required: "Please give an email address so the host can reach you.",
};

export function RsvpForm({
  slug,
  token,
  rsvp,
  you,
  calendar,
}: {
  slug: string;
  token?: string;
  rsvp: PublicEvent["rsvp"];
  you: PublicEvent["you"];
  calendar: PublicEvent["calendar"];
}) {
  const router = useRouter();

  const responded = you && you.rsvpStatus !== "pending";

  const [status, setStatus] = useState<Status | null>(
    responded ? (you.rsvpStatus as Status) : null,
  );
  const [name, setName] = useState(you?.name ?? "");
  const [email, setEmail] = useState(you?.email ?? "");
  const [plusOnes, setPlusOnes] = useState(you?.plusOnes ?? 0);
  const [plusOneNames, setPlusOneNames] = useState<string[]>(you?.plusOneNames ?? []);
  const [dietaryNotes, setDietaryNotes] = useState(you?.dietaryNotes ?? "");
  const [message, setMessage] = useState(you?.message ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a response lands in this session. Distinct from `responded`, which
  // reflects what the server already knew on page load — the confirmation
  // should show for both, but only this one means "you just did that".
  const [confirmed, setConfirmed] = useState<RsvpResult | null>(null);
  // Lets someone who already replied reopen the form deliberately, rather than
  // landing on it and wondering whether their answer was recorded.
  const [editing, setEditing] = useState(false);

  if (rsvp.closed) {
    return (
      <div className="ev-surface rounded-2xl p-6 text-center shadow-sm">
        <p className="font-medium">RSVPs are closed</p>
        <p className="ev-muted mt-1 text-sm">
          {responded
            ? `Your response was recorded as "${you.rsvpStatus}".`
            : "The host is no longer collecting responses."}
        </p>
      </div>
    );
  }

  if (!rsvp.canRespond && rsvp.requiresToken) {
    return (
      <div className="ev-surface rounded-2xl p-6 text-center shadow-sm">
        <p className="font-medium">This invitation is personal</p>
        <p className="ev-muted mt-1 text-sm">
          Please open the link sent to you directly to respond.
        </p>
      </div>
    );
  }

  // --- confirmation ---------------------------------------------------------
  const showConfirmation = (confirmed || responded) && !editing;

  if (showConfirmation) {
    const finalStatus = confirmed?.status ?? (you!.rsvpStatus as Status);
    const finalPlusOnes = confirmed?.plusOnes ?? you!.plusOnes;
    const finalNames = confirmed?.plusOneNames ?? you?.plusOneNames ?? [];
    const finalName = confirmed?.name ?? you!.name;
    const going = finalStatus === "attending";

    return (
      <div className="ev-surface rounded-2xl p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" }}
          >
            {going ? <Check className="size-4" /> : finalStatus === "maybe" ? <HelpCircle className="size-4" /> : <X className="size-4" />}
          </span>
          <div className="min-w-0">
            <h2 className="ev-heading text-xl font-semibold sm:text-2xl">
              {going
                ? "You're going"
                : finalStatus === "maybe"
                  ? "You're a maybe"
                  : "You've declined"}
            </h2>
            <p className="ev-muted mt-1 text-sm">
              {confirmed ? "Thanks — your response has been saved." : "Your response is recorded."}
            </p>
          </div>
        </div>

        <dl className="mt-6 space-y-2 border-t border-black/5 pt-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="ev-muted">Name</dt>
            <dd className="text-right font-medium">{finalName}</dd>
          </div>
          {going ? (
            <div className="flex justify-between gap-4">
              <dt className="ev-muted">Party size</dt>
              <dd className="text-right font-medium">
                {1 + finalPlusOnes} {1 + finalPlusOnes === 1 ? "person" : "people"}
              </dd>
            </div>
          ) : null}
          {going && finalNames.length > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="ev-muted">Bringing</dt>
              <dd className="text-right font-medium">{finalNames.join(", ")}</dd>
            </div>
          ) : null}
          {going && dietaryNotes.trim() ? (
            <div className="flex justify-between gap-4">
              <dt className="ev-muted">Dietary</dt>
              <dd className="text-right font-medium">{dietaryNotes}</dd>
            </div>
          ) : null}
        </dl>

        {/* Only offered to people actually coming — prompting someone who just
            declined to save the date is tone-deaf. */}
        {going ? (
          <div className="mt-6 border-t border-black/5 pt-5">
            <p className="ev-muted mb-3 text-sm">Don&apos;t forget:</p>
            <div className="flex flex-wrap gap-2">
              <a href={calendar.googleUrl} target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="themed" size="sm">
                  <CalendarPlus className="size-4" />
                  Google Calendar
                </Button>
              </a>
              <a href={calendar.icsUrl}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-black/15 bg-transparent text-[color:var(--ev-text)] hover:bg-black/5"
                >
                  <CalendarPlus className="size-4" />
                  Apple / Outlook
                </Button>
              </a>
            </div>
          </div>
        ) : null}

        <div className="mt-6 border-t border-black/5 pt-5">
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setConfirmed(null);
            }}
            className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
            style={{ color: "var(--ev-accent)" }}
          >
            <Pencil className="size-3.5" />
            Change your response
          </button>
          <p className="ev-muted mt-2 text-xs">
            {/* Anyone who came through the shared link now holds a personal one,
                so tell them plainly that this page is how they get back in. */}
            You can come back to this page any time to update it.
          </p>
        </div>
      </div>
    );
  }

  // --- the form -------------------------------------------------------------
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await submitRsvp(slug, {
        token,
        name: name.trim() || undefined,
        email: email.trim() || null,
        status,
        plusOnes: status === "attending" ? plusOnes : 0,
        plusOneNames: status === "attending" ? plusOneNames : undefined,
        dietaryNotes: rsvp.collectDietary ? dietaryNotes.trim() || null : null,
        message: message.trim() || null,
      });

      // A public responder gets a token back — their only way to return and
      // amend the answer, so put it in the URL rather than relying on them
      // keeping the tab open.
      if (result.inviteToken && !token) {
        router.replace(`/e/${slug}?t=${result.inviteToken}`);
      }
      setConfirmed(result);
      setEditing(false);
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      setError(ERROR_COPY[code] ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="ev-surface rounded-2xl p-5 shadow-sm sm:p-8">
      <h2 className="ev-heading text-xl font-semibold sm:text-2xl">
        {editing ? "Change your response" : "Will you be there?"}
      </h2>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CHOICES.map(({ value, label, icon: Icon }) => {
          const selected = status === value;
          const disabled = value === "attending" && rsvp.atCapacity && !selected;
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => setStatus(value)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition",
                "disabled:cursor-not-allowed disabled:opacity-40",
                selected ? "border-[var(--ev-accent)]" : "border-black/10 hover:border-black/25",
              )}
              style={
                selected
                  ? { backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" }
                  : undefined
              }
              aria-pressed={selected}
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </div>

      {rsvp.atCapacity && status !== "attending" ? (
        <p className="ev-muted mt-2 text-xs">This event is at capacity.</p>
      ) : null}

      {status ? (
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rsvp-name">Your name</Label>
            <Input
              id="rsvp-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          {/* Required of everyone, not only anonymous responders — an invited
              guest often has no address on file, and without one there is no
              way to send them a confirmation or tell them the event moved.
              Enforced server-side too; `required` here only buys the better
              message. */}
          <div className="space-y-1.5">
            <Label htmlFor="rsvp-email">Email</Label>
            <Input
              id="rsvp-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
            <p className="ev-muted text-xs">
              So the host can send your confirmation and reach you if anything changes.
            </p>
          </div>

          {status === "attending" && rsvp.allowPlusOnes && rsvp.maxPlusOnes > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="rsvp-plus-ones">
                Bringing anyone? (up to {rsvp.maxPlusOnes})
              </Label>
              <Input
                id="rsvp-plus-ones"
                type="number"
                min={0}
                max={rsvp.maxPlusOnes}
                value={plusOnes}
                onChange={(e) => {
                  const next = Math.max(0, Math.min(rsvp.maxPlusOnes, Number(e.target.value) || 0));
                  setPlusOnes(next);
                  // Keep the name inputs in step with the count, preserving what
                  // has already been typed when the number goes up.
                  setPlusOneNames((prev) =>
                    Array.from({ length: next }, (_, i) => prev[i] ?? ""),
                  );
                }}
              />

              {plusOnes > 0 ? (
                <div className="space-y-2 pt-2">
                  <p className="ev-muted text-xs">
                    Who&apos;s coming with you? Helps the host with place cards — leave blank if
                    you&apos;re not sure yet.
                  </p>
                  {Array.from({ length: plusOnes }, (_, i) => (
                    <Input
                      key={i}
                      value={plusOneNames[i] ?? ""}
                      onChange={(e) =>
                        setPlusOneNames((prev) => {
                          const next = [...prev];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                      placeholder={`Guest ${i + 2}`}
                      aria-label={`Name of guest ${i + 2}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {status === "attending" && rsvp.collectDietary ? (
            <div className="space-y-1.5">
              <Label htmlFor="rsvp-dietary">Dietary requirements</Label>
              <Input
                id="rsvp-dietary"
                value={dietaryNotes}
                onChange={(e) => setDietaryNotes(e.target.value)}
                placeholder="Vegetarian, nut allergy, …"
              />
              <p className="ev-muted text-xs">For everyone in your party.</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="rsvp-message">A note for the host (optional)</Label>
            <Textarea
              id="rsvp-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex gap-2">
        <Button type="submit" variant="themed" size="lg" className="flex-1" disabled={!status || submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {editing ? "Update response" : "Send response"}
        </Button>
        {editing ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setEditing(false)}
            className="border-black/15 bg-transparent text-[color:var(--ev-text)] hover:bg-black/5"
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
