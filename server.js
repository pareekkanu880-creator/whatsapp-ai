// Full Final Enterprise Production-Safe server.js
// Gemini Decision Engine + Backend Execution Engine
// Full Automatic AI SaaS Architecture
// No removals • No downgrades • No fallback replies • No robotic logic

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const Razorpay = require("razorpay");
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
  model: "gemini-1.5-flash-latest"
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

function saveLead(businessId, userId, score, message) {
  if (!leads[businessId]) {
    leads[businessId] = [];
  }

  const existing = leads[businessId].find(
    (lead) => lead.userId === userId
  );

  if (existing) {
    existing.score = Math.max(existing.score, score || 1);
    existing.lastMessage = message;
    existing.updatedAt = new Date();
  } else {
    leads[businessId].push({
      userId,
      score: score || 1,
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
// GEMINI DECISION ENGINE
// =====================================================

async function getGeminiDecision(userId, message, businessId) {
  if (!memory[userId]) {
    memory[userId] = {
      history: [],
      profile: {},
      behavior: {
        visits: 0
      }
    };
  }

  const user = memory[userId];
  const client = clients[businessId];

  user.behavior.visits += 1;

  user.history.push({
    message,
    time: new Date()
  });

  if (user.history.length > 20) {
    user.history = user.history.slice(-20);
  }

  const recentHistory = user.history
    .slice(-8)
    .map((h) => `User: ${h.message}`)
    .join("\n");

  const prompt = `
You are the complete operating brain of an enterprise WhatsApp AI SaaS.

You make ALL business decisions.

Backend only executes your decisions.

Business:
Name: ${client.name}
Type: ${client.businessType}
Services: ${JSON.stringify(client.services)}
Timings: ${client.timings}
Available Slots: ${JSON.stringify(client.availableSlots)}

Customer:
Repeat Visits: ${user.behavior.visits}

Recent Conversation:
${recentHistory}

You must decide:
- booking intent
- slot reservation
- payment requirement
- pricing response
- timing response
- lead score
- hot lead detection
- follow-up requirement
- objection handling
- upselling
- emotional understanding
- premium conversion
- abandoned booking recovery
- pending payment recovery

Return ONLY valid JSON like this:

{
  "reply": "natural human reply here",
  "leadScore": 8,
  "needsFollowup": true,
  "followupReason": "pricing_interest",
  "paymentRequired": false,
  "bookingRequested": false,
  "preferredSlot": null
}

No markdown.
No explanation.
Only JSON.

User Message:
${message}
`;

  const result = await geminiModel.generateContent(prompt);
  const response = await result.response;
  const raw = response.text();

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.log("❌ JSON PARSE ERROR:", raw);
    throw e;
  }
}

// =====================================================
// MAIN AI EXECUTION ENGINE
// =====================================================

async function getSmartAI(userId, message, businessId) {
  const decision = await getGeminiDecision(
    userId,
    message,
    businessId
  );

  const client = clients[businessId];

  saveLead(
    businessId,
    userId,
    decision.leadScore,
    message
  );

  if (decision.needsFollowup) {
    addFollowup(
      userId,
      businessId,
      decision.followupReason || "general"
    );
  }

  if (decision.bookingRequested) {
    const today = new Date()
      .toISOString()
      .split("T")[0];

    const slots = getAvailableSlots(
      today,
      businessId
    );

    if (decision.preferredSlot) {
      const amount =
        Object.values(client.services)[0] || 500;

      bookings.push({
        phone: userId,
        date: new Date(),
        time: decision.preferredSlot,
        businessId
      });

      revenue.push({
        businessId,
        amount,
        date: new Date()
      });

      if (decision.paymentRequired) {
        addPendingPayment(
          userId,
          businessId,
          amount
        );
      }

      saveAll();

      return {
        reply: decision.reply,
        paymentRequired: decision.paymentRequired,
        amount
      };
    }

    saveAll();

    return {
      reply: `${decision.reply}

📅 Available slots today:

${slots.join("\n")}`,
      paymentRequired: false
    };
  }

  saveAll();

  return {
    reply: decision.reply,
    paymentRequired: decision.paymentRequired
  };
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
      req.body.entry?.[0]?.changes?.[0]?.value
        ?.metadata?.phone_number_id;

    const businessId = Object.keys(clients).find(
      (key) =>
        String(clients[key].phone_number_id) ===
        String(phoneId)
    );

    if (!businessId) {
      return res.sendStatus(200);
    }

    const client = clients[businessId];

    const aiResult = await getSmartAI(
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
          body: aiResult.reply
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (aiResult.paymentRequired) {
      const paymentLink = await createPaymentLink(
        aiResult.amount || 500,
        from
      );

      if (paymentLink) {
        await axios.post(
          `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: {
              body: `💳 Complete your payment here:

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