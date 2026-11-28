"use client";

import { ArrowDown, ArrowUp, ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { saveQuestions } from "@/lib/api/extras";
import type { RsvpQuestion } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "../../ui";

const newId = () => Math.random().toString(36).slice(2, 10).padEnd(6, "x");

const PRESETS: { label: string; make: () => RsvpQuestion }[] = [
  { label: "Meal choice", make: () => ({ id: newId(), type: "choice", label: "Meal choice", options: ["Chicken", "Fish", "Vegetarian"], required: true }) },
  { label: "Song request", make: () => ({ id: newId(), type: "text", label: "Song request", required: false }) },
  { label: "Yes / no", make: () => ({ id: newId(), type: "yesno", label: "Do you need parking?", required: false }) },
];

// Up to 10 host-defined questions on the RSVP form. Answers show in the
// replies list and in the CSV export, one column per question.
export function QuestionsEditor({ eventId, initial, onSaved }: { eventId: string; initial: RsvpQuestion[]; onSaved: (q: RsvpQuestion[]) => void }) {
  const [qs, setQs] = useState<RsvpQuestion[]>(initial);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  const update = (i: number, patch: Partial<RsvpQuestion>) => setQs((all) => all.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQs((all) => {
      const next = [...all];
      const j = i + d;
      if (j < 0 || j >= next.length) return all;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const cleaned = qs
        .filter((q) => q.label.trim())
        .map((q) => ({ ...q, label: q.label.trim(), options: q.type === "choice" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined }));
      const r = await saveQuestions(eventId, cleaned);
      setQs(r.questions);
      onSaved(r.questions);
      setNote({ text: "Saved." });
    } catch {
      setNote({ text: "Couldn't save — a choice question needs at least two options.", error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Questions for guests" icon={ListChecks} description="Asked on the RSVP form (meal choice, song requests, anything). Required ones are only required for people who say they're going.">
      <div className="space-y-4">
        {qs.length === 0 ? <p className="text-sm text-zinc-500">No questions yet.</p> : null}
        {qs.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-zinc-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Question" value={q.label} maxLength={200} onChange={(e) => update(i, { label: e.target.value })} className="min-w-0 flex-1" />
              <select
                aria-label="Answer type"
                value={q.type}
                onChange={(e) => update(i, { type: e.target.value as RsvpQuestion["type"], options: e.target.value === "choice" ? (q.options?.length ? q.options : ["", ""]) : undefined })}
                className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                <option value="text">Short answer</option>
                <option value="choice">Pick one</option>
                <option value="yesno">Yes / no</option>
              </select>
            </div>
            {q.type === "choice" ? (
              <div className="mt-2 space-y-2 pl-1">
                {(q.options ?? []).map((o, k) => (
                  <div key={k} className="flex gap-2">
                    <Input aria-label={`Option ${k + 1}`} value={o} maxLength={100} placeholder={`Option ${k + 1}`} onChange={(e) => update(i, { options: (q.options ?? []).map((x, m) => (m === k ? e.target.value : x)) })} />
                    <Button variant="ghost" size="sm" aria-label="Remove option" onClick={() => update(i, { options: (q.options ?? []).filter((_, m) => m !== k) })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {(q.options?.length ?? 0) < 12 ? (
                  <Button variant="ghost" size="sm" onClick={() => update(i, { options: [...(q.options ?? []), ""] })}>
                    <Plus className="size-4" /> Option
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" className="size-4 accent-zinc-900" checked={Boolean(q.required)} onChange={(e) => update(i, { required: e.target.checked })} />
                Required
              </label>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" aria-label="Move up" onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Move down" onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Delete question" onClick={() => setQs((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {qs.length < 10 ? (
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.label} variant="outline" size="sm" className="rounded-full" onClick={() => setQs((all) => [...all, p.make()])}>
                <Plus className="size-4" /> {p.label}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button size="sm" className="rounded-full" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save questions
          </Button>
          {note ? <span className={note.error ? "text-sm text-red-600" : "text-sm text-emerald-700"}>{note.text}</span> : null}
        </div>
      </div>
    </Panel>
  );
}

/** "Meal: Veg · Parking: yes" for the replies list. */
export function answersSummary(questions: RsvpQuestion[], answers: Record<string, string> | null | undefined): string {
  if (!answers) return "";
  return questions
    .filter((q) => answers[q.id])
    .map((q) => `${q.label}: ${answers[q.id]}`)
    .join(" · ");
}
