// Seeds the built-in invitation templates. Idempotent — matched on the stable
// `key`, so re-running after a deploy updates designs in place rather than
// creating duplicates, and an event's templateId survives a re-seed.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eventTemplates } from "./schema.js";
import type { CardDesign, Theme } from "../lib/theme.js";

type SeedTemplate = {
  key: string;
  name: string;
  description: string;
  category: string;
  sortOrder: number;
  // Card composition is added from CARDS below rather than written here — see
  // the comment on that map.
  theme: Omit<Theme, "card">;
};

// Categories are the occasion, not the mood — "wedding", not "formal". They are
// what the host filters by when picking a design, and a host looking for an
// invitation is thinking "my daughter's naming day", never "something
// understated and typographic". The canonical set, which the web picker orders
// and labels (web/src/lib/templateCategories.ts):
//
//   wedding · baby · birthday · festival · housewarming · party · business
//   · general
//
// A category outside that set still works — the picker falls back to
// title-casing it — but add it to both places rather than relying on that.
//
// sortOrder is banded by category (wedding 100s, baby 200s …) so the "All" view
// stays grouped by occasion instead of interleaving a Diwali design between two
// wedding ones.
const TEMPLATES: SeedTemplate[] = [
  // --- Wedding & the events around it ---------------------------------------
  {
    key: "classic-cream",
    name: "Classic Cream",
    description: "Traditional formal stationery — weddings, engagements, anniversaries.",
    category: "wedding",
    sortOrder: 100,
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
      art: "rings",
    },
  },
  {
    key: "marigold-mandap",
    name: "Marigold Mandap",
    description: "Marigold and vermilion — the traditional Indian wedding card.",
    category: "wedding",
    sortOrder: 110,
    theme: {
      palette: {
        bg: "#fff6e8",
        surface: "#ffffff",
        text: "#4a1d10",
        muted: "#96603f",
        accent: "#c2410c",
        accentText: "#ffffff",
      },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "marigold",
    },
  },
  {
    key: "sangeet-night",
    name: "Sangeet Night",
    description: "Magenta and gold, made loud — sangeet, cocktail hour, the reception.",
    category: "wedding",
    sortOrder: 120,
    theme: {
      palette: {
        bg: "#2a0a2e",
        surface: "#3d1342",
        text: "#fdf4ff",
        muted: "#e0b6e8",
        accent: "#f0b429",
        accentText: "#2a0a2e",
      },
      fonts: { heading: "playfair", body: "dm-sans" },
      layout: "poster",
      art: "mandala",
    },
  },
  {
    key: "mehendi-green",
    name: "Mehendi",
    description: "Henna green with a saffron edge — mehendi and haldi mornings.",
    category: "wedding",
    sortOrder: 130,
    theme: {
      palette: {
        bg: "#f2f7ec",
        surface: "#ffffff",
        text: "#1f3312",
        muted: "#5f7a4c",
        accent: "#e08a1e",
        accentText: "#ffffff",
      },
      fonts: { heading: "cormorant", body: "inter" },
      layout: "classic",
      art: "petals",
    },
  },
  {
    key: "emerald-nikah",
    name: "Emerald Nikah",
    description: "Deep emerald and gold, quietly formal — nikah and walima.",
    category: "wedding",
    sortOrder: 140,
    theme: {
      palette: {
        bg: "#04302a",
        surface: "#0a4038",
        text: "#f0fdf9",
        muted: "#93c9bb",
        accent: "#d8b26a",
        accentText: "#04302a",
      },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "mandala",
    },
  },
  {
    key: "save-the-date",
    name: "Save the Date",
    description: "Blush and airy, mostly type — an early note before the real card.",
    category: "wedding",
    sortOrder: 150,
    theme: {
      palette: {
        bg: "#fdf2f4",
        surface: "#ffffff",
        text: "#3f2229",
        muted: "#9b6b78",
        accent: "#b03d5c",
        accentText: "#ffffff",
      },
      fonts: { heading: "playfair", body: "inter" },
      layout: "minimal",
      art: "plain",
    },
  },

  // --- Baby: showers, naming days, first milestones -------------------------
  {
    key: "baby-pastel",
    name: "Little One",
    description: "Soft mint and peach — baby showers and welcome-home afternoons.",
    category: "baby",
    sortOrder: 200,
    theme: {
      palette: {
        bg: "#f0f8f6",
        surface: "#ffffff",
        text: "#26403c",
        muted: "#6f918b",
        accent: "#e58b6f",
        accentText: "#ffffff",
      },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "classic",
      art: "stars",
    },
  },
  {
    key: "godh-bharai",
    name: "Godh Bharai",
    description: "Marigold and rose for the traditional blessing ceremony.",
    category: "baby",
    sortOrder: 210,
    theme: {
      palette: {
        bg: "#fff4ef",
        surface: "#ffffff",
        text: "#52201f",
        muted: "#9c6259",
        accent: "#d1436a",
        accentText: "#ffffff",
      },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "marigold",
    },
  },
  {
    key: "namkaran-day",
    name: "Naming Day",
    description: "Pale blue and cream, calm and formal — namkaran and christenings.",
    category: "baby",
    sortOrder: 220,
    theme: {
      palette: {
        bg: "#f4f8fd",
        surface: "#ffffff",
        text: "#1e2f47",
        muted: "#6b8199",
        accent: "#3a6ea5",
        accentText: "#ffffff",
      },
      fonts: { heading: "playfair", body: "inter" },
      layout: "minimal",
      art: "stars",
    },
  },

  // --- Birthdays, from turning one to turning sixty -------------------------
  {
    key: "confetti",
    name: "Confetti",
    description: "Bright and playful — birthdays and kids' parties.",
    category: "birthday",
    sortOrder: 300,
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
      art: "confetti",
    },
  },
  {
    key: "balloon-pop",
    name: "Balloon Pop",
    description: "Primary colours and big type — a kids' party invitation.",
    category: "birthday",
    sortOrder: 310,
    theme: {
      palette: {
        bg: "#fffbe8",
        surface: "#ffffff",
        text: "#12325c",
        muted: "#5b7aa3",
        accent: "#2563eb",
        accentText: "#ffffff",
      },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
      art: "balloons",
    },
  },
  {
    key: "first-birthday",
    name: "Turning One",
    description: "Soft and sweet, for the birthday nobody remembers but everybody photographs.",
    category: "birthday",
    sortOrder: 320,
    theme: {
      palette: {
        bg: "#fef6f9",
        surface: "#ffffff",
        text: "#4a2b3a",
        muted: "#9c7186",
        accent: "#e8a0b8",
        accentText: "#4a2b3a",
      },
      fonts: { heading: "cormorant", body: "dm-sans" },
      layout: "classic",
      art: "balloons",
    },
  },
  {
    key: "milestone-gold",
    name: "Milestone",
    description: "Black and gold for a birthday with a nought in it.",
    category: "birthday",
    sortOrder: 330,
    theme: {
      palette: {
        bg: "#111111",
        surface: "#1c1c1c",
        text: "#fafafa",
        muted: "#a1a1aa",
        accent: "#d4af37",
        accentText: "#111111",
      },
      fonts: { heading: "playfair", body: "inter" },
      layout: "poster",
      art: "stars",
    },
  },
  {
    key: "retro-disco",
    name: "Retro Disco",
    description: "Purple and teal, unapologetically loud — a themed night.",
    category: "birthday",
    sortOrder: 340,
    theme: {
      palette: {
        bg: "#1a0b2e",
        surface: "#2a1250",
        text: "#f5f3ff",
        muted: "#b3a3d9",
        accent: "#22d3ee",
        accentText: "#1a0b2e",
      },
      fonts: { heading: "space-grotesk", body: "space-grotesk" },
      layout: "poster",
      art: "confetti",
    },
  },

  // --- Festivals & pujas ----------------------------------------------------
  {
    key: "diwali-diyas",
    name: "Diwali Diyas",
    description: "Indigo night and lamplight gold — Diwali dinners and card parties.",
    category: "festival",
    sortOrder: 400,
    theme: {
      palette: {
        bg: "#14123a",
        surface: "#221f52",
        text: "#fff8e7",
        muted: "#b3add9",
        accent: "#f0a500",
        accentText: "#14123a",
      },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "poster",
      art: "diyas",
    },
  },
  {
    key: "holi-colours",
    name: "Holi",
    description: "Pink, yellow and green thrown at the page.",
    category: "festival",
    sortOrder: 410,
    theme: {
      palette: {
        bg: "#fffdf5",
        surface: "#ffffff",
        text: "#2b1a3d",
        muted: "#7a6690",
        accent: "#e11d74",
        accentText: "#ffffff",
      },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
      art: "confetti",
    },
  },
  {
    key: "puja-saffron",
    name: "Puja & Prayer",
    description: "Saffron and maroon, respectful and plain — pujas, havans, satsangs.",
    category: "festival",
    sortOrder: 420,
    theme: {
      palette: {
        bg: "#fff8ee",
        surface: "#ffffff",
        text: "#4a1f14",
        muted: "#8f6350",
        accent: "#a3320b",
        accentText: "#ffffff",
      },
      fonts: { heading: "lora", body: "lora" },
      layout: "classic",
      art: "mandala",
    },
  },

  // --- Housewarming ---------------------------------------------------------
  {
    key: "griha-pravesh",
    name: "Griha Pravesh",
    description: "Terracotta and cream for a new house and its first guests.",
    category: "housewarming",
    sortOrder: 500,
    theme: {
      palette: {
        bg: "#fdf3ea",
        surface: "#ffffff",
        text: "#3f2417",
        muted: "#8b6a54",
        accent: "#b45309",
        accentText: "#ffffff",
      },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "home",
    },
  },
  {
    key: "new-home-minimal",
    name: "New Home",
    description: "Sage and white, quiet and modern — drinks at the new place.",
    category: "housewarming",
    sortOrder: 510,
    theme: {
      palette: {
        bg: "#ffffff",
        surface: "#f4f7f4",
        text: "#1f2d24",
        muted: "#67806f",
        accent: "#3f6b4f",
        accentText: "#ffffff",
      },
      fonts: { heading: "inter", body: "inter" },
      layout: "minimal",
      art: "home",
    },
  },

  // --- Parties & everything social -----------------------------------------
  {
    key: "garden-party",
    name: "Garden Party",
    description: "Warm and botanical — daytime gatherings, brunches and lunches.",
    category: "party",
    sortOrder: 600,
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
      art: "petals",
    },
  },
  {
    key: "midnight",
    name: "Midnight",
    description: "High-contrast dark invitation for evening events and parties.",
    category: "party",
    sortOrder: 610,
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
      art: "stars",
    },
  },
  {
    key: "tropical-punch",
    name: "Tropical",
    description: "Teal and coral — pool parties, terrace evenings, anything with ice in it.",
    category: "party",
    sortOrder: 620,
    theme: {
      palette: {
        bg: "#effbfa",
        surface: "#ffffff",
        text: "#0f3b3a",
        muted: "#5b8a89",
        accent: "#f2643f",
        accentText: "#ffffff",
      },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
      art: "palms",
    },
  },
  {
    key: "cocktail-noir",
    name: "Cocktail Noir",
    description: "Charcoal and amber, grown-up and spare — dinners and drinks.",
    category: "party",
    sortOrder: 630,
    theme: {
      palette: {
        bg: "#1c1917",
        surface: "#292524",
        text: "#fafaf9",
        muted: "#a8a29e",
        accent: "#d97706",
        accentText: "#1c1917",
      },
      fonts: { heading: "playfair", body: "inter" },
      layout: "minimal",
      art: "stripes",
    },
  },

  // --- Work ----------------------------------------------------------------
  {
    key: "minimal-slate",
    name: "Minimal Slate",
    description: "Understated and typographic — dinners, meetups and work events.",
    category: "business",
    sortOrder: 700,
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
      art: "stripes",
    },
  },
  {
    key: "boardroom-blue",
    name: "Boardroom",
    description: "Navy and white — launches, conferences and company evenings.",
    category: "business",
    sortOrder: 710,
    theme: {
      palette: {
        bg: "#f6f8fb",
        surface: "#ffffff",
        text: "#0b1f3a",
        muted: "#5c7290",
        accent: "#1d4ed8",
        accentText: "#ffffff",
      },
      fonts: { heading: "dm-sans", body: "inter" },
      layout: "minimal",
      art: "stripes",
    },
  },

  // --- Anything else --------------------------------------------------------
  {
    key: "photo-first",
    name: "Photo First",
    description: "Full-bleed cover image with the details overlaid.",
    category: "general",
    sortOrder: 900,
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
      art: "plain",
    },
  },
];

// ---------------------------------------------------------------------------
// Card compositions, one per template.
//
// Kept in a map rather than inline in each theme so all twenty-five can be read
// against each other — the point of these is that they *differ*, and that is
// impossible to check when they are three lines apart in twenty-five separate
// objects.
//
// Only what differs from DEFAULT_CARD is listed. Everything omitted is filled
// in by cardSchema's defaults when the stored theme is parsed, so a knob added
// later needs no re-seed to reach templates that don't care about it.
//
// Before this, every template produced an identically composed card: choosing
// "Marigold Mandap" over "Cocktail Noir" changed the palette, the fonts and the
// artwork, and then laid them out exactly the same way. The frame and the
// eyebrow are what make the choice legible on the card itself.
// ---------------------------------------------------------------------------
const CARDS: Record<string, Partial<CardDesign>> = {
  // Wedding — arches, because that is the shape of the stationery this imitates.
  "classic-cream": { frame: "arch", eyebrow: "Together with our families" },
  "marigold-mandap": { frame: "arch", eyebrow: "You are cordially invited" },
  "sangeet-night": { frame: "circle", eyebrow: "Sangeet" },
  "mehendi-green": { frame: "arch", eyebrow: "Mehendi ceremony" },
  "emerald-nikah": { frame: "arch", eyebrow: "Nikah" },
  // The one wedding design whose whole job is the photograph.
  "save-the-date": { frame: "full", overlay: 0.45, eyebrow: "Save the date" },

  // Baby — circles read softer, and these are almost always built around one
  // photograph of one person.
  "baby-pastel": { frame: "circle", eyebrow: "A little one is on the way" },
  "godh-bharai": { frame: "arch", eyebrow: "Godh Bharai" },
  "namkaran-day": { frame: "circle", eyebrow: "Naming ceremony" },

  // Birthday — rounded and loud.
  confetti: { frame: "rounded", eyebrow: "It's a party" },
  "balloon-pop": { frame: "circle", eyebrow: "Come celebrate" },
  "first-birthday": { frame: "circle", eyebrow: "Turning one" },
  "milestone-gold": { frame: "arch", eyebrow: "A milestone birthday" },
  "retro-disco": { frame: "full", overlay: 0.5, eyebrow: "Let's dance" },

  // Festival.
  "diwali-diyas": { frame: "arch", eyebrow: "Diwali celebrations" },
  "holi-colours": { frame: "rounded", eyebrow: "Happy Holi" },
  "puja-saffron": { frame: "arch", eyebrow: "Puja invitation" },

  // Housewarming.
  "griha-pravesh": { frame: "arch", eyebrow: "Griha Pravesh" },
  "new-home-minimal": { frame: "rounded", eyebrow: "We've moved" },

  // Party.
  "garden-party": { frame: "rounded", eyebrow: "Join us" },
  midnight: { frame: "full", overlay: 0.55, eyebrow: "You're invited" },
  "tropical-punch": { frame: "rounded", eyebrow: "Poolside" },
  "cocktail-noir": { frame: "full", overlay: 0.55, eyebrow: "Cocktails" },

  // Business — left-aligned, which is the single change that stops a work
  // invitation reading like a wedding one.
  "minimal-slate": { frame: "rounded", align: "left", eyebrow: "You're invited" },
  "boardroom-blue": { frame: "rounded", align: "left", eyebrow: "Invitation" },

  "photo-first": { frame: "full", overlay: 0.45 },
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed");

const pool = new Pool({ connectionString });
const db = drizzle(pool);

// A template with no entry in CARDS keeps the product defaults rather than
// failing the seed — a missing composition is a design that hasn't been chosen
// yet, not a broken row.
const missingCards = TEMPLATES.filter((t) => !CARDS[t.key]).map((t) => t.key);
if (missingCards.length) {
  console.warn(`No card composition for: ${missingCards.join(", ")} — using defaults.`);
}

for (const t of TEMPLATES) {
  const theme = { ...t.theme, card: CARDS[t.key] };
  await db
    .insert(eventTemplates)
    .values({ ...t, theme, isSystem: true, createdBy: null })
    .onConflictDoUpdate({
      target: eventTemplates.key,
      set: {
        name: t.name,
        description: t.description,
        category: t.category,
        theme,
        sortOrder: t.sortOrder,
      },
    });
}

await pool.end();
console.log(`Seeded ${TEMPLATES.length} templates.`);
