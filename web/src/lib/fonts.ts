import { Geist, Instrument_Serif } from "next/font/google";

// Scoped to the marketing/login pages only (see those pages' usage) — the
// dashboard and guest invitation pages keep their own fonts, so this isn't
// wired into the root layout's body font-family.
export const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

// Display serif for the home page's festive accents (the italic words in the
// hero and section heads). Home page only, like Geist above.
export const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});
