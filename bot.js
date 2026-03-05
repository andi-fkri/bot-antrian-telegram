const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');

const TOKEN = "8764517873:AAF0y-oRDhZazwwYf_cdMshA3A1dYwkRisY";
const SPREADSHEET_ID = "1V3X2pQr2h_LtIe2Z9J6yuD3t-gjZMcTIC4wCMxPqh-o";
const SHEET_NAME = "DATA";

const bot = new TelegramBot(TOKEN, { polling: true });

let userStep = {};
let userData = {};

// ========================
// GOOGLE SHEETS AUTH
// ========================

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({
  version: "v4",
  auth
});

// ========================
// START
// ========================

bot.onText(/\/start/, (msg) => {
  showMenu(msg.chat.id);
});

// ========================
// MESSAGE HANDLER
// ========================

bot.on("message", async (msg) => {

  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  const step = userStep[chatId];

  // MENU
  if (text === "📝 Buat Antrian") {
    userStep[chatId] = "nama";
    bot.sendMessage(chatId, "👤 Silakan masukkan *Nama Anda*", {parse_mode:"Markdown"});
    return;
  }

  if (text === "📊 Lihat Antrian") {
    showQueue(chatId);
    return;
  }

  // STEP NAMA
  if (step === "nama") {
    userData[chatId] = { nama: text };
    userStep[chatId] = "hp";

    bot.sendMessage(chatId, "📞 Masukkan *Nomor HP*", {parse_mode:"Markdown"});
    return;
  }

  // STEP HP
  if (step === "hp") {
    userData[chatId].hp = text;
    userStep[chatId] = "layanan";

    showService(chatId);
    return;
  }

  // STEP LAYANAN
  if (step === "layanan") {
    userData[chatId].layanan = text;
    userStep[chatId] = "keluhan";

    bot.sendMessage(chatId, "⚠️ Masukkan *Keluhan Anda*", {parse_mode:"Markdown"});
    return;
  }

  // STEP KELUHAN
  if (step === "keluhan") {

    userData[chatId].keluhan = text;

    const nama = userData[chatId].nama;
    const hp = userData[chatId].hp;
    const layanan = userData[chatId].layanan;
    const keluhan = userData[chatId].keluhan;

    const nomor = await generateQueueNumber();

    const now = new Date();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_NAME,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          now,
          now.toLocaleDateString("id-ID"),
          nomor,
          nama,
          hp,
          layanan,
          keluhan
        ]]
      }
    });

    bot.sendMessage(chatId,
      `✅ *Antrian Berhasil Dibuat*\n\n`+
      `🎟 Nomor : *${nomor}*\n`+
      `👤 Nama : ${nama}\n`+
      `📞 HP : ${hp}\n`+
      `🛠 Layanan : ${layanan}\n`+
      `⚠️ Keluhan : ${keluhan}`,
      {parse_mode:"Markdown"}
    );

    delete userStep[chatId];
    delete userData[chatId];

    showMenu(chatId);
  }

});

// ========================
// GENERATE QUEUE NUMBER
// ========================

async function generateQueueNumber(){

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B2:C`
  });

  const rows = res.data.values || [];

  const today = new Date().toLocaleDateString("id-ID");

  const todayRows = rows.filter(r => r[0] === today);

  if(todayRows.length === 0){
    return "Q001";
  }

  const last = todayRows[todayRows.length - 1][1];

  const num = parseInt(last.replace("Q","")) + 1;

  return "Q" + String(num).padStart(3,"0");
}

// ========================
// MENU
// ========================

function showMenu(chatId){

  bot.sendMessage(chatId,"📋 *Menu Antrian*\nSilakan pilih menu:",{
    parse_mode:"Markdown",
    reply_markup:{
      keyboard:[
        ["📝 Buat Antrian"],
        ["📊 Lihat Antrian"]
      ],
      resize_keyboard:true
    }
  });

}

// ========================
// SERVICE
// ========================

function showService(chatId){

  bot.sendMessage(chatId,"🛠 Pilih *Jenis Layanan*:",{
    parse_mode:"Markdown",
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
// SHOW QUEUE
// ========================

async function showQueue(chatId){

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!C2:G`
  });

  const rows = res.data.values;

  if(!rows){
    bot.sendMessage(chatId,"📭 Belum ada antrian.");
    return;
  }

  let msg = "📊 *Daftar Antrian*\n\n";

  rows.forEach(r=>{
    msg += `🎟 ${r[0]} - ${r[1]} (${r[3]})\n`;
  });

  bot.sendMessage(chatId,msg,{parse_mode:"Markdown"});

}