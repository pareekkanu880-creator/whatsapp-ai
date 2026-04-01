require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.use(express.json());

// ================= LOAD =================
let clientsDB = fs.existsSync("clients_db.json")
  ? JSON.parse(fs.readFileSync("clients_db.json"))
  : [];

let userMemory = fs.existsSync("memory.json")
  ? JSON.parse(fs.readFileSync("memory.json"))
  : {};

let bookings = fs.existsSync("bookings.json")
  ? JSON.parse(fs.readFileSync("bookings.json"))
  : [];

let userState = {};

function saveClients() {
  fs.writeFileSync("clients_db.json", JSON.stringify(clientsDB, null, 2));
}
function saveMemory() {
  fs.writeFileSync("memory.json", JSON.stringify(userMemory, null, 2));
}
function saveBookings() {
  fs.writeFileSync("bookings.json", JSON.stringify(bookings, null, 2));
}

// ================= HELPER =================
function getNextDates() {
  const dates = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

const slots = ["10:00 AM", "12:00 PM", "3:00 PM", "5:00 PM"];

// ================= AI =================
async function getAIReply(history, message) {
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a professional salon assistant.

- Talk like a human
- Keep replies short
- Help user choose services
- Push towards booking
- If user not interested → return NO_REPLY
`
        },
        ...history,
        { role: "user", content: message }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  return res.data.choices[0].message.content;
}

// ================= WEBHOOK VERIFY =================
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body || "";
    const lower = text.toLowerCase();

    const phoneId = entry.metadata.phone_number_id;
    const client = clientsDB.find(c => c.phone_number_id === phoneId);
    if (!client) return res.sendStatus(200);

    if (!userState[from]) userState[from] = { step: "none" };

    const clientUser = clientsDB.find(c => c.id === client.id);

    if (!clientUser.plan) clientUser.plan = "free";
    if (!clientUser.usage) clientUser.usage = 0;

    const FREE_LIMIT = 20;

    // ================= PAYMENT ACTIVATION =================
    if (userState[from].step === "awaiting_payment" && lower.includes("i paid")) {
      clientUser.plan = "pro";
      clientUser.usage = 0;
      saveClients();

      userState[from].step = "done";

      await axios.post(
        `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: "✅ Premium activated! Enjoy unlimited access 🚀" }
        },
        { headers: { Authorization: `Bearer ${client.token}` } }
      );

      return res.sendStatus(200);
    }

    // ================= FREE LIMIT =================
    if (clientUser.plan === "free") {
      clientUser.usage++;

      if (clientUser.usage > FREE_LIMIT) {

        userState[from].step = "awaiting_payment";
        saveClients();

        await axios.post(
          `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: {
              body: `🚫 Free plan finished.

💎 Upgrade to continue

💰 ₹999/month
📲 UPI: yourname@upi

After payment, type: I PAID`
            }
          },
          { headers: { Authorization: `Bearer ${client.token}` } }
        );

        return res.sendStatus(200);
      }

      saveClients();
    }

    // ================= BOOKING =================
    if (lower.includes("book")) {
      userState[from].step = "choose_date";

      const dates = getNextDates();

      await axios.post(
        `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: "📅 Choose date:\n" + dates.join("\n") }
        },
        { headers: { Authorization: `Bearer ${client.token}` } }
      );

      return res.sendStatus(200);
    }

    if (userState[from].step === "choose_date") {
      userState[from].date = text;
      userState[from].step = "choose_time";

      await axios.post(
        `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: "⏰ Choose time:\n" + slots.join("\n") }
        },
        { headers: { Authorization: `Bearer ${client.token}` } }
      );

      return res.sendStatus(200);
    }

    if (userState[from].step === "choose_time") {
      bookings.push({
        phone: from,
        date: userState[from].date,
        time: text
      });

      saveBookings();

      userState[from].step = "done";

      await axios.post(
        `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: {
            body: `✅ Booked!\n📅 ${userState[from].date}\n⏰ ${text}`
          }
        },
        { headers: { Authorization: `Bearer ${client.token}` } }
      );

      return res.sendStatus(200);
    }

    // ================= AI =================
    if (!userMemory[client.id]) userMemory[client.id] = {};
    if (!userMemory[client.id][from]) userMemory[client.id][from] = [];

    const history = userMemory[client.id][from];

    const reply = await getAIReply(history, text);

    if (reply === "NO_REPLY") return res.sendStatus(200);

    history.push({ role: "user", content: text });
    history.push({ role: "assistant", content: reply });
    saveMemory();

    await axios.post(
      `https://graph.facebook.com/v18.0/${client.phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      },
      { headers: { Authorization: `Bearer ${client.token}` } }
    );

    res.sendStatus(200);

  } catch (err) {
    console.log(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

// ================= START =================
app.listen(3000, () => console.log("🔥 SYSTEM RUNNING"));