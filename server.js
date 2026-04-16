require("dotenv").config();
const express = require("express");
const axios = require("axios");
const OpenAI = require("openai");
const fs = require("fs");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// ===== OPENAI INIT =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===== INIT =====
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "test",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "test"
});

// ===== SAFE JSON LOADER =====
function loadJSON(file, fallback) {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : fallback;
  } catch (e) {
    console.log(`❌ Error loading ${file}`, e.message);
    return fallback;
  }
}

// ===== LOAD FILES =====
let users = loadJSON("users.json", {});
let clients = loadJSON("clients.json", {});
let leads = loadJSON("leads.json", {});
let bookings = loadJSON("bookings.json", []);
let memory = loadJSON("memory.json", {});
let revenue = loadJSON("revenue.json", []);

// ===== SAVE FUNCTION =====
function saveAll() {
  try {
    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
    fs.writeFileSync("clients.json", JSON.stringify(clients, null, 2));
    fs.writeFileSync("leads.json", JSON.stringify(leads, null, 2));
    fs.writeFileSync("bookings.json", JSON.stringify(bookings, null, 2));
    fs.writeFileSync("memory.json", JSON.stringify(memory, null, 2));
    fs.writeFileSync("revenue.json", JSON.stringify(revenue, null, 2));
  } catch (e) {
    console.log("❌ SAVE ERROR:", e.message);
  }
}

// ===== FIX OLD BOOKINGS =====
bookings = bookings.map(b => ({
  ...b,
  date: b.date || new Date().toISOString().split("T")[0]
}));

// ===== ROOT CHECK =====
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp AI SaaS Running");
});

// ===== PRIVACY =====
app.get("/privacy", (req, res) => {
  res.send(`
    <h1>Privacy Policy</h1>
    <p>This application uses WhatsApp Cloud API to send and receive messages.</p>
    <p>No personal user data is stored permanently.</p>
    <p>All data is used only for automation and service improvement.</p>
  `);
});

// ===== TERMS =====
app.get("/terms", (req, res) => {
  res.send(`
    <h1>Terms of Service</h1>
    <p>By using this service, you agree to use it responsibly.</p>
    <p>This system automates WhatsApp communication.</p>
    <p>We are not responsible for misuse.</p>
  `);
});

// ===== DELETE =====
app.get("/delete", (req, res) => {
  res.send(`
    <h1>Data Deletion</h1>
    <p>To delete your data, contact us at your registered email.</p>
    <p>We will remove your data within 48 hours.</p>
  `);
});

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

// ===== OLD AI (UNCHANGED, NOT USED) =====
function getSmartAI(userId, message) {
  return "Legacy AI disabled";
}

// ===== OPENAI AI =====
async function getOpenAIReply(message) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a smart WhatsApp business assistant for a salon. Talk naturally, help users book appointments, answer questions, and guide them."
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    return response.choices[0].message.content;

  } catch (e) {
    console.log("❌ OpenAI Error:", e.response?.data || e.message);
    return "⚠️ AI error, try again later";
  }
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body || "";

    const phoneId =
      req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    let businessId = Object.keys(clients).find(
      key =>
        String(clients[key].phone_number_id) === String(phoneId)
    );

    if (!businessId) {
      console.log("❌ No business match");
      return res.sendStatus(200);
    }

    const client = clients[businessId];

    // 🔥 ONLY OPENAI RESPONSE
    const reply = await getOpenAIReply(text);

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

    res.sendStatus(200);

  } catch (e) {
    console.log("❌ WEBHOOK ERROR:", e.response?.data || e.message);
    res.sendStatus(200);
  }
});

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 SERVER RUNNING"));