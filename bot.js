const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');

const TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const bot = new TelegramBot(TOKEN, { polling: true });

let userStep = {};
let userData = {};
let lastResetDate = getWITADate();
let lastReportDate = "";

const SHEET_MANADO = "MANADO";
const SHEET_TERNATE = "TERNATE";
const USER_SHEET = "USERS";

const ADMIN_IDS = [816293780];

// ================= GOOGLE =================

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

// ================= WAKTU =================

function getWITATime(){

  const date = new Date(
    new Date().toLocaleString("en-US",{timeZone:"Asia/Makassar"})
  );

  const day = String(date.getDate()).padStart(2,"0");
  const month = String(date.getMonth()+1).padStart(2,"0");
  const year = date.getFullYear();

  const hour = String(date.getHours()).padStart(2,"0");
  const minute = String(date.getMinutes()).padStart(2,"0");
  const second = String(date.getSeconds()).padStart(2,"0");

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

function getWITADate(){

  const date = new Date(
    new Date().toLocaleString("en-US",{timeZone:"Asia/Makassar"})
  );

  const day = String(date.getDate()).padStart(2,"0");
  const month = String(date.getMonth()+1).padStart(2,"0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

// ================= RESET =================

function checkDailyReset() {
  const today = getWITADate();
  if (today !== lastResetDate) {
    lastResetDate = today;
    userStep = {};
    userData = {};
    lastReportDate = "";
    console.log("Reset harian:", today);
  }
}

// ================= USER =================

async function saveUser(msg, grapari) {

  const chatId = msg.chat.id;
  const username = msg.from.username || "-";
  const nama = msg.from.first_name || "-";

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${USER_SHEET}!A2:A`
  });

  const rows = res.data.values || [];
  const exist = rows.find(r => r[0] == chatId);

  if(!exist){

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: USER_SHEET,
      valueInputOption: "USER_ENTERED",
      requestBody:{
        values:[[chatId, username, nama, grapari]]
      }
    });

  }

}

// ================= START =================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  delete userStep[chatId];
  delete userData[chatId];
  showMenu(chatId);

});

// ================= MESSAGE =================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  const step = userStep[chatId];

  if (text === "📝 Buat Antrian") {
    userStep[chatId] = "grapari";
    showGrapari(chatId,"📍 Pilih Grapari");
    return;
  }

  if (text === "📊 Lihat Antrian") {
    userStep[chatId] = "lihat";
    showGrapari(chatId,"🔍 Pilih Grapari");
    return;
  }

  if (!step) return;

  if (step === "grapari") {
    userData[chatId] = { grapari:text };
    await saveUser(msg,text);
    userStep[chatId] = "nama";
    bot.sendMessage(chatId,"👤 Masukkan *Nama Pelanggan* :",{parse_mode:"Markdown"});
    return;

  }

  if (step === "nama") {
    userData[chatId].nama = text;
    userStep[chatId] = "hp";
    bot.sendMessage(chatId,"📞 Masukkan *Nomor HP* :",{parse_mode:"Markdown"});
    return;

  }

  if (step === "hp") {
    const phoneRegex = /^[0-9]{9,14}$/;
    if (!phoneRegex.test(text)) {
      bot.sendMessage(chatId,"⚠️ Nomor HP tidak valid");
      return;
    }

    userData[chatId].hp = text;
    userStep[chatId] = "layanan";
    showService(chatId);
    return;

  }

  if (step === "layanan") {
    userData[chatId].layanan = text;
    userStep[chatId] = "keluhan";
    bot.sendMessage(chatId,"⚠️ Masukkan *Keluhan* :",{parse_mode:"Markdown"});
    return;
  }

  if (step === "keluhan") {
    userData[chatId].keluhan = text;
    userStep[chatId] = "inputer";
    bot.sendMessage(chatId,"👨‍💻 Masukkan *Nama Inputer* :",{parse_mode:"Markdown"});
    return;
  }

  if (step === "inputer") {
    userData[chatId].inputer = text;
    await saveQueue(chatId);
  }

  if (step === "lihat") {
    await showQueue(chatId,text);
    delete userStep[chatId];
  }

});

// ================= SHEET =================

function getSheet(grapari){

  if(!grapari) return null;

  grapari = grapari.trim();

  if(grapari.includes("Manado")) return SHEET_MANADO;
  if(grapari.includes("Ternate")) return SHEET_TERNATE;

  return null;
}

// ================= PREFIX =================

function getPrefix(grapari){

  if(grapari === "Grapari Manado") return "MDO";
  if(grapari === "Grapari Ternate") return "TRN";

}

// ================= NOMOR =================

async function generateQueueNumber(grapari){

  const sheet = getSheet(grapari);
    if(!sheet){
      throw new Error("Sheet tidak ditemukan untuk Grapari: "+grapari);
    }
  const prefix = getPrefix(grapari);
  const today = getWITADate();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId:SPREADSHEET_ID,
    range:`${sheet}!B2:C`
  });

  const rows = res.data.values || [];

  const todayRows = rows.filter(r=>{
    const t = (r[0] || "").toString().trim();
    return t === today;
  });

  if(todayRows.length === 0){
    return prefix+"001";
  }

  const numbers = todayRows.map(r=>{
    const num = (r[1] || "").toString().replace(prefix,"").trim();
    return parseInt(num) || 0;
  });

  const last = Math.max(...numbers);

  return prefix + String(last+1).padStart(3,"0");

}


// ================= SAVE =================

async function saveQueue(chatId){

  const { grapari,nama,hp,layanan,keluhan,inputer } = userData[chatId];
  const sheet = getSheet(grapari);
  const nomor = await generateQueueNumber(grapari);
  const timestamp = getWITATime();
  const tanggal = getWITADate();

  try {

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: sheet,
      valueInputOption: "USER_ENTERED",
      requestBody:{
        values:[[timestamp,tanggal,nomor,grapari,nama,hp,layanan,keluhan,inputer]]
      }
    });

    await bot.sendMessage(
      chatId,
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
    bot.sendMessage(chatId,"❌ Terjadi kesalahan saat menyimpan antrian.");
    return;

  }

  // 🔹 reset step user
  delete userStep[chatId];
  delete userData[chatId];

  // 🔹 kembali ke menu utama
  showMenu(chatId);

}

// ================= SHOW =================

async function showQueue(chatId,grapari){
  try{
  const sheet = getSheet(grapari);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId:SPREADSHEET_ID,
    range:`${sheet}!B2:H`
  });

  const rows = res.data.values || [];
  const today = getWITADate();
  const todayRows = rows.filter(r=>{
  const t = (r[0] || "").toString().trim();
  return t === today;
  });
  if(todayRows.length===0){
    let msg = `📭 *Belum ada antrian hari ini*\n`;
    msg += `📅 ${grapari}\n\n`;
    msg += `📅 ${today}\n\n`;
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `ℹ️ *Petunjuk:*\n`;
    msg += `• Ketik */start* untuk kembali ke menu utama.`;
  return bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  }

  todayRows.sort((a,b)=>{
  const na = parseInt((a[1] || "").replace(/\D/g,"")) || 0;
  const nb = parseInt((b[1] || "").replace(/\D/g,"")) || 0;
  return na-nb;
  });

    let msg = `📊 ANTRIAN ${grapari}\n📅 ${today}\n\n`;

    todayRows.forEach(r => {
      msg += `🎟 ${r[1]} - ${r[3]} (${r[5]})\n`;
    });

    msg += `\n━━━━━━━━━━━━━━━\n`;
    msg += `ℹ️ *Petunjuk:*\n`;
    msg += `• Ketik /start untuk kembali ke menu utama.`;

    bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });


  } catch (err) {

    console.log(err);
    bot.sendMessage(chatId, "❌ Gagal memuat antrian");

  }
}

// ================= MENU =================

function showMenu(chatId){

  bot.sendMessage(chatId, "📱 *Q-Express GraPARI Bot*\n\nPilih Menu:", {

    parse_mode:"Markdown",

    reply_markup:{
      keyboard:[
        ["📝 Buat Antrian"],
        ["📊 Lihat Antrian"]
      ],
      resize_keyboard:true,
      one_time_keyboard:true
    }

  });

}

// ================= GRAPARI =================

function showGrapari(chatId,text){

  bot.sendMessage(chatId,text,{

    reply_markup:{
      keyboard:[
        ["Grapari Manado"],
        ["Grapari Ternate"]
      ],
      resize_keyboard:true,
      one_time_keyboard:true
    }

  });

}

// ================= SERVICE =================

function showService(chatId){

  bot.sendMessage(chatId,"🛠 Pilih Layanan :",{

    reply_markup:{
      keyboard:[
        ["📱 Telkomsel PraBayar"],
        ["📞 Telkomsel Halo"],
        ["📡 Telkomsel Orbit"],
        ["🌐 IndiHome"],
        ["🆓 by.U"]
      ],
      resize_keyboard:true
    }

  });

}

// ========================
// BROADCAST MANUAL / ADMIN
// ========================
bot.onText(/\/broadcast(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const adminIds = [816293780]; // ganti dengan chatId admin
  if (!adminIds.includes(chatId)) {
    bot.sendMessage(chatId, "❌ Kamu tidak punya izin untuk broadcast.");
    return;
  }

  const textToBroadcast = match[1];
  if (!textToBroadcast || textToBroadcast.trim() === "") {
    bot.sendMessage(chatId, "ℹ️ Tulis pesan setelah perintah /broadcast.\nContoh:\n/broadcast 🔔 Info:\n• Point 1\n• Point 2");
    return;
  }

  try {
    await broadcastToAll(textToBroadcast);
    bot.sendMessage(chatId, "✅ Broadcast manual berhasil dikirim ke semua user.");
  } catch (e) {
    console.error("❌ Gagal broadcast manual:", e);
    bot.sendMessage(chatId, "❌ Terjadi kesalahan saat broadcast.");
  }
});

// ========================
// REKAP PROFESIONAL & BROADCAST TANPA PERSENTASE
// ========================

async function generateReport(sheet, grapari) {
  try {

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheet}!B2:H`
    });

    const rows = res.data.values || [];
    const today = getWITADate();

    const todayRows = rows.filter(r=>{
    const t = (r[0] || "").toString().trim();
    return t === today;
    });

    if (todayRows.length === 0) {
      return `📊 *REKAP ANTRIAN*
🏢 ${grapari}
📅 ${today}

Belum ada antrian hari ini.`;
    }

    let stat = {
      prabayar: 0,
      halo: 0,
      indihome: 0,
      orbit: 0,
      byu: 0
    };

    todayRows.forEach(r => {

      const layanan = (r[5] || "").toLowerCase();

      if (layanan.includes("prabayar")) stat.prabayar++;
      if (layanan.includes("halo")) stat.halo++;
      if (layanan.includes("indihome")) stat.indihome++;
      if (layanan.includes("orbit")) stat.orbit++;
      if (layanan.includes("by.u") || layanan.includes("byu")) stat.byu++;

    });

    const total = todayRows.length;

    let msg = "";
    msg += `📊 *REKAP ANTRIAN GRAPARI*\n`;
    msg += `🏢 ${grapari}\n`;
    msg += `📅 ${today}\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n\n`;

    msg += "STATISTIK LAYANAN\n";
    msg += "-----------------------------\n";
    msg += `*Total Pelanggan : ${total}*\n`;
    msg += "-----------------------------\n";
    msg += `📱 Telkomsel PraBayar : *${stat.prabayar}*\n`;
    msg += `📞 Telkomsel Halo : *${stat.halo}*\n`;
    msg += `📡 Telkomsel Orbit : *${stat.orbit}*\n`;
    msg += `🌐 IndiHome : *${stat.indihome}*\n`;
    msg += `🆓 by.U : *${stat.byu}*\n`;
    
    msg += `\n━━━━━━━━━━━━━━━━━━\n`;
    msg += `Terima kasih telah menggunakan\n`;
    msg += `*Q-Express GraPARI Bot*`;

    return msg;

  } catch (e) {

    console.error("Gagal generate report:", e);
    return "❌ Terjadi kesalahan saat membuat rekap.";

  }
}
async function broadcastDailyReport(){

  const reportManado=await generateReport(SHEET_MANADO,"Grapari Manado");
  const reportTernate=await generateReport(SHEET_TERNATE,"Grapari Ternate");

  const res=await sheets.spreadsheets.values.get({
    spreadsheetId:SPREADSHEET_ID,
    range:`${USER_SHEET}!A2:B`
  });

  const users=res.data.values||[];

  for(const u of users){

    const chatId=u[0];
    const grapari=u[1];

    try{

      if(grapari==="Grapari Manado"){
        await bot.sendMessage(chatId,reportManado,{parse_mode:"Markdown"});
      }

      if(grapari==="Grapari Ternate"){
        await bot.sendMessage(chatId,reportTernate,{parse_mode:"Markdown"});
      }

    }catch(e){
      console.log("Gagal kirim",chatId);
    }
  }
}


// ========================
// BROADCAST KE SEMUA USER
// ========================

async function broadcastToAll(message){

  try{

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${USER_SHEET}!A2:A`
    });

    const users = res.data.values || [];

    if(users.length === 0){
      console.log("Tidak ada user untuk broadcast");
      return;
    }

    for(const u of users){

      const chatId = u[0];

      try{

        await bot.sendMessage(chatId, message, {
          parse_mode:"Markdown"
        });

      }catch(err){

        console.log("Gagal kirim ke:", chatId);

      }

    }

  }catch(err){

    console.log("Broadcast error:", err);

  }

}

// ================= REKAP ADMIN =================

bot.onText(/\/rekap/, async (msg) => {

  const chatId = msg.chat.id;

  if (!ADMIN_IDS.includes(chatId)) {
    bot.sendMessage(chatId, "❌ Tidak memiliki akses");
    return;
  }

  try {

    const reportManado = await generateReport(SHEET_MANADO, "Grapari Manado");
    const reportTernate = await generateReport(SHEET_TERNATE, "Grapari Ternate");

    const finalReport =
      reportManado +
      "\n\n━━━━━━━━━━━━━━━━\n\n" +
      reportTernate;

    bot.sendMessage(chatId, finalReport, { parse_mode: "Markdown" });

  } catch (err) {

    console.log("Rekap error:", err);
    bot.sendMessage(chatId, "❌ Terjadi kesalahan saat membuat rekap.");

  }

});

// ================= SCHEDULER =================

setInterval(async () => {

  const now = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Makassar"
  });

  const date = new Date(now);

  const day = date.getDay();
  const hour = date.getHours();
  const minute = date.getMinutes();

  const today = getWITADate();

  // Senin - Jumat 17:05
  if (day >= 1 && day <= 5 && hour === 17 && minute === 5 && lastReportDate !== today) {

    await broadcastDailyReport();
    lastReportDate = today;

  }

  // Sabtu 12:05
  if (day === 6 && hour === 12 && minute === 5 && lastReportDate !== today) {

    await broadcastDailyReport();
    lastReportDate = today;

  }

}, 60000);
