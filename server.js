require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// ===== INIT =====
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "test",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "test"
});

// ===== LOAD FILES =====
let users = fs.existsSync("users.json") ? JSON.parse(fs.readFileSync("users.json")) : {};
let clients = fs.existsSync("clients.json") ? JSON.parse(fs.readFileSync("clients.json")) : {};
let leads = fs.existsSync("leads.json") ? JSON.parse(fs.readFileSync("leads.json")) : {};
let bookings = fs.existsSync("bookings.json") ? JSON.parse(fs.readFileSync("bookings.json")) : [];
let memory = fs.existsSync("memory.json") ? JSON.parse(fs.readFileSync("memory.json")) : {};
let revenue = fs.existsSync("revenue.json") ? JSON.parse(fs.readFileSync("revenue.json")) : [];

// ===== FIX OLD BOOKINGS =====
bookings = bookings.map(b => ({
  ...b,
  date: b.date || new Date().toISOString().split("T")[0]
}));

function saveAll() {
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  fs.writeFileSync("clients.json", JSON.stringify(clients, null, 2));
  fs.writeFileSync("leads.json", JSON.stringify(leads, null, 2));
  fs.writeFileSync("bookings.json", JSON.stringify(bookings, null, 2));
  fs.writeFileSync("memory.json", JSON.stringify(memory, null, 2));
  fs.writeFileSync("revenue.json", JSON.stringify(revenue, null, 2));
}

// ===== WEBHOOK VERIFY =====
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ===== AUTH =====
app.post("/api/register", (req, res) => {
  const { email, password } = req.body;

  users[email] = { password, plan: "free", expiresAt: null };

  clients[email] = {
    name: "My Salon",
    services: { haircut: 300, facial: 800 },
    token: process.env.WHATSAPP_TOKEN,
    phone_number_id: process.env.PHONE_NUMBER_ID
  };

  saveAll();
  res.send({ message: "Registered" });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!users[email] || users[email].password !== password) {
    return res.send({ error: "Invalid login" });
  }

  res.send({ token: email });
});

// ===== DASHBOARD =====
app.get("/api/client-data", (req, res) => {
  const email = req.headers.authorization;

  const userLeads = leads[email] || [];
  const userBookings = bookings.filter(b => b.businessId === email);

  res.send({
    total: userLeads.length,
    bookings: userBookings.length,
    plan: users[email]?.plan || "free",
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

app.get("/api/conversion", (req, res) => {
  const email = req.headers.authorization;

  const totalLeads = (leads[email] || []).length;
  const totalBookings = bookings.filter(b => b.businessId === email).length;

  const conversion =
    totalLeads === 0 ? 0 : ((totalBookings / totalLeads) * 100).toFixed(1);

  res.send({ conversion });
});

app.get("/api/revenue", (req, res) => {
  res.send(revenue);
});

// ===== PAYMENT (UNCHANGED — SAFE) =====
app.post("/api/create-order", async (req, res) => {
  const order = await razorpay.orders.create({
    amount: 99900,
    currency: "INR"
  });
  res.send(order);
});

app.post("/api/verify-payment", (req, res) => {
  const { email, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "test")
    .update(body)
    .digest("hex");

  if (expected === razorpay_signature) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    users[email].plan = "premium";
    users[email].expiresAt = expiry;

    revenue.push({ email, amount: 999, date: new Date() });

    saveAll();
    return res.send({ success: true });
  }

  res.send({ success: false });
});

// ===== 🔥 SMART AI ENGINE (FINAL) =====
function getSmartAI(userId, message) {
  if (!memory[userId] || typeof memory[userId] !== "object") {
    memory[userId] = {
      step: "start",
      context: {},
      history: []
    };
  }

  const user = memory[userId];
  const msg = message.toLowerCase();
  user.history.push(msg);

  const intent = /book|appointment|schedule/.test(msg)
    ? "booking"
    : /price|cost|charge/.test(msg)
    ? "pricing"
    : /time|open|hours/.test(msg)
    ? "timing"
    : /hi|hello|hey/.test(msg)
    ? "greeting"
    : "unknown";

  // ===== BOOKING =====
  if (intent === "booking" || user.step === "booking") {
    user.step = "booking";

    if (!user.context.date) {
      if (msg.match(/\d{4}-\d{2}-\d{2}/)) {
        user.context.date = message;
        return "Nice 👍 What time would you prefer?";
      }
      return "📅 Please enter date (YYYY-MM-DD)";
    }

    if (!user.context.time) {
      user.context.time = message;

      bookings.push({
        phone: userId,
        date: user.context.date,
        time: user.context.time,
        businessId: userId
      });

      saveAll();

      return `✨ Booking Confirmed!\n📅 ${user.context.date}\n⏰ ${user.context.time}`;
    }
  }

  // ===== PRICING =====
  if (intent === "pricing") {
    return "💇 Haircut ₹300\n💆 Facial ₹800\nWould you like to book?";
  }

  // ===== TIMING =====
  if (intent === "timing") {
    return "We are open from 10 AM to 8 PM 😊";
  }

  // ===== GREETING =====
  if (intent === "greeting") {
    return "Hey 👋 Welcome! I can help you with booking, pricing or services.";
  }

  // ===== DEFAULT =====
  return "Hi 😊 You can type 'book' to book an appointment or ask for prices.";
}

// ===== WHATSAPP =====
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body || "";

    const phoneId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    const businessId = Object.keys(clients).find(
      key => clients[key].phone_number_id === phoneId
    );

    if (!businessId) return res.sendStatus(200);

    const client = clients[businessId];

    if (!leads[businessId]) leads[businessId] = [];
    leads[businessId].push({ phone: from, message: text });

    const reply = getSmartAI(from, text);

    await axios.post(
      `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      },
      {
        headers: {
          Authorization: `Bearer ${client.token}`,
          "Content-Type": "application/json"
        }
      }
    );

    saveAll();
    res.sendStatus(200);

  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 SERVER RUNNING"));