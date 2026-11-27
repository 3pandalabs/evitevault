"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getMe, type Me } from "@/lib/api/host";

/**
 * The signed-in account, fetched ONCE per dashboard visit and shared by the
 * shell (nav, admin bar) and the pages that need feature switches.
 *
 * `features` comes from the API (`/auth/me`), which decides VIDEO_INVITES and
 * CASH_GIFTS on the server. Nothing here infers a feature from `role`. The
 * feature cards still ask the API themselves and render nothing on a 404, so
 * this is a display hint (which tab to show), never a gate.
 *
 * undefined = still loading, null = the call failed.
 */
const MeContext = createContext<Me | null | undefined>(undefined);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getMe()
      .then((m) => {
        if (alive) setMe(m);
      })
      .catch(() => {
        if (alive) setMe(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}
