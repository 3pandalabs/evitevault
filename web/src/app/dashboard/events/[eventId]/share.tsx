"use client";

import { Check, Copy, Mail, MessageCircle, MessageSquare, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

// Sharing happens from the HOST's own apps — their WhatsApp, their mail client,
// their SMS. Nothing is sent by us.
//
// That is the point, not a limitation. An invitation forwarded by someone the
// guest knows gets opened; a transactional email from a domain they've never
// seen, addressed to someone who never signed up, is exactly the profile that
// lands in Promotions or spam. It also costs nothing, has no daily cap, and
// needs no SPF/DKIM/DMARC work.

// wa.me wants digits only — no +, spaces, brackets or dashes.
//
// A bare 10-digit number is ambiguous (Indian mobile without 91, US without 1),
// and guessing a country code would silently open a chat with the wrong person.
// So: only address a specific contact when the number is long enough to plausibly
// carry a country code. Otherwise fall back to WhatsApp's contact picker, where
// the host chooses — mildly less convenient, never wrong.
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 11 ? digits : null;
}

export function whatsappUrl(message: string, phone?: string | null): string {
  const num = whatsappNumber(phone);
  const text = encodeURIComponent(message);
  return num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function mailtoUrl(subject: string, message: string, to?: string | null): string {
  const params = new URLSearchParams({ subject, body: message });
  // URLSearchParams encodes spaces as "+", which mail clients render literally
  // in a body. %20 is what actually works here.
  const qs = params.toString().replace(/\+/g, "%20");
  return `mailto:${to ?? ""}?${qs}`;
}

// iOS wants `sms:&body=`, Android wants `sms:?body=`. `sms:?&body=` is the form
// both parse — ugly, and load-bearing.
export function smsUrl(message: string, phone?: string | null): string {
  const num = phone?.replace(/[^\d+]/g, "") ?? "";
  return `sms:${num}?&body=${encodeURIComponent(message)}`;
}

export function buildInviteMessage({
  title,
  whenLabel,
  url,
  guestName,
  hostName,
}: {
  title: string;
  whenLabel: string;
  url: string;
  guestName?: string | null;
  hostName?: string | null;
}): string {
  const opening = guestName ? `Hi ${guestName}, you're invited to` : "You're invited to";
  const from = hostName ? ` — from ${hostName}` : "";
  return `${opening} ${title}\n${whenLabel}${from}\n\nRSVP here:\n${url}`;
}

export function ShareButtons({
  url,
  message,
  subject,
  phone,
  email,
  compact = false,
}: {
  url: string;
  message: string;
  subject: string;
  phone?: string | null;
  email?: string | null;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // navigator.share doesn't exist on most desktop browsers, and rendering a
  // button that throws on click is worse than not offering it. Read as an
  // external store rather than copied into state in an effect: the server
  // snapshot is always false, so prerender and hydration agree, and there's no
  // subscription because capability never changes at runtime.
  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === "function",
    () => false,
  );

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const size = compact ? "sm" : "default";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={whatsappUrl(message, phone)} target="_blank" rel="noopener noreferrer">
        <Button type="button" variant="outline" size={size}>
          <MessageCircle className="size-4" />
          WhatsApp
        </Button>
      </a>

      <a href={mailtoUrl(subject, message, email)}>
        <Button type="button" variant="outline" size={size}>
          <Mail className="size-4" />
          Email
        </Button>
      </a>

      <a href={smsUrl(message, phone)}>
        <Button type="button" variant="outline" size={size}>
          <MessageSquare className="size-4" />
          SMS
        </Button>
      </a>

      <Button type="button" variant="outline" size={size} onClick={copy}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>

      {canNativeShare ? (
        <Button
          type="button"
          variant="outline"
          size={size}
          onClick={() => navigator.share({ title: subject, text: message, url }).catch(() => {})}
        >
          <Share2 className="size-4" />
          More…
        </Button>
      ) : null}
    </div>
  );
}

// One-tap row for a single guest, carrying their personal link. Deliberately
// icon-only: it sits in a table cell repeated once per guest, and full buttons
// would swamp the row.
export function GuestShareButtons({
  url,
  message,
  subject,
  phone,
  email,
}: {
  url: string;
  message: string;
  subject: string;
  phone?: string | null;
  email?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const direct = whatsappNumber(phone);

  return (
    <div className="flex items-center gap-0.5">
      <a
        href={whatsappUrl(message, phone)}
        target="_blank"
        rel="noopener noreferrer"
        title={direct ? `WhatsApp ${phone}` : "Share on WhatsApp (pick the contact)"}
      >
        <Button type="button" variant="ghost" size="icon" aria-label="Share on WhatsApp">
          <MessageCircle className="size-4" />
        </Button>
      </a>

      {email ? (
        <a href={mailtoUrl(subject, message, email)} title={`Email ${email}`}>
          <Button type="button" variant="ghost" size="icon" aria-label="Share by email">
            <Mail className="size-4" />
          </Button>
        </a>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Copy personal link"
        title="Copy this guest's personal link"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
