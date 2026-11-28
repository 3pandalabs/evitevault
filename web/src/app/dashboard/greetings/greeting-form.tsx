"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { listTemplates, type GreetingInput, type Template } from "@/lib/api/host";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { resolveCardDesign, type CardContent as CardContentData, type CardPalette } from "@/lib/card/spec";
import { ART_CHOICES, ART_LABELS, CoverArt, type ArtPalette } from "@/lib/coverArt";
import { ALL_FONTS } from "@/lib/fontStacks";
import { cn } from "@/lib/utils";
import { TemplatePicker } from "../events/template-picker";
import { GreetingCard } from "./greeting-card";

// Offered in the form; stored as free text so a host is never stuck when their
// occasion isn't here. Matches the seeded card categories where they overlap.
const OCCASIONS = [
  "Thanksgiving",
  "Christmas",
  "New Year",
  "Birthday",
  "Anniversary",
  "Thank you",
  "Congratulations",
  "Get well soon",
  "Just because",
];

export type GreetingFormValues = {
  title: string;
  message: string;
  hostDisplayName: string;
  occasion: string;
  templateId: string | null;
  /** Cover artwork override; null keeps whatever the design ships with. */
  art: string | null;
  /** Typography override; null follows the chosen design's fonts. */
  headingFont: string | null;
  bodyFont: string | null;
  /** Accent-colour override; null keeps the design's own accent. */
  accent: string | null;
};

// Preset accent swatches — a curated row so a host recolours a design in one
// tap, the way Evite offers colourways per card.
const ACCENTS = [
  "#b45309",
  "#c05621",
  "#a62b25",
  "#d4af37",
  "#4e7a51",
  "#0f766e",
  "#2456e6",
  "#e58aa5",
  "#c86dd7",
  "#ff5964",
  "#1f2937",
];

/**
 * Create and edit over the same fields, like the event form — one component so
 * a field can't go missing from one screen. A greeting is deliberately the
 * small version: a title, a message, who it's from, an occasion, and a design.
 * No timing, location, RSVP or photos, because a greeting has no public page
 * and no guests. The card preview on the right is the thing you actually send.
 */
export function GreetingForm({
  initial,
  submitLabel,
  cancelHref,
  failureMessage,
  onSubmit,
  greetingId,
}: {
  initial?: Partial<GreetingFormValues>;
  submitLabel: string;
  cancelHref: string;
  failureMessage: string;
  onSubmit: (input: GreetingInput) => Promise<void>;
  /** Set on the edit screen — enables emailing the card (a saved greeting). */
  greetingId?: string;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [message, setMessage] = useState(initial?.message ?? "");
  const [hostDisplayName, setHostDisplayName] = useState(initial?.hostDisplayName ?? "");
  const [occasion, setOccasion] = useState(initial?.occasion ?? "");
  const [templateId, setTemplateId] = useState<string | null>(initial?.templateId ?? null);
  const [art, setArt] = useState<string | null>(initial?.art ?? null);
  const [accent, setAccent] = useState<string | null>(initial?.accent ?? null);
  // Concrete fonts the card uses. Defaults to the chosen design's pairing and
  // follows it when the design changes, until the host overrides it here.
  const [fonts, setFonts] = useState<{ heading: string; body: string }>({
    heading: initial?.headingFont ?? "playfair",
    body: initial?.bodyFont ?? "inter",
  });
  const fontsTouched = useRef(Boolean(initial?.headingFont || initial?.bodyFont));

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTemplates()
      .then((d) => {
        setTemplates(d.templates);
        setTemplateId((current) => current ?? d.templates[0]?.id ?? null);
      })
      .catch(() => setError("Couldn't load card designs."));
  }, []);

  // Keep the fonts following the chosen design until the host overrides them.
  useEffect(() => {
    if (fontsTouched.current) return;
    const t = templates.find((x) => x.id === templateId);
    if (t) setFonts({ heading: t.theme.fonts.heading, body: t.theme.fonts.body });
  }, [templates, templateId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        title: title.trim(),
        message: message.trim() || null,
        hostDisplayName: hostDisplayName.trim() || null,
        occasion: occasion.trim() || null,
        templateId,
        // An empty object rather than null: null would clear every override.
        // Fonts are always included (they're a concrete choice); artwork only
        // when overridden.
        themeOverrides: {
          ...(art ? { art } : {}),
          ...(accent ? { palette: { accent } } : {}),
          fonts: { heading: fonts.heading, body: fonts.body },
        },
      });
    } catch {
      setError(failureMessage);
    } finally {
      setSubmitting(false);
    }
  }

  // The card preview reads the chosen template's look plus the live form
  // fields. showQr is forced off — a greeting has no link to encode.
  const previewPalette: CardPalette | null = selectedTemplate
    ? { ...selectedTemplate.theme.palette, accent: accent ?? selectedTemplate.theme.palette.accent }
    : null;
  const previewFonts = fonts;
  // No eyebrow on a greeting — the template's "Thanksgiving dinner"/"You're
  // invited" line is invitation copy. A greeting shows only its title, who it's
  // from, the message and the footer.
  const previewDesign = selectedTemplate
    ? resolveCardDesign(selectedTemplate.theme.card, { showQr: false, eyebrow: "" })
    : null;
  const previewArt = art ?? selectedTemplate?.theme.art ?? "plain";
  const previewContent: CardContentData = {
    title: title.trim() || "Your greeting",
    hostName: hostDisplayName.trim() || null,
    hostPrefix: "From",
    dateLine: "",
    timeLine: null,
    locationName: null,
    message: message.trim() || null,
    url: "",
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>The basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Greeting title</Label>
                <Input
                  id="title"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Happy Thanksgiving from all of us!"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="occasion">Occasion</Label>
                <select
                  id="occasion"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">No occasion</option>
                  {OCCASIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="host">From</Label>
                <Input
                  id="host"
                  maxLength={120}
                  value={hostDisplayName}
                  onChange={(e) => setHostDisplayName(e.target.value)}
                  placeholder="Marie and Liam"
                />
                <p className="text-xs text-slate-500">
                  Shown on the card. Leave blank to use your account name.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  rows={5}
                  maxLength={5000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Wishing you a warm and happy holiday…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Design</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <TemplatePicker
                templates={templates}
                value={templateId}
                onChange={setTemplateId}
                sampleTitle={title}
              />

              {selectedTemplate ? (
                <div className="space-y-2 border-t border-slate-100 pt-5">
                  <div>
                    <Label>Cover artwork</Label>
                    <p className="text-xs text-slate-500">
                      Drawn in this design&apos;s own colours.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    <ArtTile
                      label="Design's own"
                      art={selectedTemplate.theme.art ?? "plain"}
                      palette={selectedTemplate.theme.palette}
                      selected={art === null}
                      onClick={() => setArt(null)}
                    />
                    {ART_CHOICES.map((a) => (
                      <ArtTile
                        key={a}
                        label={ART_LABELS[a]}
                        art={a}
                        palette={selectedTemplate.theme.palette}
                        selected={art === a}
                        onClick={() => setArt(a)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedTemplate ? (
                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <div>
                    <Label>Typography</Label>
                    <p className="text-xs text-slate-500">
                      Starts from the design&apos;s own fonts — change either to taste.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="heading-font" className="text-xs font-normal text-slate-500">
                        Heading font
                      </Label>
                      <select
                        id="heading-font"
                        value={fonts.heading}
                        onChange={(e) => {
                          fontsTouched.current = true;
                          setFonts((f) => ({ ...f, heading: e.target.value }));
                        }}
                        className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize"
                      >
                        {ALL_FONTS.map((f) => (
                          <option key={f} value={f}>
                            {f.replace(/-/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="body-font" className="text-xs font-normal text-slate-500">
                        Body font
                      </Label>
                      <select
                        id="body-font"
                        value={fonts.body}
                        onChange={(e) => {
                          fontsTouched.current = true;
                          setFonts((f) => ({ ...f, body: e.target.value }));
                        }}
                        className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize"
                      >
                        {ALL_FONTS.map((f) => (
                          <option key={f} value={f}>
                            {f.replace(/-/g, " ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedTemplate ? (
                <div className="space-y-2 border-t border-slate-100 pt-5">
                  <div>
                    <Label>Colour</Label>
                    <p className="text-xs text-slate-500">
                      Recolours the accent — the buttons, rule and highlights.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAccent(null)}
                      aria-pressed={accent === null}
                      title="Design's own"
                      className={cn(
                        "size-8 rounded-full border-2 transition",
                        accent === null ? "border-slate-900" : "border-slate-200 hover:border-slate-400",
                      )}
                      style={{ background: selectedTemplate.theme.palette.accent }}
                    />
                    {ACCENTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAccent(c)}
                        aria-pressed={accent === c}
                        title={c}
                        className={cn(
                          "size-8 rounded-full border-2 transition",
                          accent === c ? "border-slate-900" : "border-slate-200 hover:border-slate-400",
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
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
        </div>

        {/* The card floats with the scroll — pinned near the top so it stays in
            view while the host works down the form. This is the image the
            greeting becomes. */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          {previewDesign && previewPalette && previewFonts ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Card preview</p>
              <GreetingCard
                design={previewDesign}
                palette={previewPalette}
                fonts={previewFonts}
                content={previewContent}
                art={previewArt}
                greetingId={greetingId}
              />
              <p className="text-center text-xs text-slate-500">
                Save the greeting to keep it — download or share the image to send it.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function ArtTile({
  label,
  art,
  palette,
  selected,
  onClick,
}: {
  label: string;
  art: string;
  palette: ArtPalette;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className={cn(
        "overflow-hidden rounded-lg border-2 text-left transition",
        selected ? "border-slate-900" : "border-slate-200 hover:border-slate-300",
      )}
    >
      <div className="h-12">
        <CoverArt art={art} palette={palette} />
      </div>
      <p className="truncate px-1.5 py-1 text-[11px] text-slate-600">{label}</p>
    </button>
  );
}
