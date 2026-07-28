"use client";

import { Loader2, MailWarning } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { createAnnouncement } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";

/** One human-readable "X is now Y" line. */
export type EventChange = { label: string; from: string; to: string };

/**
 * Shown after saving an edit that moved the event in time or space, because
 * those are the two changes a guest has already acted on — booked a sitter,
 * planned a drive — by the time the host revises them. Everything else on the
 * form can change quietly.
 *
 * Sending is deliberately not automatic. A host fixing a typo in an address
 * ten seconds after publishing should not spam everyone, and only the host
 * knows which it was. So: opt in, with the message editable first.
 *
 * This reuses the existing announcements endpoint rather than adding a
 * change-notification one — it already personalises each guest's link and
 * records what was sent, which is exactly what is wanted here.
 */
export function NotifyGuestsDialog({
  eventId,
  eventTitle,
  changes,
  defaultBody,
  onDone,
}: {
  eventId: string;
  eventTitle: string;
  changes: EventChange[];
  defaultBody: string;
  onDone: () => void;
}) {
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  // Focus lands on "Don't send", not on the action that mails everyone — an
  // Enter keypress carried over from the form must not send anything.
  useEffect(() => {
    skipRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone, sending]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await createAnnouncement(eventId, {
        // Named, because this lands in an inbox next to the original
        // invitation — "Update to the details" alone says nothing about which
        // event moved.
        subject: `Changed details: ${eventTitle}`.slice(0, 200),
        body,
        audience: "all",
      });

      // The API answers 201 even when nothing left the building: an
      // unconfigured mailer counts every message as "skipped", and a guest list
      // with no email addresses has nobody to send to. Closing on 201 alone
      // would tell the host their guests had been informed when they hadn't.
      if (res.recipientCount === 0) {
        setSent({
          ok: false,
          message:
            "No guest on the list has an email address, so nothing was sent. Share the invitation link instead.",
        });
      } else if (res.delivered === 0) {
        setSent({
          ok: false,
          message:
            "Email isn't set up for this app yet, so nothing was sent. Your changes are still saved and live on the invitation.",
        });
      } else {
        setSent({
          ok: true,
          message: `Emailed ${res.delivered} guest${res.delivered === 1 ? "" : "s"}.`,
        });
      }
      setSending(false);
    } catch (err) {
      setSending(false);
      setError(
        err instanceof ApiError && err.status === 401
          ? "Your session expired. The changes are saved — sign in again to email guests."
          : "Couldn't send the emails. Your changes are saved; you can announce them from the event page.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      // A click on the backdrop is a dismissal, but only the backdrop itself —
      // not a click that bubbled up from inside the panel.
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onDone();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notify-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <MailWarning className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <h2 id="notify-title" className="text-lg font-semibold">
              Let your guests know?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Your changes are saved and the invitation is already updated. Guests won&apos;t be
              told unless you send them something.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          {changes.map((c) => (
            <li key={c.label}>
              <span className="font-medium">{c.label}</span>
              <div className="mt-0.5 text-slate-600">
                <span className="line-through decoration-slate-400">{c.from || "not set"}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium text-slate-900">{c.to || "not set"}</span>
              </div>
            </li>
          ))}
        </ul>

        {sent ? (
          <>
            <p
              className={`mt-4 rounded-lg p-3 text-sm ${
                sent.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
              }`}
            >
              {sent.message}
            </p>
            <div className="mt-5 flex justify-end">
              <Button onClick={onDone}>Done</Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="notify-body">Message</Label>
              <Textarea
                id="notify-body"
                rows={5}
                maxLength={10_000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                Everyone on the guest list with an email address gets this, each with their own
                link to the invitation.
              </p>
            </div>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button ref={skipRef} variant="ghost" disabled={sending} onClick={onDone}>
                Don&apos;t send
              </Button>
              <Button disabled={sending || !body.trim()} onClick={send}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : null}
                Email guests
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
