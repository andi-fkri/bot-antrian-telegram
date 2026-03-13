const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');

const TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "DATA";
const USER_SHEET = "USERS";

const bot = new TelegramBot(TOKEN, { polling: true });

let userStep = {};
let userData = {};
let lastResetDate = getWITADate();
let lastReportDate = "";

// ========================
// GOOGLE SHEETS AUTH
// ========================

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

// ========================
// WAKTU WITA
// ========================

function getWITATime() {
  return new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar", hour12: false });
}

function getWITADate() {
  return new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" });
}

// ========================
// RESET HARIAN
// ========================

function checkDailyReset() {
  const today = getWITADate();
  if (today !== lastResetDate) {
    lastResetDate = today;
    console.log(`🔄 Reset harian WITA - tanggal baru: ${today}`);
    userStep = {};
    userData = {};
    lastReportDate = "";
  }
}

// ========================
// SIMPAN USER UNTUK BROADCAST
// ========================

async function saveUser(chatId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USER_SHEET}!A2:A`
    });
    const rows = res.data.values || [];
    if (!rows.some(r => r[0] == chatId)) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: USER_SHEET,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[chatId]] }
      });
    }
  } catch (e) {
    console.error("Gagal simpan user:", e);
  }
}

// ========================
// START
// ========================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await saveUser(chatId);
  showMenu(chatId);
});

// ========================
// MESSAGE HANDLER
// ========================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const step = userStep[chatId];

  if (text === "📝 Buat Antrian") {
    userStep[chatId] = "nama";
    bot.sendMessage(chatId, "👤 Masukkan *Nama Pelanggan* :", { parse_mode: "Markdown" });
    return;
  }

  if (text === "📊 Lihat Antrian") {
    showQueue(chatId);
    return;
  }

  if (step === "nama") {
    userData[chatId] = { nama: text };
    userStep[chatId] = "hp";
    bot.sendMessage(chatId, "📞 Masukkan *Nomor HP* :", { parse_mode: "Markdown" });
    return;
  }

  if (step === "hp") {
    userData[chatId].hp = text;
    userStep[chatId] = "layanan";
    showService(chatId);
    return;
  }

  if (step === "layanan") {
    userData[chatId].layanan = text;
    userStep[chatId] = "keluhan";
    bot.sendMessage(chatId, "⚠️ Masukkan *Keluhan* :", { parse_mode: "Markdown" });
    return;
  }

  if (step === "keluhan") {
    userData[chatId].keluhan = text;
    userStep[chatId] = "inputer";
    bot.sendMessage(chatId, "👨‍💻 Masukkan *Nama Inputer* :", { parse_mode: "Markdown" });
    return;
  }

  if (step === "inputer") {
    userData[chatId].inputer = text;

    const { nama, hp, layanan, keluhan, inputer } = userData[chatId];
    const nomor = await generateQueueNumber();
    const timestamp = getWITATime();
    const tanggal = getWITADate();

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: SHEET_NAME,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[timestamp, tanggal, nomor, nama, hp, layanan, keluhan, inputer]] }
      });

      bot.sendMessage(chatId,
        `✅ *Antrian Berhasil Dibuat*\n\n` +
        `🎟 Nomor : *${nomor}*\n` +
        `👤 Nama : ${nama}\n` +
        `📞 HP : ${hp}\n` +
        `🛠 Layanan : ${layanan}\n` +
        `⚠️ Keluhan : ${keluhan}`,
        { parse_mode: "Markdown" }
      );

    } catch (e) {
      console.error("Gagal menyimpan antrian:", e);
      bot.sendMessage(chatId, "❌ Terjadi kesalahan saat menyimpan antrian.");
    }

    delete userStep[chatId];
    delete userData[chatId];
    showMenu(chatId);
  }
});

// ========================
// GENERATE NOMOR ANTRIAN
// ========================

async function generateQueueNumber() {
  checkDailyReset();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!B2:C`
    });
    const rows = res.data.values || [];
    const today = getWITADate();
    const todayRows = rows.filter(r => r[0] === today);

    if (todayRows.length === 0) return "Q001";

    const numbers = todayRows.map(r => {
      const n = parseInt((r[1] || "").replace("Q", ""));
      return isNaN(n) ? 0 : n;
    });

    const lastNum = Math.max(...numbers);
    return "Q" + String(lastNum + 1).padStart(3, "0");

  } catch (e) {
    console.error("Gagal generate nomor antrian:", e);
    return "Q001";
  }
}

// ========================
// MENU & SERVICE
// ========================

function showMenu(chatId) {
  bot.sendMessage(chatId, "📋 *Menu Antrian*\nSilakan pilih menu:", {
    parse_mode: "Markdown",
    reply_markup: { keyboard: [["📝 Buat Antrian"], ["📊 Lihat Antrian"]], resize_keyboard: true }
  });
}

function showService(chatId) {
  bot.sendMessage(chatId, "🛠 Pilih *Jenis Layanan* :", {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [
        ["📱 Telkomsel PraBayar"],
        ["📞 Telkomsel Halo"],
        ["📡 Telkomsel Orbit"],
        ["🌐 IndiHome"],
        ["🆓 by.U"]
      ],
      resize_keyboard: true
    }
  });
}

// ========================
// TAMPILKAN ANTRIAN TERURUT
// ========================

async function showQueue(chatId) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!B2:H` });
    const rows = res.data.values || [];
    const today = getWITADate();
    const todayRows = rows.filter(r => r[0] === today);

    if(todayRows.length === 0){

    let msg = `📭 *Belum ada antrian hari ini*\n`;
    msg += `📅 ${today}\n\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `ℹ️ *Petunjuk:*\n`;
    msg += `• Ketik */start* untuk kembali ke menu utama`;

    bot.sendMessage(chatId,msg,{parse_mode:"Markdown"});

    return;
  }

    // Urutkan berdasarkan nomor antrian Q001, Q002...
    todayRows.sort((a, b) => {
      const numA = parseInt(a[2].replace("Q", "")) || 0;
      const numB = parseInt(b[2].replace("Q", "")) || 0;
      return numA - numB;
    });

    let msg = `📊 *Daftar Antrian Hari Ini*\n`;
    msg += `📅 ${today}\n\n`;
    todayRows.forEach(r => { msg += `🎟 ${r[1]} - ${r[2]} (${r[4]})\n`; });
    msg += `\n━━━━━━━━━━━━━━━\n`;
    msg += `ℹ️ *Petunjuk:*\n`;
    msg += `• Ketik */start* untuk kembali ke menu utama`;

    bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });

  } catch (e) { console.error("Gagal menampilkan antrian:", e); }
}

// ========================
// REKAP PROFESIONAL & BROADCAST TANPA PERSENTASE
// ========================

async function generateProfessionalReport() {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!B2:H` });
    const rows = res.data.values || [];
    const today = getWITADate();
    const todayRows = rows.filter(r => r[0] === today);

    if (todayRows.length === 0) return `📊 REKAP ANTRIAN\n📅 ${today}\nTidak ada antrian hari ini.`;

    let stat = { prabayar: 0, halo: 0, indihome: 0, orbit: 0, byu: 0 };
    todayRows.forEach(r => {
      const layanan = (r[5] || "").toLowerCase();
      if (layanan.includes("prabayar")) stat.prabayar++;
      if (layanan.includes("halo")) stat.halo++;
      if (layanan.includes("indihome")) stat.indihome++;
      if (layanan.includes("orbit")) stat.orbit++;
      if (layanan.includes("by.u") || layanan.includes("byu")) stat.byu++;
    });

    const total = todayRows.length;
    let msg = `📊 *REKAP ANTRIAN GRAPARI*\n📅 ${today}\n━━━━━━━━━━━━━━━━\n`;
    msg += `👥 *Total Pelanggan*: ${total} Orang\n\n📈 *Statistik Layanan*\n`;
    msg += `📱 Telkomsel PraBayar : ${stat.prabayar}\n`;
    msg += `📞 Telkomsel Halo : ${stat.halo}\n`;
    msg += `🌐 IndiHome : ${stat.indihome}\n`;
    msg += `📡 Telkomsel Orbit : ${stat.orbit}\n`;
    msg += `🆓 by.U : ${stat.byu}\n`;
    msg += "━━━━━━━━━━━━━━━━\nTerima kasih telah menggunakan *Sistem Antrian Digital Grapari*";

    return msg;

  } catch (e) { console.error("Gagal generate report:", e); return "❌ Terjadi kesalahan saat membuat rekap."; }
}

async function broadcastDailyReport() {
  try {
    const report = await generateProfessionalReport();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${USER_SHEET}!A2:A` });
    const users = [...new Set((res.data.values || []).map(r => r[0]))];
    for (const chatId of users) {
      try { await bot.sendMessage(chatId, report, { parse_mode: "Markdown" }); }
      catch { console.log("Gagal kirim ke", chatId); }
    }
  } catch (e) { console.error("Gagal broadcast:", e); }
}

// ========================
// SCHEDULER OTOMATIS
// ========================

setInterval(async () => {
  const today = getWITADate();
  checkDailyReset();

  const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" });
  const date = new Date(now);
  const day = date.getDay();
  const hour = date.getHours();
  const minute = date.getMinutes();

  // Senin-Jumat 18:00
  if (day >= 1 && day <= 5 && hour === 18 && minute === 0 && lastReportDate !== today) {
    await broadcastDailyReport();
    lastReportDate = today;
  }

  // Sabtu 12:30
  if (day === 6 && hour === 12 && minute === 30 && lastReportDate !== today) {
    await broadcastDailyReport();
    lastReportDate = today;
  }

}, 60000);
