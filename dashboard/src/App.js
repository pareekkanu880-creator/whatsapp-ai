import React, { useState, useEffect } from "react";
import "./App.css";

import {
  LayoutDashboard,
  BarChart3,
  Calendar,
  CreditCard,
  Crown,
  LogOut
} from "lucide-react";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

const API = "https://whatsapp-ai-production-9fb5.up.railway.app";

function App() {
  const [page, setPage] = useState("dashboard");

  const [data, setData] = useState({
    bookings: 0,
    plan: "free",
    expiresAt: null
  });

  const [liveLeads, setLiveLeads] = useState([]);
  const [conversion, setConversion] = useState(0);
  const [revenue, setRevenue] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const token = localStorage.getItem("token");

  // ======================
  // SAFE FETCH
  // ======================
  const safeFetch = async (url, options = {}) => {
    try {
      const res = await fetch(url, options);
      return await res.json();
    } catch (err) {
      console.log("Fetch error:", err);
      return null;
    }
  };

  // ======================
  // LOAD DATA
  // ======================

  useEffect(() => {
    if (!token) return;

    safeFetch(`${API}/api/client-data`, {
      headers: { Authorization: token }
    }).then(d => d && setData(d));
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const interval = setInterval(async () => {
      const data = await safeFetch(`${API}/api/live-leads`, {
        headers: { Authorization: token }
      });

      if (data) {
        setLiveLeads(data);

        if (data.length > 0) {
          setNotifications(prev => [
            { text: "New Lead 🚀" },
            ...prev.slice(0, 2)
          ]);
        }
      }
    }, 5000); // optimized

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    safeFetch(`${API}/api/conversion`, {
      headers: { Authorization: token }
    }).then(d => d && setConversion(d.conversion));
  }, [token]);

  useEffect(() => {
    if (!token) return;

    safeFetch(`${API}/api/revenue`, {
      headers: { Authorization: token }
    }).then(d => d && setRevenue(d));
  }, [token]);

  useEffect(() => {
    if (!token) return;

    safeFetch(`${API}/api/bookings`, {
      headers: { Authorization: token }
    }).then(d => d && setBookings(d));
  }, [token]);

  // ======================
  // GROUP BOOKINGS
  // ======================
  const groupedBookings = bookings.reduce((acc, b) => {
    const date = new Date(b.date).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(b);
    return acc;
  }, {});

  // ======================
  // CHART DATA
  // ======================
  const chartData = revenue.map(r => ({
    name: new Date(r.date).toLocaleDateString(),
    amount: r.amount
  }));

  // ======================
  // PAYMENT
  // ======================
  const handleUpgrade = async () => {
    try {
      const order = await safeFetch(`${API}/api/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: token })
      });

      if (!window.Razorpay) {
        alert("Razorpay SDK not loaded");
        return;
      }

      const options = {
        key: "rzp_live_SYhxFosHQr1vtB",
        amount: order.amount,
        currency: "INR",
        name: "AI Salon",
        order_id: order.id,

        handler: async function (response) {
          const result = await safeFetch(`${API}/api/verify-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: token,
              ...response
            })
          });

          if (result?.success) {
            setNotifications(prev => [
              { text: "Payment Successful 💰" },
              ...prev
            ]);
            window.location.reload();
          }
        }
      };

      new window.Razorpay(options).open();

    } catch {
      alert("Payment failed ❌");
    }
  };

  // ======================
  // UI
  // ======================

  return (
    <div className="app">

      <div className="sidebar">
        <h2>🔥 AI Salon</h2>

        <div className={`nav-item ${page==="dashboard"?"active":""}`} onClick={()=>setPage("dashboard")}>
          <LayoutDashboard size={18}/> Dashboard
        </div>

        <div className={`nav-item ${page==="analytics"?"active":""}`} onClick={()=>setPage("analytics")}>
          <BarChart3 size={18}/> Analytics
        </div>

        <div className={`nav-item ${page==="calendar"?"active":""}`} onClick={()=>setPage("calendar")}>
          <Calendar size={18}/> Calendar
        </div>

        <div className={`nav-item ${page==="plan"?"active":""}`} onClick={()=>setPage("plan")}>
          <Crown size={18}/> Plan
        </div>

        <div className="nav-item logout" onClick={()=>{
          localStorage.removeItem("token");
          window.location.reload();
        }}>
          <LogOut size={18}/> Logout
        </div>
      </div>

      <div className="main">

        <div className="topbar">
          <h2>{page.toUpperCase()}</h2>
          <button className="upgrade" onClick={handleUpgrade}>
            <CreditCard size={16}/> Upgrade
          </button>
        </div>

        {notifications.map((n,i)=>(
          <div key={i} className="notification">🔔 {n.text}</div>
        ))}

        {page==="dashboard" && (
          <>
            <div className="cards">
              <div className="card"><p>Leads</p><h2>{liveLeads.length}</h2></div>
              <div className="card"><p>Bookings</p><h2>{data.bookings}</h2></div>
              <div className="card"><p>Conversion</p><h2>{conversion}%</h2></div>
            </div>

            <div className="chat-box">
              {liveLeads.slice().reverse().map((l,i)=>(
                <div key={i} className="chat-msg">
                  <b>{l.phone}</b>: {l.message}
                </div>
              ))}
            </div>

            <div className="insights">
              <h3>🧠 AI Insights</h3>
              <p>Conversion: {conversion}%</p>
              <p>Revenue: ₹{revenue.reduce((s,r)=>s+r.amount,0)}</p>
            </div>
          </>
        )}

        {page==="analytics" && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name"/>
              <YAxis/>
              <Tooltip/>
              <Line type="monotone" dataKey="amount" stroke="#22c55e"/>
            </LineChart>
          </ResponsiveContainer>
        )}

        {page==="calendar" && (
          <div className="calendar">
            {Object.keys(groupedBookings).map((date,i)=>(
              <div key={i} className="calendar-card">
                <h3>{date}</h3>
                {groupedBookings[date].map((b,j)=>(
                  <p key={j}>📞 {b.phone} — {b.time}</p>
                ))}
              </div>
            ))}
          </div>
        )}

        {page==="plan" && (
          <div className="card">
            <h2>{data.plan}</h2>
            {data.expiresAt && (
              <p>Expires: {new Date(data.expiresAt).toDateString()}</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;