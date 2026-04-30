// 🚀 FINAL HUMAN-LEVEL AI SALON SAAS (STABLE)

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const Razorpay = require("razorpay");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// =====================================================
// INIT
// =====================================================

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// =====================================================
// DATABASE
// =====================================================

function loadJSON(file, fallback) {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : fallback;
  } catch {
    return fallback;
  }
}

let users = loadJSON("users.json", {});
let clients = loadJSON("clients.json", {});
let leads = loadJSON("leads.json", {});
let bookings = loadJSON("bookings.json", []);
let memory = loadJSON("memory.json", {});
let revenue = loadJSON("revenue.json", []);
let paymentsPending = loadJSON("paymentsPending.json", []);

function saveAll() {
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  fs.writeFileSync("clients.json", JSON.stringify(clients, null, 2));
  fs.writeFileSync("leads.json", JSON.stringify(leads, null, 2));
  fs.writeFileSync("bookings.json", JSON.stringify(bookings, null, 2));
  fs.writeFileSync("memory.json", JSON.stringify(memory, null, 2));
  fs.writeFileSync("revenue.json", JSON.stringify(revenue, null, 2));
  fs.writeFileSync("paymentsPending.json", JSON.stringify(paymentsPending, null, 2));
}

// =====================================================
// ROUTES
// =====================================================

app.get("/", (req, res) => res.send("🔥 AI Salon SaaS Running"));

// =====================================================
// AUTH
// =====================================================

app.post("/api/register", (req, res) => {
  const { email, password, businessName } = req.body;

  users[email] = { password, plan: "free", expiresAt: null };

  clients[email] = {
    name: businessName || "Salon",
    services: {
      Haircut: 300,
      Facial: 800,
      Beard: 200
    },
    timings: "10 AM - 8 PM",
    availableSlots: ["10:00","12:00","14:00","16:00","18:00"],
    phone_number_id: process.env.PHONE_NUMBER_ID
  };

  saveAll();
  res.send({ success: true });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!users[email] || users[email].password !== password) {
    return res.send({ success: false });
  }

  res.send({ success: true, token: email });
});

// =====================================================
// DASHBOARD
// =====================================================

app.get("/api/client-data", (req, res) => {
  const email = req.headers.authorization;

  const userBookings = bookings.filter(b => b.businessId === email);
  const userRevenue = revenue.filter(r => r.businessId === email);

  res.send({
    leads: (leads[email] || []).length,
    bookings: userBookings.length,
    revenue: userRevenue.reduce((s, r) => s + r.amount, 0),
    plan: users[email]?.plan,
    expiresAt: users[email]?.expiresAt
  });
});

app.get("/api/live-leads", (req, res) => {
  const email = req.headers.authorization;
  res.send(leads[email] || []);
});

app.get("/api/bookings", (req, res) => {
  const email = req.headers.authorization;
  res.send(bookings.filter(b => b.businessId === email));
});

app.get("/api/revenue", (req, res) => res.send(revenue));

// =====================================================
// PAYMENT
// =====================================================

app.post("/api/create-order", async (req, res) => {
  const order = await razorpay.orders.create({
    amount: 99900,
    currency: "INR"
  });
  res.send(order);
});

app.post("/api/verify-payment", (req, res) => {
  const { email } = req.body;

  users[email].plan = "pro";
  users[email].expiresAt = new Date(Date.now() + 30*24*60*60*1000);

  saveAll();
  res.send({ success: true });
});

// =====================================================
// 🧠 HUMAN AI ENGINE
// =====================================================

function normalize(msg) {
  return msg.toLowerCase()
    .replace(/kya|kitna/g, "price")
    .replace(/karwana|book karna/g, "booking");
}

function detectService(msg, client) {
  return Object.keys(client.services).find(s =>
    msg.includes(s.toLowerCase())
  );
}

function getAI(userId, message, businessId) {
  const client = clients[businessId];
  const msg = normalize(message);

  if (!memory[userId]) {
    memory[userId] = {
      selectedService: null,
      waitingForSlot: false
    };
  }

  const user = memory[userId];

  // Greeting
  if (/hi|hello|hey/.test(msg)) {
    return `Hey 👋 Welcome to ${client.name}!`;
  }

  // Pricing
  if (msg.includes("price")) {
    let txt = "";
    Object.keys(client.services).forEach(s => {
      txt += `• ${s}: ₹${client.services[s]}\n`;
    });

    return `Sure 😊 Here are our services:\n\n${txt}`;
  }

  // Service selection
  const service = detectService(msg, client);
  if (service) {
    user.selectedService = service;
    user.waitingForSlot = true;

    return `Nice choice 😊 ${service} is a great option.

📅 Available slots:

${client.availableSlots.join("\n")}

Reply with time 👍`;
  }

  // Slot booking
  if (user.waitingForSlot && /^\d{2}:\d{2}$/.test(message)) {
    bookings.push({
      phone: userId,
      service: user.selectedService,
      time: message,
      businessId,
      date: new Date()
    });

    revenue.push({
      businessId,
      amount: client.services[user.selectedService] || 300,
      date: new Date()
    });

    user.waitingForSlot = false;

    return `✅ Your ${user.selectedService} is booked at ${message}.

See you soon 😊`;
  }

  // Booking intent
  if (msg.includes("booking")) {
    return `Which service would you like?

${Object.keys(client.services).join("\n")}`;
  }

  return `Tell me what you need 😊`;
}

// =====================================================
// WEBHOOK
// =====================================================

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const from = msg.from;
    const text = msg.text?.body || "";

    const businessId = Object.keys(clients)[0];
    const client = clients[businessId];

    const reply = getAI(from, text, businessId);

    await axios.post(
      `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
        }
      }
    );

    saveAll();

  } catch (e) {
    console.log("ERROR:", e.message);
  }
});

// =====================================================
// START
// =====================================================

app.listen(3000, () => console.log("🔥 SERVER RUNNING"));