"use client";

import { Check, Heart, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Template } from "@/lib/api/host";
import { Input } from "@/components/ui/input";
import { CoverArt } from "@/lib/coverArt";
import { ALL_FONTS, fontStack, googleFontsHrefFor } from "@/lib/fontStacks";
import { categoryLabel, sortCategories } from "@/lib/templateCategories";
import { cn } from "@/lib/utils";

// Favourited design ids live in the browser, not the account — a favourite is a
// lightweight "come back to this" marker, and keeping it client-side means no
// schema, no endpoint, and it works the same on the new-event and new-greeting
// forms that share this picker.
const FAV_KEY = "ev_fav_templates";

/**
 * The design picker — occasion tabs, with a search box and favourites over the
 * top so a host can either browse by occasion or jump straight to a design they
 * remember. Searching or the favourites filter flattens the tabs into one
 * result grid; clearing them returns to the tab view.
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

  const [chosen, setChosen] = useState<string | null>(null);
  const selectedCategory = templates.find((t) => t.id === value)?.category;
  const active =
    (chosen && categories.includes(chosen) ? chosen : null) ??
    selectedCategory ??
    categories[0] ??
    null;

  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavorites(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore a corrupt or unavailable store — favourites are a nicety */
    }
  }, []);

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const filtering = q !== "" || favOnly;

  const shown = useMemo(() => {
    if (!filtering) return templates.filter((t) => t.category === active);
    return templates.filter(
      (t) =>
        (!favOnly || favorites.has(t.id)) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          categoryLabel(t.category).toLowerCase().includes(q)),
    );
  }, [templates, active, filtering, favOnly, favorites, q]);

  const headline = sampleTitle.trim() || "Your event";
  const selectedName = templates.find((t) => t.id === value)?.name;
  const selectedElsewhere =
    !filtering && value !== null && selectedCategory !== active;

  if (templates.length === 0) {
    return <p className="text-sm text-slate-500">Loading designs…</p>;
  }

  return (
    <div className="space-y-4">
      <link rel="stylesheet" href={googleFontsHrefFor(ALL_FONTS)} />

      {/* Search + favourites, above the occasion tabs. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search designs"
            aria-label="Search designs"
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          aria-pressed={favOnly}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition",
            favOnly
              ? "border-rose-300 bg-rose-50 text-rose-700"
              : "border-slate-300 text-slate-600 hover:border-slate-400",
          )}
        >
          <Heart className={cn("size-4", favOnly && "fill-rose-500 text-rose-500")} />
          Favourites
          {favorites.size > 0 ? (
            <span className="text-xs text-slate-400">{favorites.size}</span>
          ) : null}
        </button>
      </div>

      {filtering ? (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {shown.length} {shown.length === 1 ? "design" : "designs"}
            {favOnly ? " in favourites" : ""}
            {q ? ` matching “${query.trim()}”` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFavOnly(false);
            }}
            className="flex items-center gap-1 hover:text-slate-800"
          >
            <X className="size-3.5" />
            Clear
          </button>
        </div>
      ) : (
        <div
          role="tablist"
          aria-label="Occasion"
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
      )}

      {selectedElsewhere ? (
        <p className="text-xs text-slate-500">
          Your chosen design, <span className="font-medium">{selectedName}</span>, is under{" "}
          <span className="font-medium">{categoryLabel(selectedCategory!)}</span> — it stays
          selected until you pick another.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          {favOnly && !q
            ? "No favourites yet — tap the heart on a design to save it."
            : "No designs match your search."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {shown.map((t) => {
            const selected = value === t.id;
            const fav = favorites.has(t.id);
            const { palette, fonts, art } = t.theme;
            return (
              // Not a <button> wrapping a <button>: the favourite heart is a
              // sibling overlay so the markup stays valid and its click doesn't
              // also select the design.
              <div key={t.id} className="relative">
                <button
                  type="button"
                  onClick={() => onChange(t.id)}
                  aria-pressed={selected}
                  className={cn(
                    "w-full rounded-xl border-2 p-3 text-left transition",
                    selected ? "border-slate-900" : "border-slate-200 hover:border-slate-300",
                  )}
                >
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

                  <p className="flex items-center gap-1 pr-7 text-sm font-medium">
                    {selected ? <Check className="size-3.5 shrink-0" /> : null}
                    {t.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>
                </button>

                <button
                  type="button"
                  onClick={() => toggleFav(t.id)}
                  aria-pressed={fav}
                  aria-label={fav ? `Remove ${t.name} from favourites` : `Save ${t.name} to favourites`}
                  title={fav ? "Remove from favourites" : "Save to favourites"}
                  className="absolute right-2 top-2 rounded-full bg-white/80 p-1.5 shadow-sm backdrop-blur-sm transition hover:bg-white"
                >
                  <Heart
                    className={cn("size-4", fav ? "fill-rose-500 text-rose-500" : "text-slate-400")}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
