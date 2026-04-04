require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const OpenAI = require("openai");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// ===== INIT =====
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ===== LOAD FILES =====
let users = fs.existsSync("users.json") ? JSON.parse(fs.readFileSync("users.json")) : {};
let clients = fs.existsSync("clients.json") ? JSON.parse(fs.readFileSync("clients.json")) : {};
let leads = fs.existsSync("leads.json") ? JSON.parse(fs.readFileSync("leads.json")) : {};
let bookings = fs.existsSync("bookings.json") ? JSON.parse(fs.readFileSync("bookings.json")) : [];
let memory = fs.existsSync("memory.json") ? JSON.parse(fs.readFileSync("memory.json")) : {};
let revenue = fs.existsSync("revenue.json") ? JSON.parse(fs.readFileSync("revenue.json")) : [];

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
  const verify_token = process.env.VERIFY_TOKEN;

  if (req.query["hub.verify_token"] === verify_token) {
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

// ===== LEADS =====
app.get("/api/live-leads", (req, res) => {
  const email = req.headers.authorization;
  res.send(leads[email] || []);
});

// ===== BOOKINGS =====
app.get("/api/bookings", (req, res) => {
  const email = req.headers.authorization;
  res.send(bookings.filter(b => b.businessId === email));
});

// ===== CONVERSION =====
app.get("/api/conversion", (req, res) => {
  const email = req.headers.authorization;

  const totalLeads = (leads[email] || []).length;
  const totalBookings = bookings.filter(b => b.businessId === email).length;

  const conversion =
    totalLeads === 0 ? 0 : ((totalBookings / totalLeads) * 100).toFixed(1);

  res.send({ conversion });
});

// ===== REVENUE =====
app.get("/api/revenue", (req, res) => {
  res.send(revenue);
});

// ===== PAYMENT =====
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
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
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

// ===== AI =====
async function getAIReply(userId, message, client) {
  if (!memory[userId]) memory[userId] = [];

  memory[userId].push({ role: "user", content: message });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Salon assistant. Services: ${JSON.stringify(client.services)}`
      },
      ...memory[userId].slice(-10)
    ]
  });

  const reply = res.choices[0].message.content;
  memory[userId].push({ role: "assistant", content: reply });

  return reply;
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

    if (text.toLowerCase().includes("book")) {
      await sendMessage(client, from, "What time?");
      return res.sendStatus(200);
    }

    if (text.match(/\d/)) {
      bookings.push({ phone: from, time: text, businessId });
      saveAll();
      await sendMessage(client, from, "✅ Booking confirmed!");
      return res.sendStatus(200);
    }

    const reply = await getAIReply(from, text, client);
    await sendMessage(client, from, reply);

    saveAll();
    res.sendStatus(200);

  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

async function sendMessage(client, to, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${client.token}`,
        "Content-Type": "application/json"
      }
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 SERVER RUNNING"));