"use client";

import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Apple Calendar and Outlook have no stable "add event" URL scheme, so both get
// the .ics download — which is also the fallback for any client we don't know
// about. Only Google gets a dedicated link.
export function AddToCalendar({ icsUrl, googleUrl }: { icsUrl: string; googleUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full border-black/15 bg-transparent text-[color:var(--ev-text)] hover:bg-black/5"
      >
        <CalendarPlus className="size-4" />
        Add to calendar
      </Button>

      {open ? (
        <div className="ev-surface absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-black/10 shadow-lg">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-4 py-3 text-sm hover:bg-black/5"
          >
            Google Calendar
          </a>
          <a href={icsUrl} className="block px-4 py-3 text-sm hover:bg-black/5">
            Apple Calendar (.ics)
          </a>
          <a href={icsUrl} className="block px-4 py-3 text-sm hover:bg-black/5">
            Outlook / other (.ics)
          </a>
        </div>
      ) : null}
    </div>
  );
}
