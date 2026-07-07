import type { HealthProfile } from "./types";

// Hardcoded demo user. In production this comes from the user's onboarding.
export const demoProfile: HealthProfile = {
  name: "Ravi",
  condition: "Type 2 Diabetes",
  mealCarbBudget_g: 45,
  dailyCarbBudget_g: 130,
  addedSugarLimit_g: 10,
  vegOnly: false,
  avoid: ["sugar", "sweet", "syrup", "fried", "deep-fried"],
  goal: "Keep post-meal blood sugar in range (target < 140 mg/dL). Prefer high-protein, high-fibre, low-GI meals within the carb budget.",
};
