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

// ===== SAFE JSON LOADER (UPGRADE 🔥) =====
function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const data = fs.readFileSync(file);
    return JSON.parse(data);
  } catch (e) {
    console.log(`❌ Error in ${file}, resetting...`);
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

// ===== SMART AI =====
function getSmartAI(userId, message) {
  if (!memory[userId]) {
    memory[userId] = { step: "start", context: {}, history: [] };
  }

  const user = memory[userId];
  const msg = message.toLowerCase();

  const intent = /book/.test(msg)
    ? "booking"
    : /price/.test(msg)
    ? "pricing"
    : /time/.test(msg)
    ? "timing"
    : /hi|hello/.test(msg)
    ? "greeting"
    : "unknown";

  if (intent === "booking" || user.step === "booking") {
    user.step = "booking";

    if (!user.context.date) {
      if (msg.match(/\d{4}-\d{2}-\d{2}/)) {
        user.context.date = message;
        return "Nice 👍 What time?";
      }
      return "📅 Enter date (YYYY-MM-DD)";
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

      return `✅ Booked\n${user.context.date} ${user.context.time}`;
    }
  }

  if (intent === "pricing") return "Haircut ₹300, Facial ₹800";
  if (intent === "timing") return "10 AM - 8 PM";
  if (intent === "greeting") return "Hey 👋 How can I help?";

  return "Type 'book' to start booking";
}
// ===== WHATSAPP =====
app.post("/webhook", async (req, res) => {
  // your webhook code
});


// ===== 🧪 TEST ROUTE (ADD HERE) =====
app.get("/test-send", async (req, res) => {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/YOUR_PHONE_NUMBER_ID/messages`,
      {
        messaging_product: "whatsapp",
        to: "YOUR_PERSONAL_NUMBER_WITH_COUNTRY_CODE",
        text: { body: "Test message 🚀" }
      },
      {
        headers: {
          Authorization: `Bearer YOUR_TOKEN`,
          "Content-Type": "application/json"
        }
      }
    );

    res.send("✅ Message sent");
  } catch (e) {
    console.log("ERROR:", e.response?.data || e.message);
    res.send("❌ Failed");
  }
});


// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 SERVER RUNNING"));