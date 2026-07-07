import type { Restaurant } from "../types";

// Fixture restaurants standing in for Swiggy `search_restaurants` / `get_restaurant_menu`.
// Dish names align with the nutrition DB so the guardrail can score them.
export const restaurants: Restaurant[] = [
  {
    id: "r1",
    name: "Punjab Grill Express",
    cuisine: "North Indian",
    rating: 4.3,
    etaMins: 32,
    items: [
      { id: "r1-1", name: "Chicken Biryani", price: 260, veg: false, description: "Hyderabadi dum biryani with raita", category: "Rice" },
      { id: "r1-2", name: "Butter Chicken", price: 320, veg: false, description: "Creamy tomato gravy", category: "Mains" },
      { id: "r1-3", name: "Tandoori Chicken (Half)", price: 280, veg: false, description: "Charcoal grilled, yoghurt marinade", category: "Tandoor" },
      { id: "r1-4", name: "Dal Tadka", price: 180, veg: true, description: "Yellow lentils, cumin tempering", category: "Dal" },
      { id: "r1-5", name: "Butter Naan", price: 60, veg: true, description: "Soft leavened bread", category: "Breads" },
      { id: "r1-6", name: "Tandoori Roti", price: 30, veg: true, description: "Whole wheat clay-oven bread", category: "Breads" },
      { id: "r1-7", name: "Sweet Lassi", price: 90, veg: true, description: "Sweetened yoghurt drink", category: "Drinks" },
      { id: "r1-8", name: "Green Salad", price: 70, veg: true, description: "Cucumber, onion, tomato, lemon", category: "Sides" },
    ],
  },
  {
    id: "r2",
    name: "Sattvik Kitchen",
    cuisine: "Healthy / Home-style",
    rating: 4.6,
    etaMins: 28,
    items: [
      { id: "r2-1", name: "Millet Khichdi", price: 190, veg: true, description: "Foxtail millet, moong dal, veggies", category: "Bowls" },
      { id: "r2-2", name: "Palak Paneer", price: 240, veg: true, description: "Cottage cheese in spinach gravy", category: "Mains" },
      { id: "r2-3", name: "Rajma", price: 200, veg: true, description: "Kidney beans in onion-tomato gravy", category: "Dal" },
      { id: "r2-4", name: "Brown Rice", price: 90, veg: true, description: "Steamed unpolished rice", category: "Rice" },
      { id: "r2-5", name: "Bajra Roti", price: 40, veg: true, description: "Pearl millet flatbread", category: "Breads" },
      { id: "r2-6", name: "Sprouts Salad", price: 120, veg: true, description: "Moong sprouts, onion, lemon", category: "Sides" },
      { id: "r2-7", name: "Masala Chaas", price: 60, veg: true, description: "Spiced buttermilk", category: "Drinks" },
      { id: "r2-8", name: "Grilled Chicken Bowl", price: 290, veg: false, description: "Grilled chicken, greens, quinoa", category: "Bowls" },
    ],
  },
  {
    id: "r3",
    name: "Dosa Junction",
    cuisine: "South Indian",
    rating: 4.2,
    etaMins: 25,
    items: [
      { id: "r3-1", name: "Masala Dosa", price: 130, veg: true, description: "Crispy dosa, potato masala", category: "Dosa" },
      { id: "r3-2", name: "Plain Dosa", price: 90, veg: true, description: "Crispy fermented crepe", category: "Dosa" },
      { id: "r3-3", name: "Idli (2 pcs)", price: 70, veg: true, description: "Steamed rice cakes with sambar", category: "Tiffin" },
      { id: "r3-4", name: "Medu Vada (2 pcs)", price: 80, veg: true, description: "Fried lentil doughnuts", category: "Tiffin" },
      { id: "r3-5", name: "Sambar", price: 60, veg: true, description: "Lentil-vegetable stew", category: "Sides" },
      { id: "r3-6", name: "Curd Rice", price: 110, veg: true, description: "Rice tempered with yoghurt", category: "Rice" },
      { id: "r3-7", name: "Filter Coffee (sugar)", price: 50, veg: true, description: "South Indian coffee", category: "Drinks" },
    ],
  },
  {
    id: "r4",
    name: "Sweet Corner",
    cuisine: "Desserts",
    rating: 4.1,
    etaMins: 35,
    items: [
      { id: "r4-1", name: "Gulab Jamun (2 pcs)", price: 90, veg: true, description: "Fried milk dumplings in syrup", category: "Sweets" },
      { id: "r4-2", name: "Gajar Halwa", price: 120, veg: true, description: "Carrot pudding with ghee", category: "Sweets" },
      { id: "r4-3", name: "Cold Drink", price: 60, veg: true, description: "Chilled cola 300ml", category: "Drinks" },
    ],
  },
];
