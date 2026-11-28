"use client";

import { BellRing, Gift, HandCoins, Loader2, Music, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api/browser";
import { updateEvent, type EventSummary } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel } from "../../ui";

// Settings for the free guest-page extras (migration 0015): reminders,
// waitlist / approval, registry + playlist links, chip-in handles. Each block
// saves itself with a PATCH, so one bad link never loses the rest.

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input type="checkbox" className="mt-1 size-4 accent-zinc-900" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-zinc-900">{label}</span>
        {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
      </span>
    </label>
  );
}

function useSaver(eventId: string, onSaved: (e: EventSummary) => void) {
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ block: string; text: string; error?: boolean } | null>(null);
  async function save(block: string, patch: Parameters<typeof updateEvent>[1]) {
    setSaving(block);
    setMessage(null);
    try {
      onSaved(await updateEvent(eventId, patch));
      setMessage({ block, text: "Saved." });
    } catch (err) {
      setMessage({ block, text: err instanceof ApiError && err.code === "invalid_request" ? "Check the links and handles — one isn't valid." : "Couldn't save. Please try again.", error: true });
    } finally {
      setSaving(null);
    }
  }
  return { saving, message, save };
}

function Note({ m, block }: { m: { block: string; text: string; error?: boolean } | null; block: string }) {
  if (!m || m.block !== block) return null;
  return <p className={m.error ? "text-sm text-red-600" : "text-sm text-emerald-700"}>{m.text}</p>;
}

export function ExtrasSettings({ event, onSaved }: { event: EventSummary; onSaved: (e: EventSummary) => void }) {
  const { saving, message, save } = useSaver(event.id, onSaved);

  const [reminders, setReminders] = useState(event.remindersEnabled ?? true);
  const [remindMaybe, setRemindMaybe] = useState(event.reminderIncludeMaybe ?? false);
  const [approval, setApproval] = useState(event.approvalRequired ?? false);
  const [waitlist, setWaitlist] = useState(event.waitlistEnabled ?? true);
  const [registry, setRegistry] = useState<{ label: string; url: string }[]>(event.registryLinks ?? []);
  const [playlist, setPlaylist] = useState(event.playlistUrl ?? "");
  const [venmo, setVenmo] = useState(event.chipIn?.venmo ?? "");
  const [cashapp, setCashapp] = useState(event.chipIn?.cashapp ?? "");
  const [paypal, setPaypal] = useState(event.chipIn?.paypal ?? "");

  return (
    <div className="space-y-6">
      <Panel title="Reminders" icon={BellRing} description="One email the day before, with the time, address, map and calendar links. Never sent to people who haven't replied.">
        <div className="space-y-1">
          <Toggle checked={reminders} onChange={setReminders} label="Send a day-before reminder" hint="To guests who said they're going." />
          <Toggle checked={remindMaybe} onChange={setRemindMaybe} disabled={!reminders} label="Also remind the maybes" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" className="rounded-full" disabled={saving === "rem"} onClick={() => save("rem", { remindersEnabled: reminders, reminderIncludeMaybe: remindMaybe })}>
            {saving === "rem" ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          <Note m={message} block="rem" />
        </div>
        <p className="mt-2 text-xs text-zinc-500">Shares the daily email allowance with invitations; if it runs out, the reminder is skipped for those guests.</p>
      </Panel>

      <Panel title="Waitlist & approval" icon={ShieldCheck} description="What happens when someone says they're going.">
        <div className="space-y-1">
          <Toggle checked={approval} onChange={setApproval} label="I approve every “going”" hint="Guests wait on a list until you confirm them; they get one email when you do." />
          <Toggle
            checked={waitlist}
            onChange={setWaitlist}
            label="Waitlist when the event is full"
            hint={event.capacity ? `Capacity is ${event.capacity}. Off = “going” is refused once full.` : "Set a capacity in Edit details for this to matter."}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" className="rounded-full" disabled={saving === "wait"} onClick={() => save("wait", { approvalRequired: approval, waitlistEnabled: waitlist })}>
            {saving === "wait" ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          <Note m={message} block="wait" />
        </div>
      </Panel>

      <Panel title="Registry & playlist" icon={Gift} description="Links shown on the invitation. Any http(s) link works.">
        <div className="space-y-3">
          {registry.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
              <Input aria-label="Label" placeholder="Label (optional)" value={r.label} maxLength={80} onChange={(e) => setRegistry((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <Input aria-label="Registry link" placeholder="https://…" value={r.url} onChange={(e) => setRegistry((rs) => rs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <Button variant="ghost" size="sm" aria-label="Remove link" onClick={() => setRegistry((rs) => rs.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {registry.length < 5 ? (
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setRegistry((rs) => [...rs, { label: "", url: "" }])}>
              <Plus className="size-4" /> Add a registry or wishlist link
            </Button>
          ) : null}
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="playlist" className="flex items-center gap-1.5">
              <Music className="size-4 text-zinc-400" /> Playlist (Spotify, Apple Music, YouTube)
            </Label>
            <Input id="playlist" placeholder="https://open.spotify.com/playlist/…" value={playlist} onChange={(e) => setPlaylist(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            className="rounded-full"
            disabled={saving === "links"}
            onClick={() =>
              save("links", {
                registryLinks: registry.filter((r) => r.url.trim()).map((r) => ({ label: r.label.trim(), url: r.url.trim() })),
                playlistUrl: playlist.trim() || null,
              })
            }
          >
            {saving === "links" ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          <Note m={message} block="links" />
        </div>
      </Panel>

      <Panel
        title="Chip in"
        icon={HandCoins}
        description="Your own Venmo, Cash App or PayPal.me. Guests pay you directly in their app — RsvpVault never sees or holds the money, and the invitation says so."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="venmo">Venmo</Label>
            <Input id="venmo" placeholder="@username" value={venmo} onChange={(e) => setVenmo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cashapp">Cash App</Label>
            <Input id="cashapp" placeholder="$cashtag" value={cashapp} onChange={(e) => setCashapp(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paypal">PayPal.me</Label>
            <Input id="paypal" placeholder="paypal.me/name" value={paypal} onChange={(e) => setPaypal(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" className="rounded-full" disabled={saving === "chip"} onClick={() => save("chip", { chipIn: { venmo: venmo || null, cashapp: cashapp || null, paypal: paypal || null } })}>
            {saving === "chip" ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
          <Note m={message} block="chip" />
        </div>
      </Panel>
    </div>
  );
}
