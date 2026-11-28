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
//   · thanksgiving · christmas · newyear · general
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

  // --- Thanksgiving ---------------------------------------------------------
  {
    key: "harvest-table",
    name: "Harvest Table",
    description: "Amber and cream with fallen leaves — Thanksgiving dinners and autumn gatherings.",
    category: "thanksgiving",
    sortOrder: 800,
    theme: {
      palette: {
        bg: "#fdf6ec",
        surface: "#ffffff",
        text: "#4a2e13",
        muted: "#8a6b45",
        accent: "#b5531f",
        accentText: "#ffffff",
      },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "pumpkins",
    },
  },
  {
    key: "giving-thanks",
    name: "Giving Thanks",
    description: "Deep brown and pumpkin, warm by candlelight — the big Thanksgiving table.",
    category: "thanksgiving",
    sortOrder: 810,
    theme: {
      palette: {
        bg: "#3a2213",
        surface: "#4a2e1a",
        text: "#fdf4e8",
        muted: "#d4b48f",
        accent: "#e08a3c",
        accentText: "#3a2213",
      },
      fonts: { heading: "playfair", body: "lora" },
      layout: "poster",
      art: "happy-turkey",
    },
  },

  // --- Christmas ------------------------------------------------------------
  {
    key: "noel-classic",
    name: "Noël",
    description: "Cream, pine and christmas red — the traditional holiday card.",
    category: "christmas",
    sortOrder: 820,
    theme: {
      palette: {
        bg: "#f7f3ec",
        surface: "#ffffff",
        text: "#1f3b2c",
        muted: "#5f7a68",
        accent: "#b01c2e",
        accentText: "#ffffff",
      },
      fonts: { heading: "playfair", body: "lora" },
      layout: "classic",
      art: "pine",
    },
  },
  {
    key: "frosted-pine",
    name: "Frosted Pine",
    description: "Deep evergreen and gold — Christmas dinners and evening parties.",
    category: "christmas",
    sortOrder: 830,
    theme: {
      palette: {
        bg: "#0d2417",
        surface: "#123020",
        text: "#f0faf2",
        muted: "#9fc3ad",
        accent: "#d4af37",
        accentText: "#0d2417",
      },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "poster",
      art: "snowflakes",
    },
  },
  {
    key: "winter-white",
    name: "Winter White",
    description: "Icy blue and silver, clean and quiet — a modern holiday invitation.",
    category: "christmas",
    sortOrder: 840,
    theme: {
      palette: {
        bg: "#f4f8fb",
        surface: "#ffffff",
        text: "#1e2f40",
        muted: "#6b8299",
        accent: "#3a7ca5",
        accentText: "#ffffff",
      },
      fonts: { heading: "inter", body: "inter" },
      layout: "minimal",
      art: "snowflakes",
    },
  },

  // --- New Year -------------------------------------------------------------
  {
    key: "midnight-gold",
    name: "Midnight Gold",
    description: "Black and gold with fireworks — ring in the new year.",
    category: "newyear",
    sortOrder: 850,
    theme: {
      palette: {
        bg: "#0b0b14",
        surface: "#16161f",
        text: "#faf7ef",
        muted: "#a7a295",
        accent: "#d4af37",
        accentText: "#0b0b14",
      },
      fonts: { heading: "playfair", body: "dm-sans" },
      layout: "poster",
      art: "confetti",
    },
  },
  {
    key: "champagne-toast",
    name: "Champagne Toast",
    description: "Deep plum and champagne gold — New Year's Eve drinks and dinners.",
    category: "newyear",
    sortOrder: 860,
    theme: {
      palette: {
        bg: "#1a1424",
        surface: "#271c35",
        text: "#fdf6ff",
        muted: "#c3b0d4",
        accent: "#e8c547",
        accentText: "#1a1424",
      },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
      art: "stars",
    },
  },

  // --- Muse 2026 refresh set (one fresh design per occasion) ----------------
  {
    key: "ivory-arch",
    name: "Ivory Arch",
    description: "Warm ivory and soft gold, romantic and minimal — weddings and engagements.",
    category: "wedding",
    sortOrder: 160,
    theme: {
      palette: { bg: "#faf6f0", surface: "#ffffff", text: "#2e2a26", muted: "#8a7f72", accent: "#b08d57", accentText: "#ffffff" },
      fonts: { heading: "playfair", body: "lora" },
      layout: "classic",
      art: "arched-florals",
    },
  },
  {
    key: "powder-blossom",
    name: "Powder Blossom",
    description: "Soft blush and airy pink — baby showers and welcome-home afternoons.",
    category: "baby",
    sortOrder: 230,
    theme: {
      palette: { bg: "#fdf6f8", surface: "#ffffff", text: "#43303a", muted: "#b08b99", accent: "#e58aa5", accentText: "#ffffff" },
      fonts: { heading: "cormorant", body: "dm-sans" },
      layout: "classic",
      art: "balloon-cluster",
    },
  },
  {
    key: "confetti-pop",
    name: "Confetti Pop",
    description: "Bright coral and cream, joyful but not childish — birthdays.",
    category: "birthday",
    sortOrder: 350,
    theme: {
      palette: { bg: "#fff9f0", surface: "#ffffff", text: "#33272a", muted: "#9c8a90", accent: "#ff5964", accentText: "#ffffff" },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
      art: "tiered-cake",
    },
  },
  {
    key: "marigold-diya",
    name: "Marigold Diya",
    description: "Warm saffron and lamplight, auspicious and elegant — Diwali and pujas.",
    category: "festival",
    sortOrder: 430,
    theme: {
      palette: { bg: "#fff8ec", surface: "#ffffff", text: "#3b2314", muted: "#a67b52", accent: "#e07b00", accentText: "#ffffff" },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "diya-marigold",
    },
  },
  {
    key: "new-door",
    name: "New Door",
    description: "Fresh sage green and white, welcoming and a little botanical — housewarmings.",
    category: "housewarming",
    sortOrder: 520,
    theme: {
      palette: { bg: "#f6f8f2", surface: "#ffffff", text: "#26332a", muted: "#7e8f7c", accent: "#4e7a51", accentText: "#ffffff" },
      fonts: { heading: "cormorant", body: "inter" },
      layout: "classic",
      art: "house-key",
    },
  },
  {
    key: "velvet-hour",
    name: "Velvet Hour",
    description: "Moody plum and orchid, grown-up and sophisticated — cocktail evenings.",
    category: "party",
    sortOrder: 640,
    theme: {
      palette: { bg: "#1c1420", surface: "#2a1f30", text: "#f5eee8", muted: "#a795a8", accent: "#c86dd7", accentText: "#ffffff" },
      fonts: { heading: "playfair", body: "dm-sans" },
      layout: "poster",
      art: "cocktail-coupe",
    },
  },
  {
    key: "slate-signal",
    name: "Slate & Signal",
    description: "Crisp slate and signal blue, confident and modern — launches and work events.",
    category: "business",
    sortOrder: 720,
    theme: {
      palette: { bg: "#f4f5f7", surface: "#ffffff", text: "#16181d", muted: "#6e7480", accent: "#2456e6", accentText: "#ffffff" },
      fonts: { heading: "dm-sans", body: "inter" },
      layout: "minimal",
      art: "sunburst",
    },
  },
  {
    key: "terracotta-harvest",
    name: "Terracotta Harvest",
    description: "Warm terracotta and cream, earthy and abundant — Thanksgiving and autumn.",
    category: "thanksgiving",
    sortOrder: 815,
    theme: {
      palette: { bg: "#fbf3e7", surface: "#ffffff", text: "#3d2c1e", muted: "#a0856b", accent: "#c05621", accentText: "#ffffff" },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "autumn-harvest",
    },
  },
  {
    key: "evergreen-noel",
    name: "Evergreen Noël",
    description: "Pine and cranberry, classic but fresh — Christmas and winter holidays.",
    category: "christmas",
    sortOrder: 845,
    theme: {
      palette: { bg: "#f7f5ef", surface: "#ffffff", text: "#1e2b23", muted: "#71806f", accent: "#a62b25", accentText: "#ffffff" },
      fonts: { heading: "playfair", body: "lora" },
      layout: "classic",
      art: "pine-berry",
    },
  },
  {
    key: "midnight-toast",
    name: "Midnight Toast",
    description: "Ink and gold, luxe and dramatic — New Year, galas and milestone nights.",
    category: "newyear",
    sortOrder: 870,
    theme: {
      palette: { bg: "#10131a", surface: "#1b1f2a", text: "#f2ede3", muted: "#9aa0ae", accent: "#d4af37", accentText: "#10131a" },
      fonts: { heading: "playfair", body: "dm-sans" },
      layout: "poster",
      art: "confetti-arcs",
    },
  },
  {
    key: "paper-plain",
    name: "Paper Plain",
    description: "Clean off-white with a quiet green, versatile — lets photos and words carry it.",
    category: "general",
    sortOrder: 910,
    theme: {
      palette: { bg: "#fafaf8", surface: "#ffffff", text: "#1f1f1f", muted: "#8a8a85", accent: "#3e6b5e", accentText: "#ffffff" },
      fonts: { heading: "inter", body: "inter" },
      layout: "minimal",
      art: "single-stem",
    },
  },

  // --- Muse premium batch (2026) — trend-forward styles --------------------
  {
    key: "gilded-fan",
    name: "Gilded Fan",
    description: "Art-deco navy and gold, 1920s glamour — weddings and anniversaries.",
    category: "wedding",
    sortOrder: 170,
    theme: {
      palette: { bg: "#0f1e2e", surface: "#17304a", text: "#f3e9d2", muted: "#8fa3b5", accent: "#c9a227", accentText: "#0f1e2e" },
      fonts: { heading: "playfair", body: "dm-sans" },
      layout: "poster",
      art: "deco-fan",
    },
  },
  {
    key: "bazaar-riot",
    name: "Bazaar Riot",
    description: "Bold maximalist pinks and pops, joyful excess — big birthdays and Holi.",
    category: "birthday",
    sortOrder: 360,
    theme: {
      palette: { bg: "#fff3e2", surface: "#ffffff", text: "#2b1035", muted: "#9b7eb8", accent: "#ff2e88", accentText: "#ffffff" },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
      art: "pattern-band",
    },
  },
  {
    key: "washed-garden",
    name: "Washed Garden",
    description: "Soft painterly sage, watercolour calm — showers and spring parties.",
    category: "baby",
    sortOrder: 240,
    theme: {
      palette: { bg: "#fbf8f3", surface: "#ffffff", text: "#37413a", muted: "#9db09d", accent: "#7fa88c", accentText: "#ffffff" },
      fonts: { heading: "cormorant", body: "lora" },
      layout: "classic",
      art: "wash-blooms",
    },
  },
  {
    key: "diner-62",
    name: "Diner '62",
    description: "Mid-century coral and cream, retro Americana — casual birthdays and parties.",
    category: "party",
    sortOrder: 650,
    theme: {
      palette: { bg: "#fbf0dc", surface: "#ffffff", text: "#33302a", muted: "#a3906c", accent: "#d94f30", accentText: "#ffffff" },
      fonts: { heading: "space-grotesk", body: "dm-sans" },
      layout: "poster",
      art: "starburst-boomerang",
    },
  },
  {
    key: "champagne-foil",
    name: "Champagne Foil",
    description: "Black-tie shimmer, ink and gold — New Year, engagements and milestones.",
    category: "newyear",
    sortOrder: 880,
    theme: {
      palette: { bg: "#17140f", surface: "#221e17", text: "#f5efe2", muted: "#9c8f78", accent: "#d9b45b", accentText: "#17140f" },
      fonts: { heading: "playfair", body: "lora" },
      layout: "poster",
      art: "foil-laurel",
    },
  },
  {
    key: "mono-noire",
    name: "Mono Noire",
    description: "One colour, all restraint — minimalist corporate and modern weddings.",
    category: "business",
    sortOrder: 730,
    theme: {
      palette: { bg: "#ffffff", surface: "#f4f4f4", text: "#111111", muted: "#8c8c8c", accent: "#111111", accentText: "#ffffff" },
      fonts: { heading: "inter", body: "inter" },
      layout: "minimal",
      art: "mono-rule",
    },
  },
  {
    key: "bauhaus-block",
    name: "Bauhaus Block",
    description: "Primary-colour geometry, confident — launches and modern birthdays.",
    category: "business",
    sortOrder: 740,
    theme: {
      palette: { bg: "#f7f3ea", surface: "#ffffff", text: "#191919", muted: "#8e887b", accent: "#d0342c", accentText: "#ffffff" },
      fonts: { heading: "space-grotesk", body: "inter" },
      layout: "minimal",
      art: "bauhaus-shapes",
    },
  },
  {
    key: "ink-margin",
    name: "Ink & Margin",
    description: "Hand-drawn warmth in ink and cream — casual parties, thank-yous.",
    category: "general",
    sortOrder: 920,
    theme: {
      palette: { bg: "#fdfbf5", surface: "#ffffff", text: "#2a2620", muted: "#a79c8a", accent: "#c96f2e", accentText: "#ffffff" },
      fonts: { heading: "cormorant", body: "inter" },
      layout: "classic",
      art: "sketch-wreath",
    },
  },

  // --- Muse batch 2 (2026): 4 more per occasion, reusing existing artworks ---
  { key: "blush-peony-court", name: "Blush Peony Court", description: "Romantic garden blush — weddings and engagements.", category: "wedding", sortOrder: 162, theme: { palette: { bg: "#fdf1ec", surface: "#ffffff", text: "#402e32", muted: "#b08d94", accent: "#c4576e", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "arched-florals" } },
  { key: "coastal-vow", name: "Coastal Vow", description: "Seaside blues, airy and calm — destination weddings.", category: "wedding", sortOrder: 164, theme: { palette: { bg: "#eef4f6", surface: "#ffffff", text: "#22333b", muted: "#7e97a3", accent: "#3e7cb1", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "confetti-arcs" } },
  { key: "emerald-vow", name: "Emerald Vow", description: "Dark botanical luxe — evening weddings.", category: "wedding", sortOrder: 166, theme: { palette: { bg: "#12291f", surface: "#1b3a2c", text: "#f1ebdd", muted: "#93ac9c", accent: "#d9c27a", accentText: "#12291f" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "palms" } },
  { key: "pearl-rings", name: "Pearl Rings", description: "Ultra-minimal, two interlocking rings — modern weddings.", category: "wedding", sortOrder: 168, theme: { palette: { bg: "#f7f4ef", surface: "#ffffff", text: "#2b2620", muted: "#a79e90", accent: "#6e6259", accentText: "#ffffff" }, fonts: { heading: "playfair", body: "inter" }, layout: "minimal", art: "rings" } },
  { key: "sky-crib", name: "Sky Crib", description: "Soft sky blue with clouds — baby showers.", category: "baby", sortOrder: 232, theme: { palette: { bg: "#eff6fb", surface: "#ffffff", text: "#2c3e50", muted: "#93aec2", accent: "#5b8def", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "dm-sans" }, layout: "classic", art: "stars" } },
  { key: "honey-cub", name: "Honey Cub", description: "Warm honey, gender-neutral — baby showers.", category: "baby", sortOrder: 234, theme: { palette: { bg: "#fff7e6", surface: "#ffffff", text: "#4a3419", muted: "#b99b5f", accent: "#e8a020", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "dm-sans" }, layout: "classic", art: "balloon-cluster" } },
  { key: "lilac-lullaby", name: "Lilac Lullaby", description: "Dreamy lilac evening — baby showers.", category: "baby", sortOrder: 236, theme: { palette: { bg: "#f5f1fa", surface: "#ffffff", text: "#372b47", muted: "#a493c4", accent: "#8b6cc9", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "stars" } },
  { key: "sage-sprout", name: "Sage Sprout", description: "Botanical sage neutral — baby showers.", category: "baby", sortOrder: 238, theme: { palette: { bg: "#f4f7ee", surface: "#ffffff", text: "#2f3b26", muted: "#93a583", accent: "#6e9153", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "single-stem" } },
  { key: "neon-arcade", name: "Neon Arcade", description: "Dark neon, teen/gamer — birthdays.", category: "birthday", sortOrder: 352, theme: { palette: { bg: "#0d0d17", surface: "#171726", text: "#f2f2fa", muted: "#8b8ba7", accent: "#00e5ff", accentText: "#0d0d17" }, fonts: { heading: "space-grotesk", body: "space-grotesk" }, layout: "poster", art: "confetti" } },
  { key: "pastel-sorbet", name: "Pastel Sorbet", description: "Soft ice-cream pastels — birthdays.", category: "birthday", sortOrder: 354, theme: { palette: { bg: "#fff6f1", surface: "#ffffff", text: "#4a3038", muted: "#c09aa4", accent: "#ff8fa3", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "dm-sans" }, layout: "poster", art: "tiered-cake" } },
  { key: "copper-milestone", name: "Copper Milestone", description: "Copper luxe for a milestone — 30th/40th/50th.", category: "birthday", sortOrder: 356, theme: { palette: { bg: "#fbf3ee", surface: "#ffffff", text: "#3a2a26", muted: "#b08d7e", accent: "#b76e58", accentText: "#ffffff" }, fonts: { heading: "playfair", body: "inter" }, layout: "poster", art: "sunburst" } },
  { key: "jungle-roar", name: "Jungle Roar", description: "Kids' safari greens — birthdays.", category: "birthday", sortOrder: 358, theme: { palette: { bg: "#f3f8ec", surface: "#ffffff", text: "#2e4023", muted: "#8ca87e", accent: "#e07b39", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "dm-sans" }, layout: "poster", art: "palms" } },
  { key: "holi-splash", name: "Holi Splash", description: "Powder-splash colour joy — Holi.", category: "festival", sortOrder: 432, theme: { palette: { bg: "#fff9f5", surface: "#ffffff", text: "#33202e", muted: "#b08ca0", accent: "#e63e8e", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "dm-sans" }, layout: "poster", art: "confetti" } },
  { key: "lotus-puja", name: "Lotus Puja", description: "Serene lotus and water rings — pujas.", category: "festival", sortOrder: 434, theme: { palette: { bg: "#fbf4ea", surface: "#ffffff", text: "#3a2a1a", muted: "#b09468", accent: "#9c3d54", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "mandala" } },
  { key: "peacock-pride", name: "Peacock Pride", description: "Rich teal and peacock — festive pujas.", category: "festival", sortOrder: 436, theme: { palette: { bg: "#0e2a30", surface: "#16404a", text: "#f2ecdc", muted: "#7fa3a8", accent: "#2fbf9b", accentText: "#0e2a30" }, fonts: { heading: "cormorant", body: "lora" }, layout: "poster", art: "mandala" } },
  { key: "lantern-night", name: "Lantern Night", description: "Diwali night with lanterns — festivals.", category: "festival", sortOrder: 438, theme: { palette: { bg: "#191430", surface: "#241d47", text: "#f4edda", muted: "#9a90c2", accent: "#ffb93e", accentText: "#191430" }, fonts: { heading: "cormorant", body: "lora" }, layout: "poster", art: "diyas" } },
  { key: "brick-ivy", name: "Brick & Ivy", description: "Warm traditional brick and ivy — housewarmings.", category: "housewarming", sortOrder: 522, theme: { palette: { bg: "#faf1ea", surface: "#ffffff", text: "#3b2620", muted: "#b08a76", accent: "#b5502f", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "house-key" } },
  { key: "hygge-hearth", name: "Hygge Hearth", description: "Scandinavian calm — housewarmings.", category: "housewarming", sortOrder: 524, theme: { palette: { bg: "#f5f3ef", surface: "#ffffff", text: "#2e2c29", muted: "#a8a29a", accent: "#7a8b99", accentText: "#ffffff" }, fonts: { heading: "inter", body: "inter" }, layout: "minimal", art: "home" } },
  { key: "sunroom-brunch", name: "Sunroom Brunch", description: "Sunny daytime welcome — housewarmings.", category: "housewarming", sortOrder: 526, theme: { palette: { bg: "#fff9e8", surface: "#ffffff", text: "#3d3418", muted: "#b3a05e", accent: "#e3a008", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "sunburst" } },
  { key: "midnight-move-in", name: "Midnight Move-In", description: "Evening housewarming party — lit windows.", category: "housewarming", sortOrder: 528, theme: { palette: { bg: "#141c2a", surface: "#1f2a3d", text: "#f0ede4", muted: "#8e9bb0", accent: "#e8b54d", accentText: "#141c2a" }, fonts: { heading: "playfair", body: "dm-sans" }, layout: "poster", art: "home" } },
  { key: "disco-fever", name: "Disco Fever", description: "Retro dance neon — parties.", category: "party", sortOrder: 642, theme: { palette: { bg: "#160e24", surface: "#221538", text: "#f7f1ff", muted: "#9e8fc4", accent: "#ff4fd8", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "dm-sans" }, layout: "poster", art: "confetti" } },
  { key: "aperitivo", name: "Aperitivo", description: "Italian summer spritz — parties.", category: "party", sortOrder: 644, theme: { palette: { bg: "#fff4e8", surface: "#ffffff", text: "#40260f", muted: "#c09368", accent: "#f06423", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "cocktail-coupe" } },
  { key: "garden-soiree", name: "Garden Soirée", description: "Outdoor evening with string lights — parties.", category: "party", sortOrder: 646, theme: { palette: { bg: "#f3f6ec", surface: "#ffffff", text: "#2c3a24", muted: "#8a9b7c", accent: "#5c7a3e", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "petals" } },
  { key: "martini-mono", name: "Martini Mono", description: "Black-and-white chic — cocktail parties.", category: "party", sortOrder: 648, theme: { palette: { bg: "#101010", surface: "#1c1c1c", text: "#f5f5f2", muted: "#8f8f8f", accent: "#e8e4d8", accentText: "#101010" }, fonts: { heading: "inter", body: "inter" }, layout: "minimal", art: "cocktail-coupe" } },
  { key: "forest-boardroom", name: "Forest Boardroom", description: "Deep-green professional — corporate events.", category: "business", sortOrder: 722, theme: { palette: { bg: "#f2f5f1", surface: "#ffffff", text: "#1d2a20", muted: "#7c8b7e", accent: "#1f5c3d", accentText: "#ffffff" }, fonts: { heading: "dm-sans", body: "inter" }, layout: "minimal", art: "stripes" } },
  { key: "coral-launch", name: "Coral Launch", description: "Startup energy — launches.", category: "business", sortOrder: 724, theme: { palette: { bg: "#fff5f0", surface: "#ffffff", text: "#33231d", muted: "#b08d7f", accent: "#ff5a3c", accentText: "#ffffff" }, fonts: { heading: "dm-sans", body: "inter" }, layout: "minimal", art: "sunburst" } },
  { key: "violet-circuit", name: "Violet Circuit", description: "Tech enterprise violet — conferences.", category: "business", sortOrder: 726, theme: { palette: { bg: "#f1effa", surface: "#ffffff", text: "#1b2140", muted: "#8e86b8", accent: "#6c3fd4", accentText: "#ffffff" }, fonts: { heading: "dm-sans", body: "inter" }, layout: "minimal", art: "stripes" } },
  { key: "sandstone-studio", name: "Sandstone Studio", description: "Creative agency warmth — studio events.", category: "business", sortOrder: 728, theme: { palette: { bg: "#f8f2e9", surface: "#ffffff", text: "#2e2822", muted: "#a99b87", accent: "#c77b3f", accentText: "#ffffff" }, fonts: { heading: "dm-sans", body: "inter" }, layout: "minimal", art: "arched-florals" } },
  { key: "cranberry-table", name: "Cranberry Table", description: "Classic cranberry dinner — Thanksgiving.", category: "thanksgiving", sortOrder: 802, theme: { palette: { bg: "#fbf2ee", surface: "#ffffff", text: "#3e2126", muted: "#b0838a", accent: "#9e2b3b", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "autumn-harvest" } },
  { key: "forest-gathering", name: "Forest Gathering", description: "Dark woodland harvest — Thanksgiving.", category: "thanksgiving", sortOrder: 804, theme: { palette: { bg: "#1e2b22", surface: "#2a3a2e", text: "#f3eddd", muted: "#97a892", accent: "#d9a441", accentText: "#1e2b22" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "autumn-harvest" } },
  { key: "plaid-hearth", name: "Plaid Hearth", description: "Rustic cosy plaid — Thanksgiving.", category: "thanksgiving", sortOrder: 806, theme: { palette: { bg: "#fdf6ec", surface: "#ffffff", text: "#2f2a20", muted: "#9c8f74", accent: "#8c5a2b", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "pumpkins" } },
  { key: "golden-wheat", name: "Golden Wheat", description: "Harvest minimal — Thanksgiving.", category: "thanksgiving", sortOrder: 808, theme: { palette: { bg: "#fbf6e9", surface: "#ffffff", text: "#3a2f16", muted: "#b3a06b", accent: "#c9920e", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "autumn-harvest" } },
  { key: "nordic-jul", name: "Nordic Jul", description: "Scandinavian Christmas — holidays.", category: "christmas", sortOrder: 822, theme: { palette: { bg: "#fbf7f0", surface: "#ffffff", text: "#2e2a26", muted: "#a79b8c", accent: "#c8102e", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "lora" }, layout: "classic", art: "snowflakes" } },
  { key: "midnight-mass", name: "Midnight Mass", description: "Navy and gold luxe — Christmas.", category: "christmas", sortOrder: 824, theme: { palette: { bg: "#10182b", surface: "#1a2440", text: "#f4eedd", muted: "#8e9bb8", accent: "#d4af37", accentText: "#10182b" }, fonts: { heading: "playfair", body: "lora" }, layout: "poster", art: "pine-berry" } },
  { key: "peppermint-lane", name: "Peppermint Lane", description: "Playful candy-cane family — Christmas.", category: "christmas", sortOrder: 826, theme: { palette: { bg: "#fff7f7", surface: "#ffffff", text: "#3a2226", muted: "#c09aa0", accent: "#e0344a", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "dm-sans" }, layout: "poster", art: "snowflakes" } },
  { key: "frosted-sage", name: "Frosted Sage", description: "Modern muted eucalyptus — Christmas.", category: "christmas", sortOrder: 828, theme: { palette: { bg: "#f2f5f1", surface: "#ffffff", text: "#26332b", muted: "#93a695", accent: "#5f7d63", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "inter" }, layout: "classic", art: "sketch-wreath" } },
  { key: "silver-city", name: "Silver City", description: "Silver skyline fireworks — New Year.", category: "newyear", sortOrder: 852, theme: { palette: { bg: "#14161c", surface: "#1f232e", text: "#f2f3f7", muted: "#9aa1b1", accent: "#c7ceda", accentText: "#14161c" }, fonts: { heading: "playfair", body: "dm-sans" }, layout: "poster", art: "confetti-arcs" } },
  { key: "rose-countdown", name: "Rose Countdown", description: "Blush midnight countdown — New Year.", category: "newyear", sortOrder: 854, theme: { palette: { bg: "#fbf0ee", surface: "#ffffff", text: "#3b2723", muted: "#b98f83", accent: "#c96f5a", accentText: "#ffffff" }, fonts: { heading: "cormorant", body: "dm-sans" }, layout: "poster", art: "balloon-cluster" } },
  { key: "emerald-gala", name: "Emerald Gala", description: "Black-tie green gala — New Year.", category: "newyear", sortOrder: 856, theme: { palette: { bg: "#0e241c", surface: "#17382c", text: "#f2eddc", muted: "#8faf9d", accent: "#d9b45b", accentText: "#0e241c" }, fonts: { heading: "playfair", body: "lora" }, layout: "poster", art: "foil-laurel" } },
  { key: "violet-pop", name: "Violet Pop", description: "Bright modern party horn — New Year.", category: "newyear", sortOrder: 858, theme: { palette: { bg: "#ffffff", surface: "#f7f7f7", text: "#1e1e24", muted: "#8e8e99", accent: "#6c3fd4", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "dm-sans" }, layout: "poster", art: "confetti" } },
  { key: "terrazzo", name: "Terrazzo", description: "Playful terrazzo neutral — all-purpose.", category: "general", sortOrder: 912, theme: { palette: { bg: "#faf7f2", surface: "#ffffff", text: "#2c2a26", muted: "#a79e91", accent: "#c96f4a", accentText: "#ffffff" }, fonts: { heading: "space-grotesk", body: "inter" }, layout: "minimal", art: "confetti" } },
  { key: "denim-daisy", name: "Denim & Daisy", description: "Casual friendly daisies — all-purpose.", category: "general", sortOrder: 914, theme: { palette: { bg: "#eff3f9", surface: "#ffffff", text: "#26314a", muted: "#8b9bb8", accent: "#e9b10c", accentText: "#26314a" }, fonts: { heading: "dm-sans", body: "inter" }, layout: "minimal", art: "arched-florals" } },
  { key: "charcoal-sketch", name: "Charcoal Sketch", description: "Moody dark all-rounder — anything.", category: "general", sortOrder: 916, theme: { palette: { bg: "#1d1d1f", surface: "#29292c", text: "#f2f1ec", muted: "#9b9b96", accent: "#e0b34c", accentText: "#1d1d1f" }, fonts: { heading: "playfair", body: "inter" }, layout: "minimal", art: "single-stem" } },
  { key: "rainbow-neutral", name: "Rainbow Neutral", description: "Soft universal rainbow — all-purpose.", category: "general", sortOrder: 918, theme: { palette: { bg: "#fbf9f6", surface: "#ffffff", text: "#33302b", muted: "#a89f93", accent: "#7c6bb0", accentText: "#ffffff" }, fonts: { heading: "inter", body: "inter" }, layout: "minimal", art: "confetti-arcs" } },

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

  // Thanksgiving — warm and gathered.
  "harvest-table": { frame: "arch", eyebrow: "Gather with us" },
  "giving-thanks": { frame: "arch", eyebrow: "Thanksgiving dinner" },

  // Christmas.
  "noel-classic": { frame: "arch", eyebrow: "Merry Christmas" },
  "frosted-pine": { frame: "arch", eyebrow: "Christmas celebrations" },
  "winter-white": { frame: "rounded", eyebrow: "You're invited" },

  // New Year — rounded and loud.
  "midnight-gold": { frame: "circle", eyebrow: "Ring in the new year" },
  "champagne-toast": { frame: "rounded", eyebrow: "New Year's Eve" },

  // Muse 2026 refresh set.
  "ivory-arch": { frame: "arch", eyebrow: "Together with our families" },
  "powder-blossom": { frame: "circle", eyebrow: "A little one is on the way" },
  "confetti-pop": { frame: "rounded", eyebrow: "It's a party" },
  "marigold-diya": { frame: "arch", eyebrow: "You're invited" },
  "new-door": { frame: "rounded", eyebrow: "We've moved" },
  "velvet-hour": { frame: "rounded", eyebrow: "Cocktails" },
  "slate-signal": { frame: "rounded", align: "left", eyebrow: "You're invited" },
  "terracotta-harvest": { frame: "arch", eyebrow: "Gather with us" },
  "evergreen-noel": { frame: "arch", eyebrow: "Merry Christmas" },
  "midnight-toast": { frame: "circle", eyebrow: "Ring in the new year" },
  "paper-plain": { frame: "rounded", align: "left", eyebrow: "You're invited" },

  // Muse premium batch.
  "gilded-fan": { frame: "arch", eyebrow: "You're invited" },
  "bazaar-riot": { frame: "rounded", eyebrow: "Let's celebrate" },
  "washed-garden": { frame: "arch", eyebrow: "Join us" },
  "diner-62": { frame: "rounded", eyebrow: "Come party" },
  "champagne-foil": { frame: "circle", eyebrow: "Black tie" },
  "mono-noire": { frame: "rounded", align: "left", eyebrow: "Invitation" },
  "bauhaus-block": { frame: "rounded", align: "left", eyebrow: "Invitation" },
  "ink-margin": { frame: "rounded", eyebrow: "You're invited" },

  // Muse batch 2.
  "blush-peony-court": { frame: "arch", eyebrow: "Together with our families" },
  "coastal-vow": { frame: "arch", eyebrow: "Save the date" },
  "emerald-vow": { frame: "arch", eyebrow: "Together with our families" },
  "pearl-rings": { frame: "rounded", align: "left", eyebrow: "You're invited" },
  "sky-crib": { frame: "circle", eyebrow: "A little one is on the way" },
  "honey-cub": { frame: "circle", eyebrow: "A little one is on the way" },
  "lilac-lullaby": { frame: "circle", eyebrow: "A little one is on the way" },
  "sage-sprout": { frame: "arch", eyebrow: "Join us" },
  "neon-arcade": { frame: "rounded", eyebrow: "It's a party" },
  "pastel-sorbet": { frame: "rounded", eyebrow: "It's a party" },
  "copper-milestone": { frame: "arch", eyebrow: "A milestone" },
  "jungle-roar": { frame: "rounded", eyebrow: "Come celebrate" },
  "holi-splash": { frame: "rounded", eyebrow: "Happy Holi" },
  "lotus-puja": { frame: "arch", eyebrow: "Puja invitation" },
  "peacock-pride": { frame: "arch", eyebrow: "You're invited" },
  "lantern-night": { frame: "arch", eyebrow: "Diwali celebrations" },
  "brick-ivy": { frame: "arch", eyebrow: "We've moved" },
  "hygge-hearth": { frame: "rounded", eyebrow: "We've moved" },
  "sunroom-brunch": { frame: "rounded", eyebrow: "Join us" },
  "midnight-move-in": { frame: "rounded", eyebrow: "Housewarming" },
  "disco-fever": { frame: "rounded", eyebrow: "Let's dance" },
  "aperitivo": { frame: "rounded", eyebrow: "Drinks" },
  "garden-soiree": { frame: "arch", eyebrow: "Join us" },
  "martini-mono": { frame: "rounded", align: "left", eyebrow: "Cocktails" },
  "forest-boardroom": { frame: "rounded", align: "left", eyebrow: "Invitation" },
  "coral-launch": { frame: "rounded", align: "left", eyebrow: "You're invited" },
  "violet-circuit": { frame: "rounded", align: "left", eyebrow: "Invitation" },
  "sandstone-studio": { frame: "rounded", align: "left", eyebrow: "You're invited" },
  "cranberry-table": { frame: "arch", eyebrow: "Gather with us" },
  "forest-gathering": { frame: "arch", eyebrow: "Gather with us" },
  "plaid-hearth": { frame: "rounded", eyebrow: "Gather with us" },
  "golden-wheat": { frame: "arch", eyebrow: "Give thanks" },
  "nordic-jul": { frame: "arch", eyebrow: "Merry Christmas" },
  "midnight-mass": { frame: "arch", eyebrow: "Merry Christmas" },
  "peppermint-lane": { frame: "rounded", eyebrow: "Merry Christmas" },
  "frosted-sage": { frame: "arch", eyebrow: "Season's greetings" },
  "silver-city": { frame: "circle", eyebrow: "Ring in the new year" },
  "rose-countdown": { frame: "circle", eyebrow: "New Year's Eve" },
  "emerald-gala": { frame: "circle", eyebrow: "Black tie" },
  "violet-pop": { frame: "rounded", eyebrow: "Ring in the new year" },
  "terrazzo": { frame: "rounded", eyebrow: "You're invited" },
  "denim-daisy": { frame: "rounded", eyebrow: "You're invited" },
  "charcoal-sketch": { frame: "rounded", align: "left", eyebrow: "You're invited" },
  "rainbow-neutral": { frame: "rounded", eyebrow: "You're invited" },

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
