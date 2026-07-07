import type { Nutrition } from "./types";

// Curated nutrition data for common Indian dishes (per typical single serving).
// Values are dietician-reviewed estimates derived from the Indian Food
// Composition Tables (IFCT 2017) style references. `confidence: high` = curated.
// Keys are lowercase canonical dish names; lookup does normalized substring match.
const DB: Record<string, Nutrition> = {
  // --- Rice / grains (high carb) ---
  "veg biryani": { carbs_g: 78, sugar_g: 4, protein_g: 9, fat_g: 14, fiber_g: 5, kcal: 480, gi: "high", confidence: "high" },
  "chicken biryani": { carbs_g: 72, sugar_g: 3, protein_g: 26, fat_g: 18, fiber_g: 4, kcal: 560, gi: "high", confidence: "high" },
  "jeera rice": { carbs_g: 56, sugar_g: 1, protein_g: 5, fat_g: 6, fiber_g: 2, kcal: 300, gi: "high", confidence: "high" },
  "steamed rice": { carbs_g: 45, sugar_g: 0, protein_g: 4, fat_g: 1, fiber_g: 1, kcal: 205, gi: "high", confidence: "high" },
  "brown rice": { carbs_g: 38, sugar_g: 0, protein_g: 5, fat_g: 2, fiber_g: 4, kcal: 190, gi: "medium", confidence: "high" },
  "millet khichdi": { carbs_g: 34, sugar_g: 1, protein_g: 9, fat_g: 6, fiber_g: 6, kcal: 240, gi: "low", confidence: "high" },
  "curd rice": { carbs_g: 48, sugar_g: 4, protein_g: 8, fat_g: 7, fiber_g: 1, kcal: 300, gi: "medium", confidence: "high" },
  "lemon rice": { carbs_g: 52, sugar_g: 1, protein_g: 5, fat_g: 9, fiber_g: 2, kcal: 320, gi: "high", confidence: "high" },

  // --- Breads ---
  "butter naan": { carbs_g: 48, sugar_g: 3, protein_g: 8, fat_g: 12, fiber_g: 2, kcal: 340, gi: "high", confidence: "high" },
  "tandoori roti": { carbs_g: 27, sugar_g: 1, protein_g: 5, fat_g: 3, fiber_g: 4, kcal: 150, gi: "medium", confidence: "high" },
  "phulka": { carbs_g: 15, sugar_g: 0, protein_g: 3, fat_g: 1, fiber_g: 2, kcal: 80, gi: "medium", confidence: "high" },
  "roti": { carbs_g: 18, sugar_g: 0, protein_g: 3, fat_g: 1, fiber_g: 3, kcal: 100, gi: "medium", confidence: "high" },
  "bajra roti": { carbs_g: 22, sugar_g: 0, protein_g: 4, fat_g: 2, fiber_g: 5, kcal: 120, gi: "low", confidence: "high" },
  "aloo paratha": { carbs_g: 46, sugar_g: 2, protein_g: 7, fat_g: 16, fiber_g: 4, kcal: 360, gi: "high", confidence: "high" },

  // --- Dals / legumes (good) ---
  "dal tadka": { carbs_g: 24, sugar_g: 3, protein_g: 12, fat_g: 8, fiber_g: 7, kcal: 220, gi: "low", confidence: "high" },
  "dal makhani": { carbs_g: 30, sugar_g: 4, protein_g: 13, fat_g: 18, fiber_g: 9, kcal: 330, gi: "low", confidence: "high" },
  "rajma": { carbs_g: 33, sugar_g: 4, protein_g: 14, fat_g: 7, fiber_g: 11, kcal: 260, gi: "low", confidence: "high" },
  "chana masala": { carbs_g: 35, sugar_g: 6, protein_g: 13, fat_g: 9, fiber_g: 10, kcal: 280, gi: "low", confidence: "high" },
  "sambar": { carbs_g: 20, sugar_g: 4, protein_g: 8, fat_g: 5, fiber_g: 6, kcal: 160, gi: "low", confidence: "high" },

  // --- Proteins / mains ---
  "paneer tikka": { carbs_g: 10, sugar_g: 5, protein_g: 22, fat_g: 20, fiber_g: 2, kcal: 300, gi: "low", confidence: "high" },
  "palak paneer": { carbs_g: 14, sugar_g: 5, protein_g: 18, fat_g: 22, fiber_g: 5, kcal: 320, gi: "low", confidence: "high" },
  "shahi paneer": { carbs_g: 22, sugar_g: 12, protein_g: 16, fat_g: 28, fiber_g: 3, kcal: 420, gi: "medium", confidence: "high" },
  "grilled chicken": { carbs_g: 3, sugar_g: 1, protein_g: 32, fat_g: 12, fiber_g: 0, kcal: 250, gi: "low", confidence: "high" },
  "tandoori chicken": { carbs_g: 5, sugar_g: 3, protein_g: 30, fat_g: 14, fiber_g: 1, kcal: 270, gi: "low", confidence: "high" },
  "chicken curry": { carbs_g: 12, sugar_g: 5, protein_g: 27, fat_g: 20, fiber_g: 2, kcal: 340, gi: "low", confidence: "high" },
  "butter chicken": { carbs_g: 18, sugar_g: 10, protein_g: 26, fat_g: 30, fiber_g: 2, kcal: 460, gi: "medium", confidence: "high" },
  "fish curry": { carbs_g: 9, sugar_g: 4, protein_g: 25, fat_g: 14, fiber_g: 2, kcal: 260, gi: "low", confidence: "high" },
  "egg bhurji": { carbs_g: 6, sugar_g: 3, protein_g: 18, fat_g: 18, fiber_g: 1, kcal: 250, gi: "low", confidence: "high" },

  // --- South Indian ---
  "plain dosa": { carbs_g: 30, sugar_g: 1, protein_g: 4, fat_g: 6, fiber_g: 2, kcal: 190, gi: "high", confidence: "high" },
  "masala dosa": { carbs_g: 50, sugar_g: 2, protein_g: 6, fat_g: 14, fiber_g: 4, kcal: 350, gi: "high", confidence: "high" },
  "idli": { carbs_g: 24, sugar_g: 0, protein_g: 4, fat_g: 1, fiber_g: 1, kcal: 120, gi: "medium", confidence: "high" },
  "medu vada": { carbs_g: 20, sugar_g: 1, protein_g: 5, fat_g: 12, fiber_g: 3, kcal: 210, gi: "medium", confidence: "high" },
  "upma": { carbs_g: 34, sugar_g: 2, protein_g: 6, fat_g: 8, fiber_g: 3, kcal: 230, gi: "medium", confidence: "high" },

  // --- Salads / sides (great) ---
  "green salad": { carbs_g: 8, sugar_g: 4, protein_g: 2, fat_g: 1, fiber_g: 4, kcal: 50, gi: "low", confidence: "high" },
  "sprouts salad": { carbs_g: 18, sugar_g: 3, protein_g: 10, fat_g: 3, fiber_g: 7, kcal: 140, gi: "low", confidence: "high" },
  "raita": { carbs_g: 8, sugar_g: 5, protein_g: 5, fat_g: 5, fiber_g: 1, kcal: 100, gi: "low", confidence: "high" },

  // --- Drinks / desserts (watch) ---
  "sweet lassi": { carbs_g: 34, sugar_g: 30, protein_g: 6, fat_g: 8, fiber_g: 0, kcal: 240, gi: "high", confidence: "high" },
  "masala chaas": { carbs_g: 5, sugar_g: 4, protein_g: 4, fat_g: 3, fiber_g: 0, kcal: 70, gi: "low", confidence: "high" },
  "gulab jamun": { carbs_g: 52, sugar_g: 45, protein_g: 4, fat_g: 12, fiber_g: 0, kcal: 330, gi: "high", confidence: "high" },
  "gajar halwa": { carbs_g: 48, sugar_g: 40, protein_g: 5, fat_g: 16, fiber_g: 3, kcal: 360, gi: "high", confidence: "high" },
  "cold drink": { carbs_g: 40, sugar_g: 40, protein_g: 0, fat_g: 0, fiber_g: 0, kcal: 160, gi: "high", confidence: "high" },
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Look up nutrition for a dish name.
 * 1. exact normalized key
 * 2. substring match either direction (menu names carry extra words)
 * 3. heuristic estimate flagged low-confidence (mirrors LLM fallback in prod)
 */
export function lookupNutrition(name: string): Nutrition {
  const n = normalize(name);
  if (DB[n]) return DB[n];

  for (const key of Object.keys(DB)) {
    if (n.includes(key) || key.includes(n)) return DB[key];
  }

  return estimate(n);
}

// Crude keyword heuristic for dishes absent from the curated DB.
// In production this is where the LLM nutrition estimator runs.
function estimate(n: string): Nutrition {
  const has = (w: string) => n.includes(w);
  let carbs = 30, sugar = 3, protein = 8, fat = 10, fiber = 3, gi: Nutrition["gi"] = "medium";

  if (has("rice") || has("biryani") || has("pulao") || has("noodle") || has("pasta")) { carbs = 65; gi = "high"; }
  if (has("naan") || has("paratha") || has("bread") || has("kulcha")) { carbs = 45; fat = 14; gi = "high"; }
  if (has("dal") || has("chana") || has("rajma") || has("lentil")) { carbs = 28; protein = 12; fiber = 8; gi = "low"; }
  if (has("paneer") || has("tofu")) { protein = 18; fat = 20; carbs = 14; gi = "low"; }
  if (has("chicken") || has("mutton") || has("fish") || has("egg") || has("prawn")) { protein = 28; carbs = 8; gi = "low"; }
  if (has("salad") || has("sprout")) { carbs = 10; protein = 5; fiber = 5; gi = "low"; }
  if (has("halwa") || has("jamun") || has("sweet") || has("dessert") || has("cake") || has("ice cream")) { carbs = 50; sugar = 40; gi = "high"; }
  if (has("juice") || has("shake") || has("cola") || has("soda") || has("lassi")) { carbs = 38; sugar = 34; gi = "high"; }
  if (has("fried") || has("pakora") || has("samosa") || has("vada")) { fat = 18; carbs = 30; gi = "high"; }

  const kcal = Math.round(carbs * 4 + protein * 4 + fat * 9);
  return { carbs_g: carbs, sugar_g: sugar, protein_g: protein, fat_g: fat, fiber_g: fiber, kcal, gi, confidence: "low" };
}
