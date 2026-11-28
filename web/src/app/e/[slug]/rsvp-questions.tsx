"use client";

import { Input, Label } from "@/components/ui/input";
import type { PublicQuestion } from "@/lib/api/public";
import { cn } from "@/lib/utils";

// The host's custom questions inside the RSVP form (meal choice, song
// request, "need parking?"). Required ones are enforced only for "going",
// by the API too (lib/features/questions.ts).
export function RsvpQuestions({
  questions,
  answers,
  onChange,
  attending,
}: {
  questions: PublicQuestion[];
  answers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  attending: boolean;
}) {
  if (questions.length === 0) return null;
  const set = (id: string, v: string) => onChange({ ...answers, [id]: v });

  return (
    <div className="space-y-4">
      {questions.map((q) => {
        const required = Boolean(q.required) && attending;
        const id = `rsvp-q-${q.id}`;
        if (q.type === "text") {
          return (
            <div key={q.id} className="space-y-1.5">
              <Label htmlFor={id}>
                {q.label}
                {required ? " *" : ""}
              </Label>
              <Input id={id} value={answers[q.id] ?? ""} required={required} maxLength={500} onChange={(e) => set(q.id, e.target.value)} />
            </div>
          );
        }
        const options = q.type === "yesno" ? ["yes", "no"] : (q.options ?? []);
        return (
          <fieldset key={q.id} className="space-y-1.5">
            <legend className="text-sm font-medium">
              {q.label}
              {required ? " *" : ""}
            </legend>
            <div className="flex flex-wrap gap-2 pt-1">
              {options.map((o) => {
                const selected = answers[q.id] === o;
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set(q.id, selected && !required ? "" : o)}
                    className={cn(
                      "rounded-full border-2 px-4 py-1.5 text-sm transition",
                      selected ? "border-[var(--ev-accent)]" : "border-black/10 hover:border-black/25",
                    )}
                    style={selected ? { backgroundColor: "var(--ev-accent)", color: "var(--ev-accent-text)" } : undefined}
                  >
                    {q.type === "yesno" ? (o === "yes" ? "Yes" : "No") : o}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/** Client-side mirror of the API's required check, for a friendlier message before submitting. */
export function missingRequired(questions: PublicQuestion[], answers: Record<string, string>, attending: boolean): PublicQuestion | null {
  if (!attending) return null;
  return questions.find((q) => q.required && !answers[q.id]?.trim()) ?? null;
}
