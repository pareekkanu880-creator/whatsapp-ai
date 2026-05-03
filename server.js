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

const PORT = process.env.PORT || 3000;

// ================= INIT =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ================= DATABASE =================
function load(file, fallback) {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : fallback;
  } catch {
    return fallback;
  }
}

let users = load("users.json", {});
let clients = load("clients.json", {});
let bookings = load("bookings.json", []);
let leads = load("leads.json", {});
let revenue = load("revenue.json", []);
let memory = load("memory.json", {});
let followups = load("followups.json", []);

function saveAll() {
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  fs.writeFileSync("clients.json", JSON.stringify(clients, null, 2));
  fs.writeFileSync("bookings.json", JSON.stringify(bookings, null, 2));
  fs.writeFileSync("leads.json", JSON.stringify(leads, null, 2));
  fs.writeFileSync("revenue.json", JSON.stringify(revenue, null, 2));
  fs.writeFileSync("memory.json", JSON.stringify(memory, null, 2));
  fs.writeFileSync("followups.json", JSON.stringify(followups, null, 2));
}

// ================= AUTH =================
app.post("/api/register", (req, res) => {
  const { email, password, businessName } = req.body;

  users[email] = { password, plan: "free", expiresAt: null };

  clients[email] = {
    name: businessName,
    services: { Haircut: 300, Facial: 800, Beard: 200 },
    timings: "10 AM - 8 PM",
    availableSlots: ["10:00", "12:00", "14:00", "16:00"],
    phone_number_id: process.env.PHONE_NUMBER_ID
  };

  saveAll();
  res.send({ success: true });
});

// ================= DASHBOARD =================
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

// ================= AI ENGINE =================
function AI(userId, message, businessId) {
  const client = clients[businessId];
  const msg = message.toLowerCase().trim();

  if (!memory[userId]) {
    memory[userId] = { step: "start", service: null };
  }

  const user = memory[userId];

  const isGreeting = /hi|hello|hey|hii/.test(msg);
  const isPrice = /price|cost|kitna|rate|charges/.test(msg);
  const isBook = /book|appointment|karna|reserve/.test(msg);
  const isTime = /time|timing|open/.test(msg);

  const service = Object.keys(client.services).find(s =>
    msg.includes(s.toLowerCase())
  );

  if (isGreeting) {
    return `Hey 👋 Welcome to ${client.name}!

Type "menu" or say "book haircut" 😊`;
  }

  if (isPrice) {
    let text = "💼 Services:\n\n";
    Object.entries(client.services).forEach(([s, p]) => {
      text += `• ${s}: ₹${p}\n`;
    });
    return text + "\nWhich one would you like?";
  }

  if (isTime) {
    return `🕒 Timings: ${client.timings}`;
  }

  if (isBook || service) {
    user.service = service || "Haircut";
    user.step = "slot";

    return `Great 😎

Choose slot:
${client.availableSlots.join(" | ")}`;
  }

  if (user.step === "slot" && client.availableSlots.includes(message)) {
    bookings.push({
      phone: userId,
      service: user.service,
      time: message,
      businessId,
      date: new Date().toLocaleDateString()
    });

    revenue.push({
      businessId,
      amount: client.services[user.service],
      date: new Date()
    });

    followups.push({
      phone: userId,
      businessId,
      time: Date.now() + 3600000,
      sent: false
    });

    user.step = "done";

    return `✅ Booked for ${message}

💳 Payment link coming...`;
  }

  return `Say menu or book 😊`;
}

// ================= PAYMENT =================
app.post("/api/create-order", async (req, res) => {
  const order = await razorpay.orders.create({
    amount: 49900,
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
    users[email].plan = "pro";
    users[email].expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    saveAll();
    return res.send({ success: true });
  }

  res.send({ success: false });
});

// ================= FOLLOWUP =================
setInterval(async () => {
  for (let f of followups) {
    if (!f.sent && Date.now() > f.time) {
      const client = clients[f.businessId];

      await axios.post(
        `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
        {
          messaging_product: "whatsapp",
          to: f.phone,
          text: { body: "Hey 😊 Need help with your booking?" }
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
          }
        }
      );

      f.sent = true;
    }
  }
}, 60000);

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const from = msg.from;
    const text = msg.text?.body || "";

    console.log("📩 Incoming:", text);

    const phoneId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    const businessId = Object.keys(clients).find(
      key => clients[key].phone_number_id === phoneId
    );

    if (!businessId) return;

    const reply = AI(from, text, businessId);

    console.log("🤖 Reply:", reply);

    const client = clients[businessId];

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

    if (/^\d{2}:\d{2}$/.test(text)) {
      const amount = Object.values(client.services)[0];

      const link = await razorpay.paymentLink.create({
        amount: amount * 100,
        currency: "INR",
        description: "Booking Payment",
        customer: { contact: from }
      });

      await axios.post(
        `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: `💳 Pay here:\n${link.short_url}` }
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
          }
        }
      );
    }

    saveAll();
  } catch (e) {
    console.log("ERROR:", e.message);
  }
});

// ================= START =================
app.listen(PORT, () => console.log("🔥 SERVER RUNNING", PORT));