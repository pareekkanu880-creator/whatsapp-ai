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
    total: 0,
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

  // ===== DATA LOAD =====
  useEffect(() => {
    if (!token) return;

    fetch(`${API}/api/client-data`, {
      headers: { Authorization: token }
    })
      .then(res => res.json())
      .then(setData);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      fetch(`${API}/api/live-leads`, {
        headers: { Authorization: token }
      })
        .then(res => res.json())
        .then(data => {
          setLiveLeads(data);

          if (data.length > 0) {
            setNotifications(prev => [
              { text: "New Lead Received 🚀" },
              ...prev
            ]);
          }
        });
    }, 3000);

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) return;

    fetch(`${API}/api/conversion`, {
      headers: { Authorization: token }
    })
      .then(res => res.json())
      .then(d => setConversion(d.conversion));
  }, [token]);

  useEffect(() => {
    fetch(`${API}/api/revenue`)
      .then(res => res.json())
      .then(setRevenue);
  }, []);

  useEffect(() => {
    if (!token) return;

    fetch(`${API}/api/bookings`, {
      headers: { Authorization: token }
    })
      .then(res => res.json())
      .then(setBookings);
  }, [token]);

  // ===== GROUP BOOKINGS BY DATE (NEW — NOT REMOVING ANYTHING)
  const groupedBookings = bookings.reduce((acc, b) => {
    const date = b.date || "Unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(b);
    return acc;
  }, {});

  // ===== FORMAT REVENUE (FIXED CHART)
  const chartData = revenue.map((r, i) => ({
    name: new Date(r.date).toLocaleDateString(),
    amount: r.amount
  }));

  // ===== PAYMENT =====
  const handleUpgrade = async () => {
    try {
      const res = await fetch(`${API}/api/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: token })
      });

      const order = await res.json();

      const options = {
        key: "rzp_live_SYhxFosHQr1vtB",
        amount: order.amount,
        currency: "INR",
        name: "AI Salon",
        order_id: order.id,

        handler: async function (response) {
          const verify = await fetch(`${API}/api/verify-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: token,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });

          const result = await verify.json();

          if (result.success) {
            setNotifications(prev => [
              { text: "Payment Successful 💰" },
              ...prev
            ]);
            window.location.reload();
          }
        }
      };

      new window.Razorpay(options).open();

    } catch (err) {
      console.log(err);
      alert("Payment failed ❌");
    }
  };

  return (
    <div className="app">

      {/* SIDEBAR */}
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

      {/* MAIN */}
      <div className="main">

        <div className="topbar">
          <h2>{page.toUpperCase()}</h2>
          <button className="upgrade" onClick={handleUpgrade}>
            <CreditCard size={16}/> Upgrade
          </button>
        </div>

        {/* NOTIFICATIONS */}
        {notifications.slice(0,3).map((n,i)=>(
          <div key={i} className="notification">🔔 {n.text}</div>
        ))}

        {/* DASHBOARD */}
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
              <p>Tip: Reply faster = more bookings 🚀</p>
            </div>
          </>
        )}

        {/* ANALYTICS */}
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

        {/* CALENDAR (UPGRADED) */}
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

        {/* PLAN */}
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