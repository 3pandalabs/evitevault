"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { createEvent, listTemplates, type Template } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { browserTimeZone, timeZones, zonedWallTimeToUtc } from "@/lib/datetime";
import { cn } from "@/lib/utils";

// Sensible default: 7pm a week out, rounded, so the form opens on a plausible
// evening rather than "now", which is never when a party starts.
function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(19, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewEventPage() {
  const router = useRouter();
  const zones = useMemo(() => timeZones(), []);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hostDisplayName, setHostDisplayName] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState("");
  const [timezone, setTimezone] = useState(browserTimeZone);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationMapUrl, setLocationMapUrl] = useState("");

  const [allowPlusOnes, setAllowPlusOnes] = useState(true);
  const [maxPlusOnes, setMaxPlusOnes] = useState(2);
  const [collectDietary, setCollectDietary] = useState(false);
  const [allowPublicRsvp, setAllowPublicRsvp] = useState(true);
  const [guestbookEnabled, setGuestbookEnabled] = useState(true);
  const [showGuestList, setShowGuestList] = useState(false);
  const [capacity, setCapacity] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates()
      .then((d) => {
        setTemplates(d.templates);
        setTemplateId((current) => current ?? d.templates[0]?.id ?? null);
      })
      .catch(() => setError("Couldn't load invitation templates."));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // The form collects wall-clock time in the event's zone; the API stores
      // absolute instants. See lib/datetime.ts for why this isn't new Date().
      const start = zonedWallTimeToUtc(startsAt, timezone);
      const end = endsAt ? zonedWallTimeToUtc(endsAt, timezone) : null;

      if (end && end < start) {
        setError("The end time is before the start time.");
        return;
      }

      const created = await createEvent({
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

      // Straight to the detail page, which is where cover art, guests and
      // publishing live. The event is a draft until published, so nothing is
      // public yet.
      router.push(`/dashboard/events/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError("Couldn't create the event. Check the fields and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Back to events
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">New event</h1>
      <p className="mt-1 text-sm text-slate-500">
        This saves as a draft — nothing is visible to guests until you publish it.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
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
              <p className="text-xs text-slate-500">Shown on the invitation. Leave blank to use your account name.</p>
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
            <p className="mt-3 text-xs text-slate-500">
              You can add a cover image after saving.
            </p>
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
            Save draft
          </Button>
          <Link href="/dashboard">
            <Button type="button" variant="ghost" size="lg">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
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
