"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listTemplates, type EventInput, type Template } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { browserTimeZone, timeZones, zonedWallTimeToUtc } from "@/lib/datetime";
import { cn } from "@/lib/utils";

// Wall-clock strings, not instants: every date field here is what a
// `datetime-local` input holds, read in `timezone`. The conversion to absolute
// time happens once, on submit. See lib/datetime.ts for why this isn't
// new Date().
export type EventFormValues = {
  title: string;
  description: string;
  hostDisplayName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  locationName: string;
  locationAddress: string;
  locationMapUrl: string;
  templateId: string | null;
  allowPlusOnes: boolean;
  maxPlusOnes: number;
  collectDietary: boolean;
  allowPublicRsvp: boolean;
  guestbookEnabled: boolean;
  showGuestList: boolean;
  capacity: string;
};

// Sensible default: 7pm a week out, rounded, so the form opens on a plausible
// evening rather than "now", which is never when a party starts.
export function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(19, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The create and edit screens are the same form over the same fields — kept as
 * one component so a field added to one can't silently go missing from the
 * other. The parent owns what happens on submit (create vs. PATCH, and where
 * to go afterwards); this owns the fields, the local validation and the
 * pending state.
 *
 * `onSubmit` may throw: the parent handles auth redirects, and anything else
 * surfaces here as `failureMessage`.
 */
export function EventForm({
  initial,
  submitLabel,
  cancelHref,
  failureMessage,
  onSubmit,
}: {
  initial?: Partial<EventFormValues>;
  submitLabel: string;
  cancelHref: string;
  failureMessage: string;
  onSubmit: (input: EventInput) => Promise<void>;
}) {
  const zones = useMemo(() => timeZones(), []);

  const [templates, setTemplates] = useState<Template[]>([]);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [hostDisplayName, setHostDisplayName] = useState(initial?.hostDisplayName ?? "");
  const [startsAt, setStartsAt] = useState(initial?.startsAt ?? defaultStart);
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone ?? browserTimeZone);
  const [locationName, setLocationName] = useState(initial?.locationName ?? "");
  const [locationAddress, setLocationAddress] = useState(initial?.locationAddress ?? "");
  const [locationMapUrl, setLocationMapUrl] = useState(initial?.locationMapUrl ?? "");
  const [templateId, setTemplateId] = useState<string | null>(initial?.templateId ?? null);

  const [allowPlusOnes, setAllowPlusOnes] = useState(initial?.allowPlusOnes ?? true);
  const [maxPlusOnes, setMaxPlusOnes] = useState(initial?.maxPlusOnes ?? 2);
  const [collectDietary, setCollectDietary] = useState(initial?.collectDietary ?? false);
  const [allowPublicRsvp, setAllowPublicRsvp] = useState(initial?.allowPublicRsvp ?? true);
  const [guestbookEnabled, setGuestbookEnabled] = useState(initial?.guestbookEnabled ?? true);
  const [showGuestList, setShowGuestList] = useState(initial?.showGuestList ?? false);
  const [capacity, setCapacity] = useState(initial?.capacity ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates()
      .then((d) => {
        setTemplates(d.templates);
        // Only defaults when nothing is chosen yet, so editing an event keeps
        // the design it was created with.
        setTemplateId((current) => current ?? d.templates[0]?.id ?? null);
      })
      .catch(() => setError("Couldn't load invitation templates."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const start = zonedWallTimeToUtc(startsAt, timezone);
      const end = endsAt ? zonedWallTimeToUtc(endsAt, timezone) : null;

      if (end && end < start) {
        setError("The end time is before the start time.");
        return;
      }

      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        hostDisplayName: hostDisplayName.trim() || null,
        startsAt: start.toISOString(),
        endsAt: end ? end.toISOString() : null,
        timezone,
        locationName: locationName.trim() || null,
        locationAddress: locationAddress.trim() || null,
        locationMapUrl: locationMapUrl.trim() || null,
        templateId,
        allowPlusOnes,
        maxPlusOnes,
        capacity: capacity ? Number(capacity) : null,
        collectDietary,
        allowPublicRsvp,
        guestbookEnabled,
        guestPhotosEnabled: guestbookEnabled,
        showGuestList,
      });
    } catch {
      setError(failureMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>The basics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Event title</Label>
            <Input
              id="title"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Diwali at ours"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="host">Hosted by</Label>
            <Input
              id="host"
              maxLength={120}
              value={hostDisplayName}
              onChange={(e) => setHostDisplayName(e.target.value)}
              placeholder="Anil &amp; Prachi"
            />
            <p className="text-xs text-slate-500">
              Shown on the invitation. Leave blank to use your account name.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={5}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Come for the diyas, stay for the food…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="starts">Starts</Label>
              <Input
                id="starts"
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ends">Ends (optional)</Label>
              <Input
                id="ends"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tz">Timezone</Label>
            <select
              id="tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            {/* The times above are read in this zone, not the guest's — an
                invitation that says 7pm must say 7pm to everyone. */}
            <p className="text-xs text-slate-500">
              The invitation shows these times in this zone for every guest, wherever they are.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="loc-name">Place name</Label>
            <Input
              id="loc-name"
              maxLength={200}
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="The house"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-addr">Address</Label>
            <Input
              id="loc-addr"
              maxLength={500}
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="42 Lantern Road, Bengaluru 560001"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc-map">Map link</Label>
            <Input
              id="loc-map"
              type="url"
              maxLength={2000}
              value={locationMapUrl}
              onChange={(e) => setLocationMapUrl(e.target.value)}
              placeholder="https://maps.google.com/?q=…"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Design</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {templates.map((t) => {
              const selected = templateId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-xl border-2 p-3 text-left transition",
                    selected ? "border-slate-900" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  {/* A swatch strip is enough to choose by, and avoids
                      shipping six preview images for a scaffold. */}
                  <div
                    className="mb-2 flex h-14 items-center justify-center rounded-lg text-xs"
                    style={{ backgroundColor: t.theme.palette.bg, color: t.theme.palette.text }}
                  >
                    <span
                      className="rounded px-2 py-1"
                      style={{
                        backgroundColor: t.theme.palette.accent,
                        color: t.theme.palette.accentText,
                      }}
                    >
                      Aa
                    </span>
                  </div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>RSVPs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            id="public-rsvp"
            checked={allowPublicRsvp}
            onChange={setAllowPublicRsvp}
            label="Anyone with the link can RSVP"
            hint="Off means only guests you invite personally can respond."
          />
          <Toggle
            id="plus-ones"
            checked={allowPlusOnes}
            onChange={setAllowPlusOnes}
            label="Allow plus-ones"
          />
          {allowPlusOnes ? (
            <div className="space-y-1.5 pl-6">
              <Label htmlFor="max-plus">Maximum per guest</Label>
              <Input
                id="max-plus"
                type="number"
                min={0}
                max={20}
                value={maxPlusOnes}
                onChange={(e) => setMaxPlusOnes(Number(e.target.value) || 0)}
                className="max-w-24"
              />
            </div>
          ) : null}
          <Toggle
            id="dietary"
            checked={collectDietary}
            onChange={setCollectDietary}
            label="Ask for dietary requirements"
          />
          <Toggle
            id="guestbook"
            checked={guestbookEnabled}
            onChange={setGuestbookEnabled}
            label="Enable the guestbook"
            hint="Guests can leave messages and photos on the invitation."
          />
          <Toggle
            id="guest-list"
            checked={showGuestList}
            onChange={setShowGuestList}
            label="Show who's coming"
            hint="First names only, on the public invitation."
          />
          <div className="space-y-1.5">
            <Label htmlFor="capacity">Capacity (optional)</Label>
            <Input
              id="capacity"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="No limit"
              className="max-w-32"
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={submitting || !title.trim()}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <Link href={cancelHref}>
          <Button type="button" variant="ghost" size="lg">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 rounded border-slate-300"
      />
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
