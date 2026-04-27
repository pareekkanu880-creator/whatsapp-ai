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

// =====================================================
// INIT
// =====================================================

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "test",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "test"
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
  } catch (e) {
    console.log("❌ SAVE ERROR:", e.message);
  }
}

// =====================================================
// BASIC ROUTES
// =====================================================

app.get("/", (req, res) => {
  res.send("🚀 WhatsApp AI SaaS Running");
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
// REGISTER (MULTI BUSINESS)
// =====================================================

app.post("/api/register", (req, res) => {
  const {
    email,
    password,
    businessName,
    services
  } = req.body;

  users[email] = {
    password,
    plan: "free",
    expiresAt: null
  };

  clients[email] = {
    name: businessName || "My Salon",
    services: services || {
      haircut: 300,
      facial: 800,
      beard: 200
    },
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
// DASHBOARD ANALYTICS
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

  const totalRevenue = userRevenue.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const conversion =
    userLeads.length === 0
      ? 0
      : (
          (userBookings.length / userLeads.length) *
          100
        ).toFixed(1);

  res.send({
    leads: userLeads.length,
    bookings: userBookings.length,
    revenue: totalRevenue,
    conversion,
    plan: users[email]?.plan || "free"
  });
});

// =====================================================
// SMART SLOT SYSTEM
// =====================================================

function getAvailableSlots(date, businessId) {
  const allSlots = [
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
        b.date === date
    )
    .map((b) => b.time);

  return allSlots.filter(
    (slot) => !bookedSlots.includes(slot)
  );
}

// =====================================================
// PAYMENT LINK
// =====================================================

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
// SMART HELPERS
// =====================================================

function detectIntent(message) {
  const msg = message.toLowerCase().trim();

  // Booking intent
  if (/book|booking|appointment|schedule|reserve|slot/.test(msg)) {
    return "booking";
  }

  // Pricing intent
  if (/price|pricing|prices|cost|rate|charge|pricings/.test(msg)) {
    return "pricing";
  }

  // Timing intent
  if (/time|timing|timings|hours|open|close/.test(msg)) {
    return "timing";
  }

  // Service recommendation
  if (
    /service|services|suggestion|suggest|recommend|recommendation|recommendations|service suggestion/.test(msg)
  ) {
    return "recommendation";
  }

  // Specific services
  if (
    /haircut|hair cut|beard|facial|spa|massage|grooming|beard styling/.test(msg)
  ) {
    return "specific_service";
  }

  // Greeting
  if (/hi|hii|hello|hey/.test(msg)) {
    return "greeting";
  }

  return "default";
}

function extractName(message) {
  const match = message.match(
    /my name is (\w+)/i
  );

  return match ? match[1] : null;
}

function detectInterest(message) {
  const msg = message.toLowerCase();

  if (/book|appointment|tomorrow|today/.test(msg))
    return "high";

  if (/price|details|cost/.test(msg))
    return "medium";

  return "low";
}

// =====================================================
// INTERNAL SMART AI ENGINE (NO OPENAI)
// =====================================================

function getSmartAI(userId, message, businessId) {
  if (
    !memory[userId] ||
    typeof memory[userId] !== "object"
  ) {
    memory[userId] = {
      history: [],
      profile: {
        name: null,
        preferences: [],
        lastService: null
      },
      behavior: {
        visits: 0,
        interestLevel: "low",
        lastSeen: null
      },
      bookingFlow: {
        waitingForSlot: false
      }
    };
  }

  const user = memory[userId];
  const client = clients[businessId];
  const msg = message.trim();
  const intent = detectIntent(msg);

  user.behavior.visits += 1;
  user.behavior.lastSeen = new Date();
  user.behavior.interestLevel =
    detectInterest(msg);

  const extractedName = extractName(msg);
  if (extractedName) {
    user.profile.name = extractedName;
    saveAll();
    return `Nice to meet you, ${extractedName} 😊 How can I help you today?`;
  }

  user.history.push(msg);

  // =========================================
  // GREETING
  // =========================================

  if (intent === "greeting") {
    if (user.profile.name) {
      saveAll();
      return `Welcome back ${user.profile.name} 👋 How can I help you today?`;
    }

    saveAll();
    return `Hey 👋 Welcome! I can help with bookings, pricing, timings and service suggestions 😊`;
  }

  // =========================================
  // PRICING
  // =========================================

  if (intent === "pricing") {
    let pricingText = "💇 Our Services:\n\n";

    Object.keys(client.services).forEach(
      (service) => {
        pricingText += `• ${service}: ₹${client.services[service]}\n`;
      }
    );

    pricingText +=
      "\nLet me know if you'd like to book 😊";

    saveAll();
    return pricingText;
  }

  // =========================================
  // TIMINGS
  // =========================================

  if (intent === "timing") {
    saveAll();
    return "🕒 We are open daily from 10 AM to 8 PM 😊";
  }

  // =========================================
  // EMOTIONAL RESPONSE
  // =========================================

  if (intent === "emotion_low") {
    saveAll();
    return "That sounds exhausting 😔 Sometimes a relaxing facial or grooming session really helps you feel refreshed. Want me to suggest something comfortable for you?";
  }

  // =========================================
  // EVENT BASED SELLING
  // =========================================

  if (intent === "event_need") {
    saveAll();
    return "Nice 😊 For special events, a fresh haircut + beard styling or facial works really well. Want me to help you book the best option?";
  }

  // =========================================
  // BOOKING START
  // =========================================

  if (intent === "booking") {
    const today =
      new Date().toISOString().split("T")[0];

    const slots = getAvailableSlots(
      today,
      businessId
    );

    user.bookingFlow.waitingForSlot = true;

    saveAll();

    return `📅 Available slots for today:\n\n${slots.join(
      "\n"
    )}\n\nReply with your preferred time 😊`;
  }

  // =========================================
  // SLOT SELECTED
  // =========================================

  if (
    user.bookingFlow.waitingForSlot &&
    /^\d{2}:\d{2}$/.test(msg)
  ) {
    const date =
      new Date().toISOString().split("T")[0];

    bookings.push({
      phone: userId,
      date,
      time: msg,
      businessId
    });

    user.bookingFlow.waitingForSlot = false;

    const amount =
      client.services.haircut || 300;

    revenue.push({
      businessId,
      amount,
      date: new Date()
    });

    saveAll();

    return `✅ Your slot is reserved for ${msg}\n\n💳 Payment confirmation link will be shared shortly.`;
  }

  // =========================================
  // SOFT UPSELL
  // =========================================

  if (
    user.behavior.interestLevel === "high"
  ) {
    saveAll();
    return "✨ We also have premium grooming packages and relaxing facial combos if you'd like something extra special 😊";
  }

  // =========================================
  // DEFAULT
  // =========================================

  saveAll();

  return "🤖 I can help with bookings, pricing, timings and recommendations. Tell me what you're looking for 😊";
}

// =====================================================
// WEBHOOK
// =====================================================

app.post("/webhook", async (req, res) => {
  try {
    const msg =
      req.body.entry?.[0]?.changes?.[0]?.value
        ?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body || "";

    const phoneId =
      req.body.entry?.[0]?.changes?.[0]?.value
        ?.metadata?.phone_number_id;

    const businessId = Object.keys(
      clients
    ).find(
      (key) =>
        String(
          clients[key].phone_number_id
        ) === String(phoneId)
    );

    if (!businessId) {
      console.log(
        "❌ No matching business found"
      );
      return res.sendStatus(200);
    }

    const client = clients[businessId];

    const reply = getSmartAI(
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
          "Content-Type":
            "application/json"
        }
      }
    );

    // payment link send after slot booking
    if (
      /^\d{2}:\d{2}$/.test(text) &&
      memory[from]?.bookingFlow
        ?.waitingForSlot === false
    ) {
      const amount =
        client.services.haircut || 300;

      const paymentLink =
        await createPaymentLink(
          amount,
          from
        );

      if (paymentLink) {
        await axios.post(
          `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
          {
            messaging_product:
              "whatsapp",
            to: from,
            text: {
              body: `💳 Complete your booking payment here:\n${paymentLink}`
            }
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
              "Content-Type":
                "application/json"
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

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () =>
  console.log(
    "🔥 SERVER RUNNING ON PORT",
    PORT
  )
);