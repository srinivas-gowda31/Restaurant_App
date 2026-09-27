import { PrismaClient } from "@prisma/client";
import { normalizeMenuCategory } from "../src/menuCategories.js";
import { normalizeCuisine } from "../src/cuisines.js";

const prisma = new PrismaClient();

// Every other insertion path (admin.js's upsertCatalogItem, the upload-approve flow) looks up
// by case-insensitive name first and updates in place — this didn't, so re-running seed (or
// running it after a real menu was uploaded with overlapping demo dish names) created literal
// duplicate rows instead of leaving the real data alone. Matches that same upsert pattern.
async function upsertByName(model, hotelId, data) {
  const existing = await model.findFirst({ where: { hotelId, name: { equals: data.name, mode: "insensitive" } } });
  if (existing) return model.update({ where: { id: existing.id }, data });
  return model.create({ data: { ...data, hotelId } });
}

async function main() {
  const hotel = await prisma.hotel.upsert({
    where: { id: "hotel_1" },
    update: {},
    create: { id: "hotel_1", name: "The Baikal Sphere Hotel" },
  });

  const menuItems = [
    { name: "Butter Chicken", category: "Main Course", cuisine: "Indian", vegetarian: false, price: 600, description: "Creamy tomato curry with tandoori chicken." },
    { name: "Paneer Tikka Masala", category: "Main Course", cuisine: "Indian", vegetarian: true, price: 550, description: "Grilled paneer in a spiced tomato gravy." },
    { name: "Margherita Pizza", category: "Main Course", cuisine: "Continental", vegetarian: true, price: 500, description: "Classic tomato, mozzarella and basil." },
    { name: "Caesar Salad", category: "Starters", cuisine: "Continental", vegetarian: true, price: 350, description: "Romaine, parmesan, croutons, Caesar dressing." },
    { name: "Chicken Satay", category: "Starters", cuisine: "Continental", vegetarian: false, price: 400, description: "Grilled skewers with peanut sauce." },
    { name: "Chocolate Lava Cake", category: "Desserts", cuisine: "Continental", vegetarian: true, price: 300, description: "Warm cake with a molten chocolate center." },
    { name: "Fresh Lime Soda", category: "Beverages", cuisine: "Continental", vegetarian: true, price: 150, description: "Sweet or salted, chilled." },
    { name: "Masala Chai", category: "Beverages", cuisine: "Indian", vegetarian: true, price: 120, description: "Spiced Indian tea." },
  ];

  for (const item of menuItems) {
    await upsertByName(prisma.menuItem, hotel.id, {
      ...item,
      category: normalizeMenuCategory(item.category),
      cuisine: normalizeCuisine(item.cuisine),
    });
  }

  const spaServices = [
    { name: "Swedish Massage", category: "Massage", durationMin: 60, price: 3500, description: "Full body relaxation massage." },
    { name: "Deep Tissue Massage", category: "Massage", durationMin: 90, price: 4500, description: "Targeted therapy for muscle tension." },
    { name: "Rejuvenating Facial", category: "Skincare", durationMin: 45, price: 2800, description: "Cleansing and hydrating facial treatment." },
    { name: "Hot Stone Therapy", category: "Massage", durationMin: 75, price: 4000, description: "Heated stones to release deep muscle tension." },
  ];

  for (const service of spaServices) {
    await upsertByName(prisma.spaService, hotel.id, service);
  }

  const rooms = [
    { number: "101", guestName: "Rahul Sharma" },
    { number: "102", guestName: "Priya Singh" },
    { number: "103", guestName: "Aditya Verma" },
    { number: "104", guestName: "Sneha Reddy" },
    { number: "105", guestName: "Karan Mehta" },
    { number: "201", guestName: "Ananya Iyer" },
    { number: "202", guestName: "Vikram Nair" },
    { number: "203", guestName: "Meera Joshi" },
    { number: "204", guestName: "Arjun Kapoor" },
    { number: "205", guestName: "Divya Rao" },
  ];

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { hotelId_number: { hotelId: hotel.id, number: room.number } },
      update: { guestName: room.guestName },
      create: { ...room, hotelId: hotel.id },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
