const express = require("express");
const cors = require("cors");
const { MB } = require("./dist");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// ⚠️ SỬA THÔNG TIN
const BANK = "MB";
const STK = "0975868667";
const USERNAME = "0975868667";
const PASSWORD = "Phamquangvuong@123";

// lưu đơn
let payments = [];

// MB instance
let mb = null;
let lastLogin = 0;

// 🔐 login MB
async function initMB() {
    if (!mb || Date.now() - lastLogin > 5 * 60 * 1000) {
        mb = new MB({
            username: USERNAME,
            password: PASSWORD,
        });

        console.log("🔐 Login MB...");
        await mb.login();
        console.log("✅ Login thành công");

        lastLogin = Date.now();
    }
}

// format ngày
function formatDate(d) {
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// lấy lịch sử
async function getHistory() {
    await initMB();

    const balance = await mb.getBalance();
    const acc = balance?.balances?.[0]?.number;

    if (!acc) return [];

    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - 3); // 🔥 lấy 3 ngày

    try {
        const history = await mb.getTransactionsHistory({
            accountNumber: acc,
            fromDate: formatDate(from),
            toDate: formatDate(today),
        });

        return history || [];
    } catch (e) {
        console.log("❌ Lỗi history:", e.message);
        return [];
    }
}

// 🔥 tạo QR
app.get("/create", (req, res) => {
    const amount = Number(req.query.amount) || 10000;

    // 🔥 note chống lỗi
    const note = "nap" + Date.now();

    const qr = `https://img.vietqr.io/image/${BANK}-${STK}-compact2.png?amount=${amount}&addInfo=${note}`;

    payments.push({
        note,
        amount,
        status: "pending",
        createdAt: Date.now()
    });

    console.log("🆕 Tạo đơn:", note);

    res.json({ qr, note, amount });
});

// 🔥 check thanh toán
app.get("/check", async (req, res) => {
    const note = req.query.note;

    const payment = payments.find(p => p.note === note);
    if (!payment) return res.json({ status: "not_found" });

    try {
        const history = await getHistory();

        console.log("===== DEBUG =====");
        console.log("NOTE:", note);

        history.forEach(tx => {
            console.log("DESC:", tx.transactionDesc);
        });

        const found = history.find(tx => {
            const desc = (tx.transactionDesc || "")
                .toLowerCase()
                .replace(/\s/g, "");

            return desc.includes(note.toLowerCase());
        });

        if (found) {
            payment.status = "paid";
            console.log("💰 MATCH:", note);
        }

        res.json({ status: payment.status });

    } catch (e) {
        res.json({ status: "error", message: e.message });
    }
});

// 🔄 auto check nền
setInterval(async () => {
    if (!payments.length) return;

    const history = await getHistory();

    payments.forEach(p => {
        if (p.status === "pending") {
            const found = history.find(tx => {
                const desc = (tx.transactionDesc || "")
                    .toLowerCase()
                    .replace(/\s/g, "");

                return desc.includes(p.note.toLowerCase());
            });

            if (found) {
                p.status = "paid";
                console.log("💰 Đã nhận:", p.note);
            }
        }
    });

}, 5000);

// 🚀 chạy server
app.listen(PORT, () => {
    console.log("🚀 http://localhost:" + PORT);
});