const axios = require("axios");

let session = null;
let lastLogin = 0;

const BASE = "https://online.mbbank.com.vn";

async function login() {
  if (session && Date.now() - lastLogin < 300000) return;

  const res = await axios.post(BASE + "/api/login", {
    userId: process.env.MB_USER,
    password: process.env.MB_PASS
  });

  session = res.data.sessionId;
  lastLogin = Date.now();
}

async function getHistory() {
  await login();

  try {
    const res = await axios.post(
      BASE + "/api/transaction-history",
      {},
      {
        headers: { Authorization: session },
        timeout: 8000
      }
    );

    return res.data.transactions || [];

  } catch (e) {
    session = null;
    return [];
  }
}

module.exports = { getHistory };
