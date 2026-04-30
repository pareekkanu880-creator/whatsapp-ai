require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const Razorpay = require("razorpay");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-ai-key";

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

const DB = {
  users: "users.json",
  clients: "clients.json",
  leads: "leads.json",
  bookings: "bookings.json",
  memory: "memory.json",
  revenue: "revenue.json"
};

function load(file, fallback) {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : fallback;
  } catch {
    return fallback;
  }
}

let users = load(DB.users, {});
let clients = load(DB.clients, {});
let leads = load(DB.leads, {});
let bookings = load(DB.bookings, []);
let memory = load(DB.memory, {});
let revenue = load(DB.revenue, []);

function saveAll() {
  fs.writeFileSync(DB.users, JSON.stringify(users, null, 2));
  fs.writeFileSync(DB.clients, JSON.stringify(clients, null, 2));
  fs.writeFileSync(DB.leads, JSON.stringify(leads, null, 2));
  fs.writeFileSync(DB.bookings, JSON.stringify(bookings, null, 2));
  fs.writeFileSync(DB.memory, JSON.stringify(memory, null, 2));
  fs.writeFileSync(DB.revenue, JSON.stringify(revenue, null, 2));
}

// =====================================================
// AUTH
// =====================================================

app.post("/api/register", async (req, res) => {
  const { email, password, businessName, phoneId } = req.body;

  if (users[email]) return res.send({ error: "User exists" });

  const hash = await bcrypt.hash(password, 10);

  users[email] = { password: hash, plan: "free", expiresAt: null };

  clients[email] = {
    name: businessName || "Elite Salon",
    services: {
      haircut: 300,
      facial: 800,
      beard: 200
    },
    timings: "10 AM - 8 PM",
    availableSlots: ["10:00", "12:00", "14:00", "16:00", "18:00"],
    phone_number_id: phoneId || process.env.PHONE_NUMBER_ID
  };

  saveAll();
  res.send({ success: true });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = users[email];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.send({ success: false });
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });

  res.send({ success: true, token });
});

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403);
    req.email = decoded.email;
    next();
  });
}

// =====================================================
// DASHBOARD APIs
// =====================================================

app.get("/api/client-data", auth, (req, res) => {
  const email = req.email;

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

app.get("/api/live-leads", auth, (req, res) => {
  res.send(leads[req.email] || []);
});

app.get("/api/bookings", auth, (req, res) => {
  res.send(bookings.filter(b => b.businessId === req.email));
});

app.get("/api/revenue", (req, res) => {
  res.send(revenue);
});

app.get("/api/conversion", auth, (req, res) => {
  const email = req.email;

  const totalLeads = (leads[email] || []).length;
  const totalBookings = bookings.filter(b => b.businessId === email).length;

  const conversion = totalLeads === 0
    ? 0
    : ((totalBookings / totalLeads) * 100).toFixed(1);

  res.send({ conversion });
});

// =====================================================
// AI ENGINE (WORKING)
// =====================================================

function clean(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function detectService(msg, services) {
  const map = {
    haircut: ["haircut", "cut", "trim"],
    beard: ["beard", "shave"],
    facial: ["facial", "face"]
  };

  for (let s in services) {
    const keys = map[s] || [s];
    if (keys.some(k => msg.includes(k))) return s;
  }

  return null;
}

function detectSlot(msg, slots) {
  return slots.find(s => msg.includes(s.replace(":", "")) || msg.includes(s));
}

function AI(userId, message, businessId) {
  const client = clients[businessId];
  const msg = clean(message);

  if (!memory[userId]) {
    memory[userId] = { service: null, waiting: false };
  }

  const session = memory[userId];

  // lead
  if (!leads[businessId]) leads[businessId] = [];
  if (!leads[businessId].find(l => l.phone === userId)) {
    leads[businessId].push({ phone: userId, message });
  }

  // greeting
  if (/hi|hello|hey/.test(msg)) {
    return `Hey 👋 Welcome to ${client.name}!

You can ask for:
• Prices
• Book appointment
• Services`;
  }

  // pricing
  if (/price|cost|rate|kitna/.test(msg)) {
    return Object.entries(client.services)
      .map(([s, p]) => `${s}: ₹${p}`)
      .join("\n");
  }

  // timing
  if (/time|open|close/.test(msg)) {
    return `🕒 ${client.timings}`;
  }

  // service
  const service = detectService(msg, client.services);

  if (service) {
    session.service = service;
    return `${service} costs ₹${client.services[service]}

Reply "book" to continue`;
  }

  // booking
  if (msg.includes("book")) {
    session.waiting = true;
    return `Slots:\n${client.availableSlots.join("\n")}`;
  }

  // slot
  const slot = detectSlot(msg, client.availableSlots);

  if (session.waiting && slot) {
    bookings.push({
      phone: userId,
      service: session.service,
      time: slot,
      businessId,
      date: new Date().toISOString().split("T")[0]
    });

    revenue.push({
      businessId,
      amount: client.services[session.service],
      date: new Date()
    });

    session.waiting = false;

    return `✅ Booked at ${slot}`;
  }

  return "Tell me service, price or booking 😊";
}

// =====================================================
// WHATSAPP WEBHOOK
// =====================================================

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];

    if (!msg) return;

    const from = msg.from;
    const text = msg.text?.body || "";
    const phoneId = value.metadata.phone_number_id;

    const businessId = Object.keys(clients).find(
      id => clients[id].phone_number_id === phoneId
    );

    if (!businessId) return;

    const reply = AI(from, text, businessId);

    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
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

app.listen(PORT, () => {
  console.log("🚀 SERVER RUNNING:", PORT);
});