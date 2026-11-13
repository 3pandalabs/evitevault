"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { SUPPORT_EMAIL } from "@/components/LegalPage";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ApiError, sendContact } from "@/lib/api/browser";

// POST /contact (api/ROUTES.md "Contact"). A hidden honeypot field catches
// bots. When the mailer is down the error names the support address, so the
// message still has somewhere to go.
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendContact({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        website: website || undefined,
      });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many messages from here just now. Please try again in an hour.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError("Please check your name, email address and message.");
      } else {
        setError(
          <>
            We couldn&apos;t send your message right now. Please email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            instead.
          </>,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <CheckCircle2 className="size-5 shrink-0" />
        <p>Thanks, your message is on its way. We&apos;ll reply to {email} as soon as we can.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="c-name" className="text-zinc-700">
          Your name
        </Label>
        <Input
          id="c-name"
          required
          maxLength={120}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-email" className="text-zinc-700">
          Your email
        </Label>
        <Input
          id="c-email"
          type="email"
          required
          maxLength={320}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-message" className="text-zinc-700">
          Message
        </Label>
        <Textarea
          id="c-message"
          required
          rows={6}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <p className="text-xs text-zinc-500">
          Asking to have your details removed from an invitation? Include the invitation link.
        </p>
      </div>

      {/* Honeypot: off-screen and out of the tab order, so people never fill it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="c-website">Website</label>
        <input
          id="c-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="rounded-full bg-zinc-900 hover:bg-zinc-700"
        disabled={busy || !name.trim() || !email.trim() || !message.trim()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Send message
      </Button>
    </form>
  );
}
