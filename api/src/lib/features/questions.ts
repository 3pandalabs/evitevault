import { z } from "zod";

// Custom RSVP questions (migration 0015). The host defines up to 10; a guest
// answers with the RSVP; answers show in the guest list and the CSV export.
// Tested in questions.test.ts.

export const MAX_QUESTIONS = 10;
export const MAX_OPTIONS = 12;
export const MAX_ANSWER_CHARS = 500;

export const questionSchema = z.object({
  // Short stable id the client generates (answers are keyed by it, so a
  // re-ordered or re-worded question keeps its answers).
  id: z.string().regex(/^[a-z0-9]{4,24}$/i),
  type: z.enum(["text", "choice", "yesno"]),
  label: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(100)).max(MAX_OPTIONS).optional(),
  required: z.boolean().default(false),
});

export const questionsSchema = z
  .array(questionSchema)
  .max(MAX_QUESTIONS)
  .superRefine((qs, ctx) => {
    const ids = new Set<string>();
    qs.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "duplicate id" });
      ids.add(q.id);
      if (q.type === "choice" && (!q.options || q.options.length < 2)) {
        ctx.addIssue({ code: "custom", path: [i, "options"], message: "a choice needs at least two options" });
      }
    });
  });

export type RsvpQuestion = z.infer<typeof questionSchema>;

/** Reads whatever is stored (jsonb, possibly hand-edited) back into valid questions. */
export function parseQuestions(raw: unknown): RsvpQuestion[] {
  const r = questionsSchema.safeParse(raw ?? []);
  return r.success ? r.data : [];
}

export type AnswerResult =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; error: "answer_required" | "invalid_answer"; questionId: string };

/**
 * Validates a guest's answers. Unknown ids are dropped; blank answers are
 * dropped; `required` is only enforced for someone saying "going" (a decline
 * should never be blocked by a meal choice).
 */
export function cleanAnswers(questions: RsvpQuestion[], raw: Record<string, unknown> | null | undefined, attending: boolean): AnswerResult {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const v = raw?.[q.id];
    const s = typeof v === "string" ? v.trim().slice(0, MAX_ANSWER_CHARS) : "";
    if (!s) {
      if (q.required && attending) return { ok: false, error: "answer_required", questionId: q.id };
      continue;
    }
    if (q.type === "choice" && !(q.options ?? []).includes(s)) {
      return { ok: false, error: "invalid_answer", questionId: q.id };
    }
    if (q.type === "yesno" && s !== "yes" && s !== "no") {
      return { ok: false, error: "invalid_answer", questionId: q.id };
    }
    out[q.id] = s;
  }
  return { ok: true, answers: out };
}

/** CSV columns: one per question, in the host's order. */
export function answerColumns(questions: RsvpQuestion[], answers: Record<string, string> | null): string[] {
  return questions.map((q) => answers?.[q.id] ?? "");
}
