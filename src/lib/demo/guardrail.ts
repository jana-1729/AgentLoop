import type { HealthProfile, MenuItem, Nutrition, Rating, ScoredItem } from "./types";
import { lookupNutrition } from "./nutrition-db";

// Suggested healthier swaps for common high-impact items (diabetic lens).
const SWAP_MAP: { match: string; swaps: string[] }[] = [
  { match: "biryani", swaps: ["Millet khichdi", "Brown rice + grilled chicken"] },
  { match: "steamed rice", swaps: ["Brown rice", "2 phulka / bajra roti"] },
  { match: "jeera rice", swaps: ["Brown rice", "Millet khichdi"] },
  { match: "naan", swaps: ["Tandoori roti", "2 phulka"] },
  { match: "paratha", swaps: ["Phulka", "Bajra roti"] },
  { match: "masala dosa", swaps: ["Plain dosa (1)", "2 idli"] },
  { match: "sweet lassi", swaps: ["Masala chaas", "Plain water"] },
  { match: "lassi", swaps: ["Masala chaas"] },
  { match: "gulab jamun", swaps: ["Skip dessert", "Fruit bowl"] },
  { match: "halwa", swaps: ["Skip dessert", "A few nuts"] },
  { match: "cold drink", swaps: ["Masala chaas", "Lime water (no sugar)"] },
  { match: "cola", swaps: ["Lime water (no sugar)"] },
  { match: "butter chicken", swaps: ["Tandoori chicken", "Chicken curry (less cream)"] },
  { match: "shahi paneer", swaps: ["Paneer tikka", "Palak paneer"] },
];

function swapsFor(name: string): string[] {
  const n = name.toLowerCase();
  for (const s of SWAP_MAP) {
    if (n.includes(s.match)) return s.swaps;
  }
  return [];
}

/**
 * Score a single dish against the user's health profile.
 * Rating logic (diabetic):
 *  - RED   : carbs over the full meal budget, OR high added sugar, OR a hard-avoid keyword.
 *  - YELLOW: carbs use most of the budget, OR high GI, OR medium sugar.
 *  - GREEN : within budget, low/medium GI, low sugar.
 */
export function scoreDish(
  item: MenuItem,
  profile: HealthProfile,
  restaurantId: string,
  restaurantName: string
): ScoredItem {
  const nutrition: Nutrition = lookupNutrition(item.name);
  const reasons: string[] = [];
  const budget = profile.mealCarbBudget_g;
  const nameL = item.name.toLowerCase();

  const hardAvoid = profile.avoid.find((k) => nameL.includes(k));
  const carbShare = nutrition.carbs_g / budget;

  let rating: Rating = "green";

  if (nutrition.sugar_g > profile.addedSugarLimit_g * 2) {
    rating = "red";
    reasons.push(`High sugar: ~${nutrition.sugar_g}g (limit ${profile.addedSugarLimit_g}g/meal)`);
  } else if (carbShare > 1) {
    rating = "red";
    reasons.push(`Carbs ~${nutrition.carbs_g}g exceed your ${budget}g meal budget`);
  } else if (hardAvoid && rating === "green") {
    rating = "yellow";
    reasons.push(`Contains "${hardAvoid}" — go easy`);
  }

  if (rating !== "red") {
    if (carbShare > 0.7) {
      rating = "yellow";
      reasons.push(`Uses ~${Math.round(carbShare * 100)}% of your carb budget`);
    } else if (nutrition.gi === "high" && nutrition.carbs_g > 25) {
      rating = "yellow";
      reasons.push("High glycaemic index — can spike blood sugar");
    } else if (nutrition.sugar_g >= profile.addedSugarLimit_g) {
      rating = "yellow";
      reasons.push(`Some added sugar (~${nutrition.sugar_g}g)`);
    }
  }

  if (rating === "green") {
    if (nutrition.protein_g >= 15) reasons.push(`High protein (~${nutrition.protein_g}g) — steadier sugar`);
    else if (nutrition.fiber_g >= 6) reasons.push(`High fibre (~${nutrition.fiber_g}g) — slower glucose release`);
    else reasons.push(`Within budget (~${nutrition.carbs_g}g carbs)`);
  }

  if (nutrition.confidence === "low") {
    reasons.push("⚠ Estimated — not in curated database");
  }

  const swaps = rating === "green" ? [] : swapsFor(item.name);

  return { item, restaurantId, restaurantName, nutrition, rating, reasons, swaps };
}

export function summarizeCart(items: ScoredItem[]) {
  const totalCarbs = items.reduce((s, i) => s + i.nutrition.carbs_g, 0);
  const totalSugar = items.reduce((s, i) => s + i.nutrition.sugar_g, 0);
  const totalProtein = items.reduce((s, i) => s + i.nutrition.protein_g, 0);
  const totalKcal = items.reduce((s, i) => s + i.nutrition.kcal, 0);
  return { totalCarbs, totalSugar, totalProtein, totalKcal };
}
