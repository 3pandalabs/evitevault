import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared building blocks for the signed-in pages, so every page has the same
// header, panel, empty state and stat tile. They follow the public site's
// language (zinc neutrals, Geist, rounded-2xl white panels on the soft
// gradient backdrop, the gold #b98d4f of the wordmark as the one accent)
// rather than inventing a second look for the dashboard.

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}

export function PageHeader({
  back,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  back?: { href: string; label: string };
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className={cn("flex flex-wrap items-end justify-between gap-4", back && "mt-4")}>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold tracking-[.2em] text-emerald-700 uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

/** A titled white panel. Use for every block of a page so they line up. */
export function Panel({
  title,
  icon: Icon,
  description,
  actions,
  className,
  tone = "default",
  children,
}: {
  title?: React.ReactNode;
  icon?: LucideIcon;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  tone?: "default" | "danger";
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-white/90 p-5 shadow-sm shadow-zinc-900/5 backdrop-blur-sm sm:p-6",
        tone === "danger" ? "border-red-200" : "border-zinc-200",
        className,
      )}
    >
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              className={cn(
                "flex items-center gap-2 text-base font-semibold",
                tone === "danger" ? "text-red-900" : "text-zinc-900",
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0 text-zinc-400" /> : null}
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-10 text-center">
      {Icon ? (
        <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-amber-50 text-[#b98d4f]">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="font-medium text-zinc-900">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm shadow-zinc-900/5">
      <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-zinc-900",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-800",
  draft: "bg-amber-100 text-amber-800",
  cancelled: "bg-rose-100 text-rose-800",
  archived: "bg-zinc-100 text-zinc-600",
  past: "bg-zinc-100 text-zinc-600",
};

const STATUS_LABELS: Record<string, string> = {
  published: "Live",
  draft: "Draft",
  cancelled: "Cancelled",
  archived: "Archived",
  past: "Ended",
};

/** Event status as a pill. `past` is derived (a published event whose day is over). */
export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? STATUS_STYLES.archived,
      )}
    >
      {status === "published" ? <span className="size-1.5 rounded-full bg-emerald-500" /> : null}
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="size-5 animate-spin text-zinc-400" />
    </div>
  );
}

/** Pill-style segmented choice (filters, tabs). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white/80 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900",
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  active ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-500",
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
