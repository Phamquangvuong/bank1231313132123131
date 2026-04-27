const { MB } = require("../dist");

let mb = null;
let lastLogin = 0;

let cachedHistory = [];
let lastFetch = 0;

const CACHE_TIME = 30 * 1000; // 30s

async function initMB(){
  if (!mb || Date.now() - lastLogin > 5 * 60 * 1000) {
    mb = new MB({
      username: process.env.MB_USER,
      password: process.env.MB_PASS,
    });

    await mb.login();
    lastLogin = Date.now();
  }
}

function formatDate(d){
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

async function getHistory(){

  // ⚡ CACHE
  if (Date.now() - lastFetch < CACHE_TIME) {
    return cachedHistory;
  }

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
      toDate: formatDate(today),
    });

    cachedHistory = history || [];
    lastFetch = Date.now();

    return cachedHistory;

  } catch (e) {
    return cachedHistory; // fallback cache
  }
}

module.exports = { getHistory };