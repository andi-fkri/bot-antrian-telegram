const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');

const TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "DATA";

const bot = new TelegramBot(TOKEN, { polling: true });

let userStep = {};
let userData = {};

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

function getWITATime(){
  return new Date().toLocaleString("id-ID",{
    timeZone:"Asia/Makassar",
    hour12:false
  });
}

function getWITADate(){
  return new Date().toLocaleDateString("id-ID",{
    timeZone:"Asia/Makassar"
  });
}

// ========================
// RESET HARIAN TANPA CRON
// ========================

let lastResetDate = getWITADate();

function checkDailyReset(){

  const today = getWITADate();

  if(today !== lastResetDate){
    lastResetDate = today;
    console.log("🔄 Reset antrian harian WITA");
  }

}

// ========================
// START
// ========================

bot.onText(/\/start/, (msg)=>{
  showMenu(msg.chat.id);
});

// ========================
// MESSAGE HANDLER
// ========================

bot.on("message", async(msg)=>{

  const chatId = msg.chat.id;
  const text = msg.text;

  if(!text) return;

  const step = userStep[chatId];

  // MENU

  if(text === "📝 Buat Antrian"){

    userStep[chatId] = "nama";

    bot.sendMessage(chatId,"👤 Silakan masukkan *Nama Anda* :",{
      parse_mode:"Markdown"
    });

    return;
  }

  if(text === "📊 Lihat Antrian"){
    showQueue(chatId);
    return;
  }

  // INPUT NAMA

  if(step === "nama"){

    userData[chatId] = {nama:text};

    userStep[chatId] = "hp";

    bot.sendMessage(chatId,"📞 Masukkan *Nomor HP* :",{
      parse_mode:"Markdown"
    });

    return;
  }

  // INPUT HP

  if(step === "hp"){

    userData[chatId].hp = text;

    userStep[chatId] = "layanan";

    showService(chatId);

    return;
  }

  // INPUT LAYANAN

  if(step === "layanan"){

    userData[chatId].layanan = text;

    userStep[chatId] = "keluhan";

    bot.sendMessage(chatId,"⚠️ Masukkan *Keluhan Anda* :",{
      parse_mode:"Markdown"
    });

    return;
  }

  // INPUT KELUHAN

  if(step === "keluhan"){

    userData[chatId].keluhan = text;

    userStep[chatId] = "inputer";

    bot.sendMessage(chatId,"👨‍💻 Masukkan *Nama Inputer* :",{
      parse_mode:"Markdown"
    });

    return;
  }

  // INPUT INPUTER

  if(step === "inputer"){

    userData[chatId].inputer = text;

    const nama = userData[chatId].nama;
    const hp = userData[chatId].hp;
    const layanan = userData[chatId].layanan;
    const keluhan = userData[chatId].keluhan;
    const inputer = userData[chatId].inputer;

    const nomor = await generateQueueNumber();

    const timestamp = getWITATime();
    const tanggal = getWITADate();

    await sheets.spreadsheets.values.append({

      spreadsheetId:SPREADSHEET_ID,
      range:SHEET_NAME,
      valueInputOption:"USER_ENTERED",

      requestBody:{
        values:[[
          timestamp,
          tanggal,
          nomor,
          nama,
          hp,
          layanan,
          keluhan,
          inputer
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
// GENERATE NOMOR ANTRIAN
// ========================

async function generateQueueNumber(){

  checkDailyReset();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId:SPREADSHEET_ID,
    range:`${SHEET_NAME}!B2:C`
  });

  const rows = res.data.values || [];

  const today = getWITADate();

  const todayRows = rows.filter(r => r[0] === today);

  if(todayRows.length === 0){
    return "Q001";
  }

  const numbers = todayRows.map(r=>{
    const n = parseInt((r[1] || "").replace("Q",""));
    return isNaN(n) ? 0 : n;
  });

  const lastNum = Math.max(...numbers);

  return "Q"+String(lastNum+1).padStart(3,"0");

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
// TAMPILKAN ANTRIAN
// ========================

async function showQueue(chatId){

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId:SPREADSHEET_ID,
    range:`${SHEET_NAME}!B2:H`
  });

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

  let msg = `📊 *Daftar Antrian Hari Ini*\n`;
  msg += `📅 ${today}\n\n`;

  todayRows.forEach(r=>{
    msg += `🎟 ${r[1]} - ${r[2]} (${r[4]})\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━\n`;
  msg += `ℹ️ *Petunjuk:*\n`;
  msg += `• Ketik */start* untuk kembali ke menu utama`;

  bot.sendMessage(chatId,msg,{parse_mode:"Markdown"});

}
