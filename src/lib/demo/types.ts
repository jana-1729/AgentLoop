// Shared types for the AgentLoop demo (diabetic health-commerce vertical slice).

export type GI = "low" | "medium" | "high";
export type Confidence = "high" | "medium" | "low";
export type Rating = "green" | "yellow" | "red";

export interface Nutrition {
  carbs_g: number;
  sugar_g: number;
  protein_g: number;
  fat_g: number;
  fiber_g: number;
  kcal: number;
  gi: GI;
  confidence: Confidence;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number; // INR
  veg: boolean;
  description: string;
  category: string;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  etaMins: number;
  items: MenuItem[];
}

export interface HealthProfile {
  name: string;
  condition: string;
  mealCarbBudget_g: number; // target carbs per meal
  dailyCarbBudget_g: number;
  addedSugarLimit_g: number; // per meal
  vegOnly: boolean;
  avoid: string[]; // keywords to hard-flag (e.g. "sugar", "fried")
  goal: string; // human-readable goal
}

export interface ScoredItem {
  item: MenuItem;
  restaurantId: string;
  restaurantName: string;
  nutrition: Nutrition;
  rating: Rating;
  reasons: string[]; // why this rating
  swaps: string[]; // healthier alternatives
}

export interface PlacedOrder {
  orderId: string;
  items: { name: string; price: number }[];
  total: number;
  etaMins: number;
  totalCarbs_g: number;
  note: string; // simulated marker
}
