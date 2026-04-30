// Full Final Enterprise Production-Safe server.js
// Smart AI + Revenue Automation + CRM + Multi-Business Platform
// NO REMOVALS • NO DOWNGRADES • ONLY UPGRADES
// Fixed: 429 Rate Limits, 503 Busy Errors, and Duplicate Message Bugs

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

// Switch to 1.5-flash for production stability (Higher Quota)
const geminiModel = genAI.getGenerativeModel(
  { model: "gemini-1.5-flash" }
);

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
// ASYNC SAVE (Prevents Server Lag)
// =====================================================

async function saveAll() {
  try {
    const data = { users, clients, leads, bookings, memory, revenue, followups, paymentsPending };
    await Promise.all(
      Object.keys(data).map(key => 
        fs.promises.writeFile(`${key}.json`, JSON.stringify(data[key], null, 2))
      )
    );
  } catch (e) {
    console.log("❌ SAVE ERROR:", e.message);
  }
}

// =====================================================
// BASIC ROUTES
// =====================================================

app.get("/", (req, res) => res.send("🚀 Enterprise WhatsApp AI SaaS Running"));
app.get("/privacy", (req, res) => res.send("Privacy Policy"));
app.get("/terms", (req, res) => res.send("Terms of Service"));
app.get("/delete", (req, res) => res.send("Data Deletion Page"));

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
// REGISTER / LOGIN / DASHBOARD
// =====================================================

app.post("/api/register", (req, res) => {
  const { email, password, businessName, businessType, services, timings, availableSlots } = req.body;
  users[email] = { password, plan: "free", expiresAt: null };
  clients[email] = {
    name: businessName || "My Business",
    businessType: businessType || "general",
    services: services || { consultation: 500 },
    timings: timings || "10:00 AM to 8:00 PM",
    availableSlots: availableSlots || ["10:00", "12:00", "14:00", "16:00", "18:00"],
    token: process.env.WHATSAPP_TOKEN,
    phone_number_id: process.env.PHONE_NUMBER_ID
  };
  saveAll();
  res.send({ success: true, message: "Registered successfully" });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!users[email] || users[email].password !== password) return res.send({ success: false, error: "Invalid login" });
  res.send({ success: true, token: email });
});

app.get("/api/client-data", (req, res) => {
  const email = req.headers.authorization;
  const userLeads = leads[email] || [];
  const userBookings = bookings.filter((b) => b.businessId === email);
  const userRevenue = revenue.filter((r) => r.businessId === email);
  const pendingPayments = paymentsPending.filter((p) => p.businessId === email && !p.paid);
  const totalRevenue = userRevenue.reduce((sum, item) => sum + item.amount, 0);
  const hotLeads = userLeads.filter((lead) => lead.score >= 7).length;
  const conversion = userLeads.length === 0 ? 0 : ((userBookings.length / userLeads.length) * 100).toFixed(1);
  res.send({ leads: userLeads.length, hotLeads, bookings: userBookings.length, revenue: totalRevenue, pendingPayments: pendingPayments.length, conversion, businessType: clients[email]?.businessType || "general", plan: users[email]?.plan || "free" });
});

// =====================================================
// SLOT SYSTEM / LEAD SCORING / FOLLOWUPS
// =====================================================

function getAvailableSlots(date, businessId) {
  const client = clients[businessId];
  const allSlots = client?.availableSlots || ["10:00", "12:00", "14:00", "16:00", "18:00"];
  const bookedSlots = bookings.filter((b) => b.businessId === businessId && b.date === date).map((b) => b.time);
  return allSlots.filter((slot) => !bookedSlots.includes(slot));
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
  if (!leads[businessId]) leads[businessId] = [];
  const existing = leads[businessId].find((lead) => lead.userId === userId);
  const score = calculateLeadScore(message);
  if (existing) {
    existing.score = Math.max(existing.score, score);
    existing.lastMessage = message;
    existing.updatedAt = new Date();
  } else {
    leads[businessId].push({ userId, score, lastMessage: message, updatedAt: new Date() });
  }
}

function addFollowup(userId, businessId, reason) {
  followups.push({ userId, businessId, reason, createdAt: new Date(), done: false });
}

function addPendingPayment(userId, businessId, amount) {
  paymentsPending.push({ userId, businessId, amount, createdAt: new Date(), paid: false });
}

async function createPaymentLink(amount, phone) {
  try {
    const link = await razorpay.paymentLink.create({ amount: amount * 100, currency: "INR", description: "Booking Payment", customer: { contact: phone } });
    return link.short_url;
  } catch (e) { return null; }
}

// =====================================================
// INTENT DETECTION
// =====================================================

function detectIntent(message) {
  const msg = message.toLowerCase().trim();
  if (/^hi$|^hello$|^hey$/.test(msg)) return "greeting";
  if (/price|pricing|cost|fees/.test(msg)) return "pricing";
  if (/book|booking|appointment|slot/.test(msg)) return "booking";
  if (/time|timing|open|close/.test(msg)) return "timing";
  if (/expensive|costly|too much/.test(msg)) return "price_objection";
  if (/sad|stress|tired|low/.test(msg)) return "emotion_low";
  if (/wedding|party|event|special/.test(msg)) return "event_need";
  return "general";
}

function detectCustomerType(message) {
  const msg = message.toLowerCase();
  if (/premium|luxury|vip|best/.test(msg)) return "premium";
  if (/cheap|budget|discount/.test(msg)) return "budget";
  return "normal";
}

// =====================================================
// GEMINI AI (WITH RETRY ENGINE)
// =====================================================

async function getGeminiReply(message, client, user, retries = 3) {
  try {
    const prompt = `You are a premium AI WhatsApp assistant.
Business Name: ${client.name}
Business Type: ${client.businessType}
Services: ${JSON.stringify(client.services)}
Timings: ${client.timings}
Customer Type: ${user.profile.customerType || "normal"}
Rules: Reply like ChatGPT, Human + premium tone, Build trust, Convert to booking.
Customer Message: ${message}`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    return response.text() || null;
  } catch (e) {
    // FIX: Retry on 429 (Rate Limit) or 503 (Busy)
    if ((e.status === 429 || e.status === 503) && retries > 0) {
      console.log(`⚠️ Gemini Error ${e.status}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return getGeminiReply(message, client, user, retries - 1);
    }
    return null;
  }
}

// =====================================================
// MAIN SMART AI ENGINE (RESTORED FULL LOGIC)
// =====================================================

async function getSmartAI(userId, message, businessId) {
  if (!memory[userId]) {
    memory[userId] = {
      profile: { customerType: "normal", preferredTime: null },
      behavior: { visits: 0, repeatCustomer: false },
      bookingFlow: { waitingForSlot: false }
    };
  }

  const user = memory[userId];
  const client = clients[businessId];
  const msg = message.trim();
  const intent = detectIntent(msg);

  user.behavior.visits += 1;
  user.profile.customerType = detectCustomerType(msg);
  if (user.behavior.visits > 2) user.behavior.repeatCustomer = true;

  saveLead(businessId, userId, msg);

  // GREETING LOGIC
  if (intent === "greeting") {
    if (user.behavior.repeatCustomer) return `Welcome back 😊 Great to see you again. How can I help you today?`;
    return `Hey 👋 Welcome to ${client.name}! I can help with bookings, pricing and recommendations 😊`;
  }

  // PRICING LOGIC
  if (intent === "pricing") {
    addFollowup(userId, businessId, "pricing_interest");
    let text = "💼 Our Services:\n\n";
    Object.keys(client.services).forEach((service) => { text += `• ${service}: ₹${client.services[service]}\n`; });
    text += "\nWould you like help choosing the best option? 😊";
    return text;
  }

  // TIMING LOGIC
  if (intent === "timing") return `🕒 Our timings are:\n\n${client.timings}`;

  // PRICE OBJECTION LOGIC
  if (intent === "price_objection") {
    if (user.profile.customerType === "budget") return `No worries 😊 We also have smaller packages depending on your budget. I can help you choose the best one.`;
    return `I understand 😊 Many customers prefer our value packages because they give better long-term results and experience.`;
  }

  // EMOTIONAL SUPPORT LOGIC
  if (intent === "emotion_low") return `That sounds exhausting 😔 Sometimes a premium relaxing session really helps you feel refreshed. Want me to suggest something comfortable for you?`;

  // SPECIAL EVENT LOGIC
  if (intent === "event_need") return `For special events, many customers prefer our premium package ✨ Would you like me to help you book the best option?`;

  // BOOKING START LOGIC
  if (intent === "booking") {
    const today = new Date().toISOString().split("T")[0];
    const slots = getAvailableSlots(today, businessId);
    user.bookingFlow.waitingForSlot = true;
    return `📅 Available slots for today:\n\n${slots.join("\n")}\n\nReply with your preferred time 😊`;
  }

  // SLOT SELECTED LOGIC
  if (user.bookingFlow.waitingForSlot && /^\d{2}:\d{2}$/.test(msg)) {
    const amount = Object.values(client.services)[0] || 500;
    bookings.push({ phone: userId, date: new Date(), time: msg, businessId });
    user.bookingFlow.waitingForSlot = false;
    user.profile.preferredTime = msg;
    revenue.push({ businessId, amount, date: new Date() });
    addPendingPayment(userId, businessId, amount);
    return `✅ Your slot is temporarily reserved for ${msg}\n\n⏳ Complete payment within 15 minutes. Payment link will be shared shortly 😊`;
  }

  // GEMINI FALLBACK
  const aiReply = await getGeminiReply(message, client, user);
  return aiReply || "🤖 I can help with bookings, pricing and support 😊";
}

// =====================================================
// WEBHOOK (PROTECTED FROM DUPLICATE CALLS)
// =====================================================

app.post("/webhook", async (req, res) => {
  // CRITICAL: Respond 200 immediately to stop WhatsApp from retrying while AI thinks
  res.sendStatus(200);

  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return;

    const from = msg.from;
    const text = msg.text?.body || "";
    const phoneId = value?.metadata?.phone_number_id;

    const businessId = Object.keys(clients).find((key) => String(clients[key].phone_number_id) === String(phoneId));
    if (!businessId) return;

    const reply = await getSmartAI(from, text, businessId);

    // Send Main Message
    await axios.post(`https://graph.facebook.com/v18.0/${clients[businessId].phone_number_id}/messages`, {
      messaging_product: "whatsapp", to: from, text: { body: reply }
    }, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });

    // Send Payment Link if slot was selected
    if (/^\d{2}:\d{2}$/.test(text.trim()) && memory[from]?.bookingFlow?.waitingForSlot === false) {
      const amount = Object.values(clients[businessId].services)[0] || 500;
      const paymentLink = await createPaymentLink(amount, from);
      if (paymentLink) {
        await axios.post(`https://graph.facebook.com/v18.0/${clients[businessId].phone_number_id}/messages`, {
          messaging_product: "whatsapp", to: from, text: { body: `💳 Complete your booking payment here:\n\n${paymentLink}` }
        }, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
      }
    }

    saveAll(); // Async save
  } catch (e) {
    console.log("❌ WEBHOOK ERROR:", e.message);
  }
});

// =====================================================
// START
// =====================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 SERVER RUNNING ON PORT", PORT));