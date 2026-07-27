// Seeds the built-in invitation templates. Idempotent — matched on the stable
// `key`, so re-running after a deploy updates designs in place rather than
// creating duplicates, and an event's templateId survives a re-seed.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eventTemplates } from "./schema.js";
import type { Theme } from "../lib/theme.js";

type SeedTemplate = {
  key: string;
  name: string;
  description: string;
  category: string;
  sortOrder: number;
  theme: Theme;
};

const TEMPLATES: SeedTemplate[] = [
  {
    key: "garden-party",
    name: "Garden Party",
    description: "Warm and botanical — for daytime gatherings, showers and brunches.",
    category: "celebration",
    sortOrder: 10,
    theme: {
      palette: {
        bg: "#f4f7f0",
        surface: "#ffffff",
        text: "#22331f",
        muted: "#6b7d66",
        accent: "#4f7a3a",
        accentText: "#ffffff",
      },
      fonts: { heading: "cormorant", body: "inter" },
      layout: "classic",
    },
  },
  {
    key: "midnight",
    name: "Midnight",
    description: "High-contrast dark invitation for evening events and parties.",
    category: "celebration",
    sortOrder: 20,
    theme: {
      palette: {
        bg: "#0b0f19",
        surface: "#151b2b",
        text: "#f8fafc",
        muted: "#94a3b8",
        accent: "#e0b23c",
        accentText: "#0b0f19",
      },
      fonts: { heading: "playfair", body: "dm-sans" },
      layout: "poster",
    },
  },
  {
    key: "classic-cream",
    name: "Classic Cream",
    description: "Traditional formal stationery — weddings, engagements, anniversaries.",
    category: "formal",
    sortOrder: 30,
    theme: {
      palette: {
        bg: "#faf7f2",
        surface: "#ffffff",
        text: "#1f2937",
        muted: "#6b7280",
        accent: "#b45309",
        accentText: "#ffffff",
      },
      fonts: { heading: "playfair", body: "lora" },
      layout: "classic",
    },
  },
  {
    key: "confetti",
    name: "Confetti",
    description: "Bright and playful — birthdays and kids' parties.",
    category: "celebration",
    sortOrder: 40,
    theme: {
      palette: {
        bg: "#fff7fb",
        surface: "#ffffff",
        text: "#3b0764",
        muted: "#7e5ba6",
        accent: "#db2777",
        accentText: "#ffffff",
      },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
    },
  },
  {
    key: "minimal-slate",
    name: "Minimal Slate",
    description: "Understated and typographic — dinners, meetups and work events.",
    category: "professional",
    sortOrder: 50,
    theme: {
      palette: {
        bg: "#ffffff",
        surface: "#f8fafc",
        text: "#0f172a",
        muted: "#64748b",
        accent: "#0f172a",
        accentText: "#ffffff",
      },
      fonts: { heading: "inter", body: "inter" },
      layout: "minimal",
    },
  },
  {
    key: "photo-first",
    name: "Photo First",
    description: "Full-bleed cover image with the details overlaid.",
    category: "general",
    sortOrder: 60,
    theme: {
      palette: {
        bg: "#111111",
        surface: "#1c1c1c",
        text: "#ffffff",
        muted: "#a3a3a3",
        accent: "#ffffff",
        accentText: "#111111",
      },
      fonts: { heading: "space-grotesk", body: "inter" },
      layout: "photo",
    },
  },
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed");

const pool = new Pool({ connectionString });
const db = drizzle(pool);

for (const t of TEMPLATES) {
  await db
    .insert(eventTemplates)
    .values({ ...t, isSystem: true, createdBy: null })
    .onConflictDoUpdate({
      target: eventTemplates.key,
      set: {
        name: t.name,
        description: t.description,
        category: t.category,
        theme: t.theme,
        sortOrder: t.sortOrder,
      },
    });
}

await pool.end();
console.log(`Seeded ${TEMPLATES.length} templates.`);
