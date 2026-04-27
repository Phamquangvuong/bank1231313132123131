const express = require("express");
const cors = require("cors");

const redis = require("./lib/redis");
const { getHistory } = require("./lib/mb");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// 🏠 HOME
app.get("/api/home", (req, res) => {
  res.json({
    name: "MB API",
    endpoints: {
      create: "/api/create?nap=10000",
      check: "/api/check?note=napxxxx",
      orders: "/api/orders"
    },
    time: new Date().toLocaleString()
  });
});

// 💳 CREATE
app.get("/api/create", async (req, res) => {

  const amount = Number(req.query.nap);
  if (!amount || amount <= 0) {
    return res.json({ error: "invalid amount" });
  }

  const note = "nap" + Date.now();

  await redis.set("pay:" + note, {
    note,
    amount,
    status: "pending",
    expire: Date.now() + 300000 // 5 phút
  });

  res.json({
    qr: `https://img.vietqr.io/image/MB-0975868667-compact2.png?amount=${amount}&addInfo=${note}`,
    note,
    amount
  });
});

// 🔍 CHECK
app.get("/api/check", async (req, res) => {

  const note = req.query.note;
  if (!note) return res.json({ error: "missing note" });

  const pay = await redis.get("pay:" + note);
  if (!pay) return res.json({ status: "not_found" });

  // check giao dịch
  const history = await getHistory();

  const found = history.find(tx => {
    const desc = (tx.description || "")
      .toLowerCase()
      .replace(/\s/g, "");

    return desc.includes(note.toLowerCase());
  });

  if (found) {
    pay.status = "paid";
    await redis.set("pay:" + note, pay);
    return res.json({ status: "paid" });
  }

  // hết hạn
  if (Date.now() > pay.expire) {
    pay.status = "expired";
    await redis.set("pay:" + note, pay);
    return res.json({ status: "expired" });
  }

  res.json({ status: "pending" });
});

// 📊 ORDERS
app.get("/api/orders", async (req, res) => {

  const keys = await redis.keys("pay:*");
  const list = await Promise.all(keys.map(k => redis.get(k)));

  const total = list.length;
  const success = list.filter(i => i.status === "paid").length;
  const income = list.reduce((s, i) =>
    i.status === "paid" ? s + i.amount : s
  , 0);

  res.json({
    totalOrders: total,
    successOrders: success,
    income
  });
});

// 🚀 START
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
