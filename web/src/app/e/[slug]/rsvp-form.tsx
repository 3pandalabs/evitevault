"use client";

import { Check, HelpCircle, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, submitRsvp } from "@/lib/api/browser";
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
  invitation_required: "This event is invitation only — please use the link you were sent.",
  name_required: "Please tell us your name.",
};

export function RsvpForm({
  slug,
  token,
  rsvp,
  you,
}: {
  slug: string;
  token?: string;
  rsvp: PublicEvent["rsvp"];
  you: PublicEvent["you"];
}) {
  const router = useRouter();

  // Pre-selecting the existing answer is what makes changing an RSVP feel like
  // editing rather than starting over.
  const [status, setStatus] = useState<Status | null>(
    you && you.rsvpStatus !== "pending" ? you.rsvpStatus : null,
  );
  const [name, setName] = useState(you?.name ?? "");
  const [email, setEmail] = useState(you?.email ?? "");
  const [plusOnes, setPlusOnes] = useState(you?.plusOnes ?? 0);
  const [dietaryNotes, setDietaryNotes] = useState(you?.dietaryNotes ?? "");
  const [message, setMessage] = useState(you?.message ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (rsvp.closed) {
    return (
      <div className="ev-surface rounded-2xl p-6 text-center shadow-sm">
        <p className="font-medium">RSVPs are closed</p>
        <p className="ev-muted mt-1 text-sm">
          {you && you.rsvpStatus !== "pending"
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
        dietaryNotes: rsvp.collectDietary ? dietaryNotes.trim() || null : null,
        message: message.trim() || null,
      });

      // A public responder gets a token back — it is their only way to come
      // back and amend the answer, so put it in the URL immediately rather
      // than relying on them to keep the tab open.
      if (result.inviteToken && !token) {
        router.replace(`/e/${slug}?t=${result.inviteToken}`);
      }
      setDone(true);
      // Refresh the server component so the headcount and guest list reflect
      // this response without a full reload.
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "request_failed";
      setError(ERROR_COPY[code] ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const alreadyResponded = you && you.rsvpStatus !== "pending";

  return (
    <form onSubmit={onSubmit} className="ev-surface rounded-2xl p-5 shadow-sm sm:p-8">
      <h2 className="ev-heading text-xl font-semibold sm:text-2xl">
        {alreadyResponded ? "Change your response" : "Will you be there?"}
      </h2>

      {done ? (
        <p className="mt-2 text-sm" style={{ color: "var(--ev-accent)" }}>
          Thank you — your response has been saved.
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CHOICES.map(({ value, label, icon: Icon }) => {
          const selected = status === value;
          const disabled = value === "attending" && rsvp.atCapacity && !selected;
          return (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => {
                setStatus(value);
                setDone(false);
              }}
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
          {/* Name and email are only asked for on the open-RSVP path — a guest
              arriving with a token is already known, and re-asking reads as if
              the host doesn't have their details. */}
          {!you ? (
            <>
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
              <div className="space-y-1.5">
                <Label htmlFor="rsvp-email">Email (optional)</Label>
                <Input
                  id="rsvp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </>
          ) : null}

          {status === "attending" && rsvp.allowPlusOnes && rsvp.maxPlusOnes > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="rsvp-plus-ones">Bringing anyone? (up to {rsvp.maxPlusOnes})</Label>
              <Input
                id="rsvp-plus-ones"
                type="number"
                min={0}
                max={rsvp.maxPlusOnes}
                value={plusOnes}
                onChange={(e) =>
                  setPlusOnes(Math.max(0, Math.min(rsvp.maxPlusOnes, Number(e.target.value) || 0)))
                }
              />
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

      <Button
        type="submit"
        variant="themed"
        size="lg"
        className="mt-6 w-full"
        disabled={!status || submitting}
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
        {alreadyResponded ? "Update response" : "Send response"}
      </Button>
    </form>
  );
}
