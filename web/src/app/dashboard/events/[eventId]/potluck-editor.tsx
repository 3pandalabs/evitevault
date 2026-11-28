"use client";

import { Loader2, Plus, Trash2, Utensils } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { addPotluckItem, deletePotluckItem, getPotluck, type HostPotluckItem } from "@/lib/api/extras";
import { updateEvent } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../../ui";

// "What to bring": the host's list, with who has signed up for what. Guests
// sign up from their personal invitation link.
export function PotluckEditor({ eventId, enabled, onToggled }: { eventId: string; enabled: boolean; onToggled: (on: boolean) => void }) {
  const [items, setItems] = useState<HostPotluckItem[] | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPotluck(eventId)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [eventId]);
  useEffect(load, [load]);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await updateEvent(eventId, { potluckEnabled: on });
      onToggled(on);
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setItems((await addPotluckItem(eventId, { name: name.trim(), quantity: qty })).items);
      setName("");
      setQty(1);
    } catch {
      setError("Couldn't add that item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="What to bring"
      icon={Utensils}
      description="A potluck or sign-up list on the invitation. Guests claim items with their personal link; everyone sees what's covered."
      actions={
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" className="size-4 accent-zinc-900" checked={enabled} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
          Show on invitation
        </label>
      }
    >
      {items === null ? (
        <Loader2 className="size-4 animate-spin text-zinc-400" />
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No items yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900">
                  {i.name} <span className="font-normal text-zinc-500">· {i.claimed}/{i.quantity} claimed</span>
                </p>
                {i.claims.length ? <p className="text-xs text-zinc-500">{i.claims.map((c) => (c.quantity > 1 ? `${c.name} ×${c.quantity}` : c.name)).join(", ")}</p> : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete ${i.name}`}
                onClick={async () => {
                  if (i.claims.length && !window.confirm("People signed up for this. Delete it anyway?")) return;
                  setItems((await deletePotluckItem(eventId, i.id)).items);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-4 grid grid-cols-[1fr_5rem_auto] gap-2">
        <Input aria-label="Item" placeholder="e.g. Salad, ice, plates" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="How many" type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
        <Button type="submit" className="rounded-full" disabled={busy || !name.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </Panel>
  );
}
