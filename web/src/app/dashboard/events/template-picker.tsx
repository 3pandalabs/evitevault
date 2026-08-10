"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { Template } from "@/lib/api/host";
import { ALL_FONTS, fontStack, googleFontsHrefFor } from "@/lib/fontStacks";
import { categoryLabel, sortCategories } from "@/lib/templateCategories";
import { cn } from "@/lib/utils";

/**
 * The design picker, filtered by occasion.
 *
 * A host arrives thinking "my daughter's naming day", not "something soft in
 * mint and peach", so the filter row is the occasion — the same shape as the
 * category nav every invitation site uses. It is derived from the templates
 * that actually came back rather than hard-coded, so a category that gets
 * seeded later needs no change here, and one with nothing in it never shows as
 * an empty tab.
 *
 * Filtering is client-side on purpose: the whole list is a few dozen rows that
 * the form already has in hand, and a round trip per tab would make the picker
 * feel slower than scrolling it.
 */
export function TemplatePicker({
  templates,
  value,
  onChange,
  sampleTitle,
}: {
  templates: Template[];
  value: string | null;
  onChange: (id: string) => void;
  /** Previewed as the invitation's headline, so the choice is made against the
   *  host's own event rather than lorem ipsum. */
  sampleTitle: string;
}) {
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(
    () => sortCategories(templates.map((t) => t.category)),
    [templates],
  );
  const shown = useMemo(
    () => (category ? templates.filter((t) => t.category === category) : templates),
    [templates, category],
  );

  // The selected design may sit in a category the host has just filtered away.
  // Keeping the selection (rather than resetting it) is right — they picked it
  // deliberately — but the row below would then show nothing selected, so say
  // so instead of leaving them guessing.
  const selectedHidden = value !== null && !shown.some((t) => t.id === value);
  const selectedName = templates.find((t) => t.id === value)?.name;

  const headline = sampleTitle.trim() || "Your event";

  return (
    <div className="space-y-4">
      {/* Every family at once: the picker shows all the designs together, and a
          preview in a fallback serif is a preview of the wrong design. React
          hoists this into <head> and dedupes it across renders. */}
      <link rel="stylesheet" href={googleFontsHrefFor(ALL_FONTS)} />

      <div
        role="tablist"
        aria-label="Filter designs by occasion"
        // Scrolls sideways on a phone rather than wrapping into three rows of
        // pills above the designs themselves.
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        <FilterPill
          label="All"
          count={templates.length}
          active={category === null}
          onClick={() => setCategory(null)}
        />
        {categories.map((c) => (
          <FilterPill
            key={c}
            label={categoryLabel(c)}
            count={templates.filter((t) => t.category === c).length}
            active={category === c}
            onClick={() => setCategory(c)}
          />
        ))}
      </div>

      {selectedHidden ? (
        <p className="text-xs text-slate-500">
          Your chosen design, <span className="font-medium">{selectedName}</span>, is in another
          occasion — it stays selected until you pick a different one.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {shown.map((t) => {
          const selected = value === t.id;
          const { palette, fonts } = t.theme;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-pressed={selected}
              className={cn(
                "rounded-xl border-2 p-3 text-left transition",
                selected ? "border-slate-900" : "border-slate-200 hover:border-slate-300",
              )}
            >
              {/* A miniature of the invitation rather than a swatch strip: with
                  two dozen designs, colours alone stop being distinguishable,
                  and the typeface is half of what makes a card feel formal or
                  playful. */}
              <div
                className="mb-2 flex h-28 items-center justify-center rounded-lg p-3"
                style={{ backgroundColor: palette.bg }}
              >
                <div
                  className="w-full rounded-md px-2 py-2.5 text-center"
                  style={{ backgroundColor: palette.surface, color: palette.text }}
                >
                  <p
                    className="truncate text-[13px] font-semibold leading-tight"
                    style={{ fontFamily: fontStack(fonts.heading) }}
                  >
                    {headline}
                  </p>
                  <p
                    className="mt-0.5 text-[9px]"
                    style={{ color: palette.muted, fontFamily: fontStack(fonts.body) }}
                  >
                    Saturday 7:00 PM
                  </p>
                  <span
                    className="mt-1.5 inline-block rounded px-2 py-0.5 text-[9px] font-semibold"
                    style={{ backgroundColor: palette.accent, color: palette.accentText }}
                  >
                    RSVP
                  </span>
                </div>
              </div>

              <p className="flex items-center gap-1 text-sm font-medium">
                {selected ? <Check className="size-3.5 shrink-0" /> : null}
                {t.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          No designs for that occasion yet.
        </p>
      ) : null}
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
      )}
    >
      {label}
      <span className={cn("ml-1.5 text-xs", active ? "text-slate-300" : "text-slate-400")}>
        {count}
      </span>
    </button>
  );
}
