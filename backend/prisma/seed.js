import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const hotel = await prisma.hotel.upsert({
    where: { id: "hotel_1" },
    update: {},
    create: { id: "hotel_1", name: "The Baikal Sphere Hotel" },
  });

  const menuItems = [
    { name: "Butter Chicken", category: "Mains", vegetarian: false, price: 600, description: "Creamy tomato curry with tandoori chicken." },
    { name: "Paneer Tikka Masala", category: "Mains", vegetarian: true, price: 550, description: "Grilled paneer in a spiced tomato gravy." },
    { name: "Margherita Pizza", category: "Mains", vegetarian: true, price: 500, description: "Classic tomato, mozzarella and basil." },
    { name: "Caesar Salad", category: "Starters", vegetarian: true, price: 350, description: "Romaine, parmesan, croutons, Caesar dressing." },
    { name: "Chicken Satay", category: "Starters", vegetarian: false, price: 400, description: "Grilled skewers with peanut sauce." },
    { name: "Chocolate Lava Cake", category: "Desserts", vegetarian: true, price: 300, description: "Warm cake with a molten chocolate center." },
    { name: "Fresh Lime Soda", category: "Beverages", vegetarian: true, price: 150, description: "Sweet or salted, chilled." },
    { name: "Masala Chai", category: "Beverages", vegetarian: true, price: 120, description: "Spiced Indian tea." },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.create({ data: { ...item, hotelId: hotel.id } });
  }

  const spaServices = [
    { name: "Swedish Massage", category: "Massage", durationMin: 60, price: 3500, description: "Full body relaxation massage." },
    { name: "Deep Tissue Massage", category: "Massage", durationMin: 90, price: 4500, description: "Targeted therapy for muscle tension." },
    { name: "Rejuvenating Facial", category: "Skincare", durationMin: 45, price: 2800, description: "Cleansing and hydrating facial treatment." },
    { name: "Hot Stone Therapy", category: "Massage", durationMin: 75, price: 4000, description: "Heated stones to release deep muscle tension." },
  ];

  for (const service of spaServices) {
    await prisma.spaService.create({ data: { ...service, hotelId: hotel.id } });
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
