// Full Final Enterprise Production-Safe server.js
// Smart AI + Revenue Automation + CRM + Multi-Business Platform
// Gemini = Primary Intelligence Layer
// Stable Railway Deploy + No Downgrades + No Feature Removal

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// =====================================================
// INIT
// =====================================================

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "test",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "test"
});

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || "test"
);

const geminiModel = genAI.getGenerativeModel({
  model: "gemini-pro"
});

// =====================================================
// SAFE JSON LOAD
// =====================================================

function loadJSON(file, fallback) {
  try {
    return fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file))
      : fallback;
  } catch (e) {
    console.log(`❌ Error loading ${file}:`, e.message);
    return fallback;
  }
}

let users = loadJSON("users.json", {});
let clients = loadJSON("clients.json", {});
let leads = loadJSON("leads.json", {});
let bookings = loadJSON("bookings.json", []);
let memory = loadJSON("memory.json", {});
let revenue = loadJSON("revenue.json", []);
let followups = loadJSON("followups.json", []);
let paymentsPending = loadJSON("paymentsPending.json", []);

// =====================================================
// SAVE
// =====================================================

function saveAll() {
  try {
    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
    fs.writeFileSync("clients.json", JSON.stringify(clients, null, 2));
    fs.writeFileSync("leads.json", JSON.stringify(leads, null, 2));
    fs.writeFileSync("bookings.json", JSON.stringify(bookings, null, 2));
    fs.writeFileSync("memory.json", JSON.stringify(memory, null, 2));
    fs.writeFileSync("revenue.json", JSON.stringify(revenue, null, 2));
    fs.writeFileSync("followups.json", JSON.stringify(followups, null, 2));
    fs.writeFileSync(
      "paymentsPending.json",
      JSON.stringify(paymentsPending, null, 2)
    );
  } catch (e) {
    console.log("❌ SAVE ERROR:", e.message);
  }
}

// =====================================================
// BASIC ROUTES
// =====================================================

app.get("/", (req, res) => {
  res.send("🚀 Enterprise WhatsApp AI SaaS Running");
});

app.get("/privacy", (req, res) => {
  res.send("Privacy Policy");
});

app.get("/terms", (req, res) => {
  res.send("Terms of Service");
});

app.get("/delete", (req, res) => {
  res.send("Data Deletion Page");
});

// =====================================================
// WEBHOOK VERIFY
// =====================================================

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }

  res.sendStatus(403);
});

// =====================================================
// REGISTER
// =====================================================

app.post("/api/register", (req, res) => {
  const {
    email,
    password,
    businessName,
    businessType,
    services,
    timings,
    availableSlots
  } = req.body;

  users[email] = {
    password,
    plan: "free",
    expiresAt: null
  };

  clients[email] = {
    name: businessName || "My Business",
    businessType: businessType || "general",
    services:
      services || {
        consultation: 500
      },
    timings: timings || "10:00 AM to 8:00 PM",
    availableSlots:
      availableSlots || [
        "10:00",
        "12:00",
        "14:00",
        "16:00",
        "18:00"
      ],
    token: process.env.WHATSAPP_TOKEN,
    phone_number_id: process.env.PHONE_NUMBER_ID
  };

  saveAll();

  res.send({
    success: true,
    message: "Registered successfully"
  });
});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  if (!users[email] || users[email].password !== password) {
    return res.send({
      success: false,
      error: "Invalid login"
    });
  }

  res.send({
    success: true,
    token: email
  });
});

// =====================================================
// DASHBOARD
// =====================================================

app.get("/api/client-data", (req, res) => {
  const email = req.headers.authorization;

  const userLeads = leads[email] || [];
  const userBookings = bookings.filter(
    (b) => b.businessId === email
  );
  const userRevenue = revenue.filter(
    (r) => r.businessId === email
  );
  const pendingPayments = paymentsPending.filter(
    (p) => p.businessId === email && !p.paid
  );

  const totalRevenue = userRevenue.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const hotLeads = userLeads.filter(
    (lead) => lead.score >= 7
  ).length;

  const conversion =
    userLeads.length === 0
      ? 0
      : (
          (userBookings.length / userLeads.length) *
          100
        ).toFixed(1);

  res.send({
    leads: userLeads.length,
    hotLeads,
    bookings: userBookings.length,
    revenue: totalRevenue,
    pendingPayments: pendingPayments.length,
    conversion,
    businessType: clients[email]?.businessType || "general",
    plan: users[email]?.plan || "free"
  });
});

// =====================================================
// HELPERS
// =====================================================

function getAvailableSlots(date, businessId) {
  const client = clients[businessId];

  const allSlots =
    client?.availableSlots || [
      "10:00",
      "12:00",
      "14:00",
      "16:00",
      "18:00"
    ];

  const bookedSlots = bookings
    .filter(
      (b) =>
        b.businessId === businessId &&
        String(b.date).slice(0, 10) === date
    )
    .map((b) => b.time);

  return allSlots.filter(
    (slot) => !bookedSlots.includes(slot)
  );
}

function calculateLeadScore(message) {
  const msg = message.toLowerCase();
  let score = 1;

  if (/price|pricing|cost/.test(msg)) score += 2;
  if (/book|appointment|today|tomorrow/.test(msg)) score += 4;
  if (/premium|urgent|best|vip|wedding/.test(msg)) score += 3;
  if (/yes|okay|sure/.test(msg)) score += 2;

  return Math.min(score, 10);
}

function saveLead(businessId, userId, message) {
  if (!leads[businessId]) {
    leads[businessId] = [];
  }

  const score = calculateLeadScore(message);

  const existing = leads[businessId].find(
    (lead) => lead.userId === userId
  );

  if (existing) {
    existing.score = Math.max(existing.score, score);
    existing.lastMessage = message;
    existing.updatedAt = new Date();
  } else {
    leads[businessId].push({
      userId,
      score,
      lastMessage: message,
      updatedAt: new Date()
    });
  }
}

function addFollowup(userId, businessId, reason) {
  followups.push({
    userId,
    businessId,
    reason,
    createdAt: new Date(),
    done: false
  });
}

function addPendingPayment(userId, businessId, amount) {
  paymentsPending.push({
    userId,
    businessId,
    amount,
    createdAt: new Date(),
    paid: false
  });
}

async function createPaymentLink(amount, phone) {
  try {
    const link = await razorpay.paymentLink.create({
      amount: amount * 100,
      currency: "INR",
      description: "Booking Payment",
      customer: {
        contact: phone
      }
    });

    return link.short_url;
  } catch (e) {
    console.log("❌ PAYMENT ERROR:", e.message);
    return null;
  }
}

// =====================================================
// GEMINI PRIMARY BRAIN
// =====================================================

async function getGeminiReply(message, client, user) {
  try {
    const historyText = (user.history || [])
      .slice(-8)
      .map((item) => `User: ${item.message}`)
      .join("\n");

    const prompt = `
You are an elite premium AI WhatsApp business assistant.

Business Name: ${client.name}
Business Type: ${client.businessType}
Services: ${JSON.stringify(client.services)}
Business Timings: ${client.timings}

Customer Profile:
Customer Type: ${user.profile.customerType || "normal"}
Repeat Customer: ${user.behavior.repeatCustomer ? "Yes" : "No"}
Preferred Time: ${user.profile.preferredTime || "Unknown"}

Recent Conversation:
${historyText}

Rules:
- Sound like ChatGPT
- Human natural replies only
- Never robotic
- Never generic
- Build trust naturally
- Soft premium upsell
- Handle objections intelligently
- Understand emotions deeply
- Increase booking conversion
- Never use robotic lines like:
  "I can help with bookings and pricing"

Customer Message:
${message}

Reply naturally:
`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (text && text.trim()) {
      return text.trim();
    }

    return null;
  } catch (e) {
    console.log("❌ Gemini Error:", e.message);
    return null;
  }
}

// =====================================================
// MAIN SMART AI ENGINE
// =====================================================

async function getSmartAI(userId, message, businessId) {
  if (!memory[userId]) {
    memory[userId] = {
      history: [],
      profile: {
        customerType: "normal",
        preferredTime: null
      },
      behavior: {
        visits: 0,
        repeatCustomer: false
      },
      bookingFlow: {
        waitingForSlot: false
      }
    };
  }

  const user = memory[userId];
  const client = clients[businessId];
  const msg = message.trim();
  const msgLower = msg.toLowerCase();

  // Smart memory update

  user.behavior.visits += 1;

  if (user.behavior.visits > 2) {
    user.behavior.repeatCustomer = true;
  }

  if (/premium|luxury|vip|best/.test(msgLower)) {
    user.profile.customerType = "premium";
  }

  if (/cheap|budget|discount/.test(msgLower)) {
    user.profile.customerType = "budget";
  }

  user.history.push({
    message: msg,
    time: new Date()
  });

  if (user.history.length > 20) {
    user.history = user.history.slice(-20);
  }

  saveLead(businessId, userId, msg);

  // Protected booking flow only

  if (/book|booking|appointment|slot|reserve/.test(msgLower)) {
    const today = new Date().toISOString().split("T")[0];
    const slots = getAvailableSlots(today, businessId);

    user.bookingFlow.waitingForSlot = true;
    addFollowup(userId, businessId, "booking_started");

    saveAll();

    return `📅 Available slots for today:

${slots.join("\n")}

Reply with your preferred time 😊`;
  }

  if (
    user.bookingFlow.waitingForSlot &&
    /^\d{2}:\d{2}$/.test(msg)
  ) {
    const amount =
      Object.values(client.services)[0] || 500;

    bookings.push({
      phone: userId,
      date: new Date(),
      time: msg,
      businessId
    });

    revenue.push({
      businessId,
      amount,
      date: new Date()
    });

    addPendingPayment(userId, businessId, amount);

    user.bookingFlow.waitingForSlot = false;
    user.profile.preferredTime = msg;

    saveAll();

    return `✅ Your slot is temporarily reserved for ${msg}

⏳ Complete payment within 15 minutes.

Payment link will be shared shortly 😊`;
  }

  // Pricing + timings still protected for reliability

  if (/price|pricing|cost|fees|charges/.test(msgLower)) {
    let pricingText = `💼 ${client.name} Services:

`;

    Object.keys(client.services).forEach((service) => {
      pricingText += `• ${service}: ₹${client.services[service]}\n`;
    });

    pricingText += `
Would you like help choosing the best option? 😊`;

    addFollowup(userId, businessId, "pricing_interest");

    saveAll();
    return pricingText;
  }

  if (/time|timing|hours|open|close/.test(msgLower)) {
    saveAll();

    return `🕒 Our timings are:

${client.timings}

We look forward to serving you 😊`;
  }

  // Gemini primary intelligence

  const aiReply = await getGeminiReply(
    message,
    client,
    user
  );

  saveAll();

  return aiReply || `Tell me a little more so I can help you better 😊`;
}

// =====================================================
// WEBHOOK
// =====================================================

app.post("/webhook", async (req, res) => {
  try {
    const msg =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body || "";

    const phoneId =
      req.body.entry?.[0]?.changes?.[0]?.value?.metadata
        ?.phone_number_id;

    const businessId = Object.keys(clients).find(
      (key) =>
        String(clients[key].phone_number_id) ===
        String(phoneId)
    );

    if (!businessId) {
      return res.sendStatus(200);
    }

    const client = clients[businessId];

    const reply = await getSmartAI(
      from,
      text,
      businessId
    );

    await axios.post(
      `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: {
          body: reply
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (
      /^\d{2}:\d{2}$/.test(text) &&
      memory[from]?.bookingFlow?.waitingForSlot === false
    ) {
      const amount =
        Object.values(client.services)[0] || 500;

      const paymentLink = await createPaymentLink(
        amount,
        from
      );

      if (paymentLink) {
        await axios.post(
          `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: {
              body: `💳 Complete your booking payment here:

${paymentLink}`
            }
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.log(
      "❌ WEBHOOK ERROR:",
      e.response?.data || e.message
    );

    res.sendStatus(200);
  }
});

// =====================================================
// START
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>
  console.log("🔥 SERVER RUNNING ON PORT", PORT)
);