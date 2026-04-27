const express = require("express");
const cors = require("cors");
const { MB } = require("./dist");
const { Redis } = require("@upstash/redis");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🔴 NHÚNG REDIS TRỰC TIẾP
const redis = new Redis({
  url: "https://safe-platypus-74809.upstash.io",
  token: "gQAAAAAAASQ5AAIgcDJhZDRhMjUwMTY5ODc0NDNiYWNlYmNiOWUxYTE2YWUzYQ"
});

// 🔐 MB
const BANK = "MB";
const STK = "0975868667";

let mb = null;
let lastLogin = 0;

async function initMB() {
  if (!mb || Date.now() - lastLogin > 5 * 60 * 1000) {
    mb = new MB({
      username: process.env.MB_USER,
      password: process.env.MB_PASS
    });

    console.log("🔐 Login MB...");
    await mb.login();
    console.log("✅ Login OK");

    lastLogin = Date.now();
  }
}

function formatDate(d) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ⚡ CACHE HISTORY
let cacheHistory = [];
let lastFetch = 0;

async function getHistory() {
  if (Date.now() - lastFetch < 15000) return cacheHistory;

  await initMB();

  const balance = await mb.getBalance();
  const acc = balance?.balances?.[0]?.number;
  if (!acc) return [];

  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - 3);

  try {
    const history = await mb.getTransactionsHistory({
      accountNumber: acc,
      fromDate: formatDate(from),
      toDate: formatDate(today)
    });

    cacheHistory = history || [];
    lastFetch = Date.now();

    return cacheHistory;
  } catch (e) {
    console.log("❌ history error:", e.message);
    return cacheHistory;
  }
}

//
// 🏠 API LIST
//
app.get("/home/api", (req, res) => {
  res.json({
    dev: "Pham Quang Vuong",
    endpoints: {
      create: "/home/naptien?sotien=10000",
      check: "/home/api/check?note=napxxxx",
      orders: "/home/api/orders",
      status:"online"
    }
  });
});

//
// 💳 CREATE
//
app.get("/home/naptien", async (req, res) => {

  const amount = Number(req.query.sotien);
  if (!amount) return res.json({ error: "invalid amount" });

  const note = "nap" + Date.now();

  const data = {
    note,
    amount,
    status: "pending",
    created: Date.now(),
    expire: Date.now() + 300000
  };

  // lưu Redis
  await redis.set("pay:" + note, data);

  // index đơn
  await redis.sadd("orders", note);

  const qr = `https://img.vietqr.io/image/${BANK}-${STK}-compact2.png?amount=${amount}&addInfo=${note}`;

  res.json({ qr, note, amount });
});

//
// 🔍 CHECK
//
app.get("/home/api/check", async (req, res) => {

  const note = req.query.note;
  if (!note) return res.json({ error: "missing note" });

  const payment = await redis.get("pay:" + note);
  if (!payment) return res.json({ status: "not_found" });

  // expired
  if (Date.now() > payment.expire) {
    payment.status = "expired";
    await redis.set("pay:" + note, payment);
  }

  try {
    const history = await getHistory();

    const found = history.find(tx => {

      const desc = (
        tx.transactionDesc ||
        tx.description ||
        ""
      )
      .toLowerCase()
      .replace(/\s/g, "");

      return (
        desc.includes(note.toLowerCase()) ||
        Number(tx.amount) === payment.amount
      );
    });

    if (found) {
      payment.status = "paid";
      await redis.set("pay:" + note, payment);
    }

    res.json({ status: payment.status });

  } catch (e) {
    res.json({ status: "error", message: e.message });
  }
});

//
// 📊 ORDERS
//
app.get("/home/api/orders", async (req, res) => {

  const notes = await redis.smembers("orders");

  const list = await Promise.all(
    notes.map(n => redis.get("pay:" + n))
  );

  const total = list.length;
  const success = list.filter(i => i?.status === "paid").length;
  const income = list.reduce((s, i) =>
    i?.status === "paid" ? s + i.amount : s
  , 0);

  res.json({
    totalOrders: total,
    successOrders: success,
    income
  });
});

//
// 🚀 START
//
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
