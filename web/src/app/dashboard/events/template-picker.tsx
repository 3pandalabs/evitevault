"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { Template } from "@/lib/api/host";
import { CoverArt } from "@/lib/coverArt";
import { ALL_FONTS, fontStack, googleFontsHrefFor } from "@/lib/fontStacks";
import { categoryLabel, sortCategories } from "@/lib/templateCategories";
import { cn } from "@/lib/utils";

/**
 * The design picker, organised as occasion tabs.
 *
 * One tab is open at a time and there is no "all" — a host arrives thinking
 * "my daughter's naming day", not browsing a catalogue, and two dozen designs
 * on a single scroll is a worse way to find the wedding ones than a tab
 * labelled Wedding. The tabs come from the templates that actually loaded, so a
 * category seeded later needs no change here and an empty one never appears.
 *
 * Filtering is client-side: the list is a few dozen rows the form already
 * holds, and a round trip per tab would make it feel slower than scrolling.
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
  const categories = useMemo(
    () => sortCategories(templates.map((t) => t.category)),
    [templates],
  );

  // Opens on the occasion of the design already chosen — which on the edit
  // screen is the one the host picked last time, and on a new event is
  // whichever tab comes first. Null until templates load, then resolved below
  // rather than in an effect, so the first paint is already on the right tab.
  const [chosen, setChosen] = useState<string | null>(null);
  const selectedCategory = templates.find((t) => t.id === value)?.category;
  const active =
    (chosen && categories.includes(chosen) ? chosen : null) ??
    selectedCategory ??
    categories[0] ??
    null;

  const shown = useMemo(
    () => templates.filter((t) => t.category === active),
    [templates, active],
  );

  const headline = sampleTitle.trim() || "Your event";
  const selectedName = templates.find((t) => t.id === value)?.name;
  const selectedElsewhere = value !== null && selectedCategory !== active;

  if (templates.length === 0) {
    return <p className="text-sm text-slate-500">Loading designs…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Every family at once: the picker shows all the designs together, and a
          preview in a fallback serif is a preview of the wrong design. React
          hoists this into <head> and dedupes it across renders. */}
      <link rel="stylesheet" href={googleFontsHrefFor(ALL_FONTS)} />

      <div
        role="tablist"
        aria-label="Occasion"
        // Scrolls sideways on a phone rather than wrapping into three rows of
        // tabs above the designs themselves.
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1"
      >
        {categories.map((c) => {
          const on = c === active;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setChosen(c)}
              className={cn(
                "shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-sm transition",
                on
                  ? "border-slate-900 font-semibold text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {categoryLabel(c)}
              <span className="ml-1.5 text-xs text-slate-400">
                {templates.filter((t) => t.category === c).length}
              </span>
            </button>
          );
        })}
      </div>

      {selectedElsewhere ? (
        <p className="text-xs text-slate-500">
          Your chosen design, <span className="font-medium">{selectedName}</span>, is under{" "}
          <span className="font-medium">{categoryLabel(selectedCategory!)}</span> — it stays
          selected until you pick another.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {shown.map((t) => {
          const selected = value === t.id;
          const { palette, fonts, art } = t.theme;
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
              {/* A miniature of the actual invitation — the design's cover
                  artwork, the host's own title, that template's heading font.
                  Past a dozen designs a colour swatch stops being
                  distinguishable, and the artwork is the first thing a guest
                  sees. */}
              <div className="relative mb-2 h-28 overflow-hidden rounded-lg">
                <CoverArt art={art ?? "plain"} palette={palette} className="absolute inset-0" />
                <div className="absolute inset-0 flex items-center justify-center p-3">
                  <div
                    className="w-full rounded-md px-2 py-2.5 text-center shadow-sm"
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
    </div>
  );
}
