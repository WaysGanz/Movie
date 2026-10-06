console.log('Memulai bot...');
const { Telegraf, Markup } = require('telegraf');
const cooldowns = {};
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const admin = require("firebase-admin");
const os = require("os");
const moment = require("moment-timezone");
const chalk = require('chalk');
const axios = require('axios');
const archiver = require('archiver');
const FormData = require('form-data');
const { createCanvas, loadImage } = require('canvas');
const config = require('./config');
const path = require('path');
const { exec, execSync } = require('child_process');
const pLimit = require('p-limit');
const limit = pLimit(20);

//======================== DATABASE ====================

const OWNER_ID = config.ownerId.toString();
const TOKEN = config.telegramBotToken;
const OWNER = config.ownerId;
const USERNAME_OWNER = config.usernameOwner;
const VERSION = config.version;
const NAMA_BOT = config.namaBot;
const bot = new Telegraf(config.telegramBotToken);
const checkAccess = (level) => async (ctx, next) => {
    const userId = ctx.from.id;
    if (level === 'owner' && userId !== config.ownerId) {
        return ctx.reply(config.message.owner, { parse_mode: 'Markdown' });
    }
    await next();
};

let botLaunched = false;

const CHANNEL_ID = config.channelId;
const GROUP_ID = config.groupId;
const REF_FILE = './database/referral.json';
const userDBPath = path.join(__dirname, 'database', 'users.json');
const dataFile = path.join(__dirname, "./database/roles.json");
let roleData = { owners: [], premiums: [] };

// Auto create database folder & required files
const databaseDir = path.join(__dirname, "database");

if (!fs.existsSync(databaseDir)) {
  fs.mkdirSync(databaseDir, { recursive: true });
}

if (!fs.existsSync(REF_FILE)) {
  fs.writeFileSync(REF_FILE, '{}');
}

if (!fs.existsSync(userDBPath)) {
  fs.writeFileSync(userDBPath, JSON.stringify([]));
}

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({ owners: [], premiums: [] }, null, 2));
}

let crashed = false;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Global error handler supaya bot tidak force close saat ada error kecil
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

async function startBot() {
  try {
    console.log(chalk.green("🔓 Token diverifikasi — memulai bot..."));

    if (typeof startWhatsAppClient === "function") {
      await startWhatsAppClient();
    }

    if (botLaunched) {
      console.log(chalk.yellow("⚠️ Bot Telegram sudah berjalan, skip launch ulang."));
      return;
    }

    if (bot && typeof bot.launch === "function") {
      await bot.launch();
      botLaunched = true;
      console.log(chalk.green("✅ Bot Telegram berhasil dijalankan!"));
    }

    process.once("SIGINT", () => {
      console.log("⛔ SIGINT diterima, bot dimatikan...");
      bot.stop("SIGINT");
      botLaunched = false;
    });

    process.once("SIGTERM", () => {
      console.log("⛔ SIGTERM diterima, bot dimatikan...");
      bot.stop("SIGTERM");
      botLaunched = false;
    });

  } catch (e) {
    console.error("⚠️ Gagal menjalankan bot:", e.message || e);
    await sendVerificationRequest("Gagal startBot (exception)");
    hardCrash("Gagal startBot");
  }
}

function showBanner() {
  console.clear();
  console.log(chalk.blue(`
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠛⢛⣛⣛⠛⠛⡛⠻⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠉⣠⠶⢛⣋⣿⠿⠷⠒⠾⣿⣦⡈⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠁⠀⣨⣴⠿⢛⣛⣭⡧⢚⣛⢿⣦⡙⢿⣷⡈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠁⠀⣠⣾⢛⣥⣾⠟⣩⣤⣄⣘⡛⢷⣌⠻⣮⢻⣷⡀⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⡄⠀⣴⠟⣡⣾⡟⣱⣿⢩⡿⣿⡿⢻⢊⢻⣧⡙⡜⣿⡄⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏⡔⢀⣼⠏⣰⣿⠌⢰⣿⠋⣾⣿⠇⠸⣦⢧⡀⢻⣷⣴⡘⣿⡄⠹⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡷⠁⣾⡏⣰⣿⠟⠀⠠⡅⠠⠥⠀⢠⣧⠙⠈⢷⠀⢻⡿⢡⠘⣧⠀⢿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠇⢰⡿⢀⣿⡇⠀⠀⠀⠀⢀⠉⢀⣾⣿⣷⡀⠈⠀⠈⣋⠈⠂⠸⠀⡸⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠀⣿⠇⠸⡏⠀⡀⠁⠒⠀⣀⣴⡟⠯⢭⣿⣿⠆⠀⡼⣽⡇⠀⠀⠀⣱⠘⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⠃⠀⠛⠀⠀⠀⢰⣿⣥⣶⣸⣿⣿⣦⡆⢀⢈⣙⢀⣦⡇⡟⠁⠀⠀⠀⠏⣰⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⠿⠀⠀⠰⠀⠘⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣷⠟⣡⣿⠏⠉⠀⠀⢘⣠⣠⣾⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣾⣦⠠⡄⠀⠆⠙⢿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠋⡀⠀⠁⠀⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠟⠛⠀⠀⠀⠀⢠⣦⡙⢿⣿⣿⣿⠿⢛⡡⡰⢠⡃⢀⠀⠸⢶⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⢿⣿⣿⣿⢿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠙⢃⠀⣬⠉⣠⣴⠟⠠⠶⠿⠛⠀⠀⠀⠀⠉⠛⠿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣏⣭⣶⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣷⣶⡜⢛⣵⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠻⣿⣿⣿⣿
⣿⡿⠷⢨⣿⠏⠁⢀⡀⠀⠀⠀⠀⠀⠀⣀⣀⣀⠀⠀⠀⠈⠁⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿
⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠄⠉⠀⢀⠀⠀⡒⠒⠻⠹⣫⣓⡲⣶⡤⣤⣀⠀⠀⠀⠀⠀⢰⢿⣧⣀⢴⣦⡀⠀⢸⣿⣿
⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠈⠘⠃⠁⠀⢄⣀⣀⡒⠒⠁⠂⠀⣼⣿⢟⣠⡟⠀⠀⠀⣿⣿
⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠜⣡⣴⣯⣽⡒⠦⣤⣤⣀⠀⠀⠀⠀⠈⠉⠉⠙⠉⠁⠀⠀⠀⠉⠃⠾⠿⠃⠀⠀⠀⠸⣿
⣿⡀⠀⠀⠀⠀⠀⠀⠀⢀⣾⣿⣿⣿⣿⣿⣿⣦⡈⠉⠛⠛⠛⣛⣓⣶⣶⡒⠢⢤⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿
⣿⡇⠀⠀⠀⠀⠀⠀⢀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣾⣿⣿⣿⣿⣿⣿⣿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿
⣿⣿⠀⠀⠀⠀⠀⠀⢸⣿⣀⣠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿
⣿⣿⣷⠀⠀⠀⠀⠀⠘⣿⡿⣿⣿⣿⣿⣿⣿⡿⣿⣿⢸⣿⣿⣿⣿⡇⠀⢸⣿⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻
⣿⣿⣿⣧⡀⠀⠀⠀⠀⠙⠻⣿⣿⣿⣿⣿⠟⣱⣿⣿⡌⣿⣿⣿⣿⣷⣾⣿⣿⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸
⣿⣿⣿⣿⣿⣦⣄⣀⣀⣠⢵⣤⣉⣉⣩⣴⣾⣿⣿⣿⣷⡈⠻⣿⣿⣿⣿⣾⡿⠛⣰⡇⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡘⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣄⣉⣉⣉⣁⣶⣾⡿⢡⣾⣄⠀⠀⠀⠀⠀⠀⠀⠀⣰
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⢸⣿⣿⣦⡀⠀⠀⠀⠀⠀⣴⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠃⠹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢃⣾⣿⣿⣿⣿⣦⣤⣤⣴⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⡿⢋⢀⡎⣰⣜⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠁⡀⢈⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⡿⢁⢀⣿⢸⠟⣨⡻⣶⣍⣙⣛⠿⠿⠿⠿⠿⠿⠿⢛⣉⣄⣴⡄⣿⣎⢆⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⡿⢡⠁⣸⠇⣾⣼⣿⣿⣶⡭⣙⣻⠿⠿⠿⣿⣿⠿⠿⠟⣋⣅⢿⣷⢸⣿⡄⢄⠻⣿⣿⣿⣿⣿⣿⣿⣿`));
  console.log(chalk.cyan.bold("==========================================="));
  console.log(chalk.greenBright.bold(`🤖 ${NAMA_BOT} 𝗩${VERSION}`));
  console.log(chalk.yellow(`📅 ${moment().tz('Asia/Jakarta').format('dddd, DD MMMM YYYY HH:mm:ss')}`));
  console.log(chalk.blueBright(`🧠 Developer: ${USERNAME_OWNER}`));
  console.log(chalk.magenta(`💻 Platform: ${os.type()} ${os.release()}`));
  console.log(chalk.white(`🧩 Node.js version: ${process.version}`));
  console.log(chalk.greenBright(`🚀 Status: Verifikasi Token Dari Database....`));
  console.log(chalk.cyan.bold("==========================================="));
}

//======================== FUNCTION AUTO BACKUP ====================

async function autoBackup() {
  try {
    const backupDir = path.join(__dirname, 'backup');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipPath = path.join(backupDir, `backup-${timestamp}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    const foldersToBackup = [
      'database',
      'waysexxy.js',
      'config.js',
      'package.json'
    ];

    for (const folder of foldersToBackup) {
      const folderPath = path.join(__dirname, folder);
      if (fs.existsSync(folderPath)) {
        const stats = fs.lstatSync(folderPath);
        if (stats.isDirectory()) {
          archive.directory(folderPath, folder);
        } else {
          archive.file(folderPath, { name: folder });
        }
      }
    }

    await archive.finalize();

    output.on('close', async () => {
      console.log(`✅ Backup selesai: ${zipPath} (${archive.pointer()} bytes)`);

      try {
        await bot.telegram.sendDocument(
          config.ownerId,
          { source: zipPath },
          { caption: `📦 Backup otomatis berhasil dibuat pada ${new Date().toLocaleString('id-ID')}` }
        );
        console.log('📤 Backup berhasil dikirim ke Telegram owner.');
      } catch (err) {
        console.error('❌ Gagal mengirim backup ke Telegram:', err.message);
      }
    });
  } catch (err) {
    console.error('❌ Gagal membuat backup:', err.message);
  }
}

//======================== FUNCTION ====================

function loadRefs() {
  return JSON.parse(fs.readFileSync(REF_FILE));
}
function saveRefs(data) {
  fs.writeFileSync(REF_FILE, JSON.stringify(data, null, 2));
}

function loadUsers() {
  if (!fs.existsSync(userDBPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(userDBPath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Gagal membaca userDB:", err.message);
    return [];
  }
}

function saveUsers(data) {
  try {
    let oldData = [];
    if (fs.existsSync(userDBPath)) {
      oldData = JSON.parse(fs.readFileSync(userDBPath, "utf-8"));
      if (!Array.isArray(oldData)) oldData = [];
    }

    const merged = [...new Set([...oldData, ...data])];

    fs.writeFileSync(userDBPath, JSON.stringify(merged, null, 2));
  } catch (err) {
    console.error("Gagal menyimpan userDB:", err.message);
  }
}

function loadRoles() {
  if (fs.existsSync(dataFile)) {
    try {
      roleData = JSON.parse(fs.readFileSync(dataFile));

      if (!Array.isArray(roleData.owners)) roleData.owners = [];
      if (!Array.isArray(roleData.premiums)) roleData.premiums = [];

      roleData.owners = roleData.owners.map(o =>
        typeof o === "string"
          ? { id: o, expireAt: "permanent", startAt: Date.now() }
          : o
      );
      roleData.premiums = roleData.premiums.map(p =>
        typeof p === "string"
          ? { id: p, expireAt: "permanent", startAt: Date.now() }
          : p
      );
    } catch (err) {
      console.error("⚠️ Gagal baca roles.json, reset data:", err);
      roleData = { owners: [], premiums: [] };
      saveRoles();
    }
  } else {
    roleData = { owners: [], premiums: [] };
    saveRoles();
  }
}

function saveRoles() {
  fs.writeFileSync(dataFile, JSON.stringify(roleData, null, 2));
}

loadRoles();

function isExpired(expireAt) {
  if (!expireAt) return true;
  if (expireAt === "permanent") return false;
  return Date.now() > expireAt;
}

function isOwner(id) {
  const uid = id.toString();
  if (uid === config.ownerId.toString()) return true;

  const owner = roleData.owners.find(o => o.id === uid);
  if (!owner) return false;
  return !isExpired(owner.expireAt);
}

function isPremium(id) {
  const uid = id.toString();
  if (isOwner(uid)) return true;

  const prem = roleData.premiums.find(p => p.id === uid);
  if (!prem) return false;
  return !isExpired(prem.expireAt);
}

function parseDuration(dur) {
  if (!dur) return null;
  const unit = dur.slice(-1).toLowerCase();
  const num = parseInt(dur);
  const now = Date.now();

  switch (unit) {
    case "d":
      return now + num * 24 * 60 * 60 * 1000;
    case "w":
      return now + num * 7 * 24 * 60 * 60 * 1000;
    case "m":
      return now + num * 30 * 24 * 60 * 60 * 1000;
    case "p":
      return "permanent";
    default:
      return null;
  }
}

function formatDuration(dur) {
  if (dur === "permanent") return "Permanen";
  const sisa = dur - Date.now();
  const hari = Math.max(1, Math.ceil(sisa / (24 * 60 * 60 * 1000)));
  return `${hari} hari`;
}

function formatDate(ts) {
  if (ts === "permanent") return "∞";
  const d = new Date(ts);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function getDurationText(expireAt, startAt) {
  if (expireAt === "permanent") return "Permanen";
  const diff = expireAt - startAt;
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (days % 30 === 0) return `${days / 30} bulan`;
  if (days % 7 === 0) return `${days / 7} minggu`;
  return `${days} hari`;
}

function generatePagedList(items, page = 1, type = "premium") {
  const perPage = 15;
  const totalPages = Math.ceil(items.length / perPage);
  const startIndex = (page - 1) * perPage;
  const pagedItems = items.slice(startIndex, startIndex + perPage);

  let text = type === "owner"
    ? "<blockquote>👑 <b>Daftar Owner</b>\n━━━━━━━━━━━━━━━━━━\n</blockquote>"
    : "<blockquote>📜 <b>Daftar User Premium</b>\n━━━━━━━━━━━━━━━━━━\n</blockquote>";

  for (const user of pagedItems) {
    const { id, expireAt, startAt } = user;
    if (isExpired(expireAt)) continue;

    const mulai = formatDate(startAt);
    const akhir = formatDate(expireAt);
    const durasi = getDurationText(expireAt, startAt);

    text += `<blockquote>👤 <b>ID:</b> <code>${id}</code>\n⏱ <b>Durasi:</b> ${durasi}\n📅 <b>Tanggal:</b> ${mulai} - ${akhir}\n</blockquote>`;
  }

  text += `<blockquote>📄 Halaman ${page} / ${totalPages}</blockquote>`;

  const buttons = [];
  if (page > 1) buttons.push({ text: "◀️ Prev", callback_data: `${type}_page_${page - 1}` });
  if (page < totalPages) buttons.push({ text: "Next ▶️", callback_data: `${type}_page_${page + 1}` });

  return { text, buttons: buttons.length ? [buttons] : [] };
}

function generateUserList(users, page = 1) {
  const perPage = 20;
  const totalPages = Math.ceil(users.length / perPage);
  const startIndex = (page - 1) * perPage;
  const pageIds = users.slice(startIndex, startIndex + perPage);

  let text = `<blockquote><b>📊 Total ID Terdaftar</b>\n━━━━━━━━━━━━━━━━━━\n</blockquote>`;

  pageIds.forEach((id, index) => {
    text += `<blockquote>${startIndex + index + 1}. <code>${id}</code>\n</blockquote>`;
  });

  text += `<blockquote>📄 <b>Halaman:</b> ${page} / ${totalPages}\n👥 <b>Total ID:</b> ${users.length}</blockquote>`;

  const buttons = [];
  if (page > 1) buttons.push({ text: "◀️ Prev", callback_data: `users_page_${page - 1}` });
  if (page < totalPages) buttons.push({ text: "Next ▶️", callback_data: `users_page_${page + 1}` });

  return { text, buttons: buttons.length ? [buttons] : [] };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function uploadToCatbox(fileBuffer, filename) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fileBuffer, filename);

  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 60000 
  });

  const text = res.data;
  if (typeof text !== 'string' || text.startsWith('ERROR')) {
    throw new Error('Upload gagal: ' + text);
  }

  return text.trim();
}

function syncReferralBonuses() {
  const refData = loadRefs();
  let updated = 0;

  for (const userId in refData) {
    const user = refData[userId];
    const invitedCount = user.invited?.length || 0;

    if (user.bonusChecks === undefined) user.bonusChecks = 0;
    if (user.totalInvited === undefined) user.totalInvited = 0;

    const earnedBonuses = Math.floor(invitedCount / 5) * 5;

    if (earnedBonuses > user.totalInvited) {
      const newBonus = earnedBonuses - user.totalInvited;
      user.bonusChecks += newBonus;
      user.totalInvited = earnedBonuses;
      updated++;
    }
  }

  saveRefs(refData);
  console.log(`✅ Sinkronisasi referral selesai. ${updated} user diperbarui.`);
}

//======================== FUNCTION CONNECT ====================

let waClient = null;
let waConnectionStatus = 'closed';

const store = makeInMemoryStore({ 
    logger: pino().child({ level: 'silent', stream: 'store' }) 
});

async function startWhatsAppClient() {
    console.log("Mencoba memulai koneksi WhatsApp...");

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const { version } = await fetchLatestBaileysVersion();

    const connectionOptions = {
        version,
        keepAliveIntervalMs: 30000,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        getMessage: async (key) => ({
            conversation: 'P',
        }),
    };

    waClient = makeWASocket(connectionOptions);
    
    if (!waClient.authState.creds.registered) {
  console.log("📲 Menunggu pairing...");
}

    waClient.ev.on('creds.update', saveCreds);
    store.bind(waClient.ev);

    waClient.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection) {
        waConnectionStatus = connection;
        console.log('🔌 Status koneksi WA:', connection);
    }
        if (connection === 'open') {
            console.log(chalk.red.bold(`
╭─────────────────
┃${chalk.green.bold('WHATSAPP CONNECTED')}
╰─────────────────`));
        }

        if (connection === 'close') {
            const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(
                chalk.red.bold(`
╭─────────────────
┃${chalk.red.bold('WHATSAPP DISCONNECTED')}
╰─────────────────`),
                shouldReconnect ? chalk.red.bold(`
╭─────────────────
┃${chalk.red.bold('RECONNECTING AGAIN')}
╰─────────────────`) : ''
            );

            if (shouldReconnect) {
                setTimeout(startWhatsAppClient, 5000);
            } else {
                console.log(chalk.red.bold("Tidak bisa menyambung ulang."));
                waClient = null;
            }
        }
    });
}

function capitalize(str) {
  if (!str) return '';

  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function checkMetaBusiness(jid) {

  try {

    const businessProfile =
      await waClient.getBusinessProfile(jid);

    if (!businessProfile) {

      return {
        isBusiness: false,
        businessData: null
      };
    }

    return {
      isBusiness: true,
      businessData: businessProfile
    };

  } catch (error) {

    return {
      isBusiness: false,
      businessData: null
    };
  }
}

function getJamPercentage(bio, setAt, metaBusiness) {
  let base = 50;

  if (bio && bio.length > 0) {
    if (bio.length > 100) base -= 20;
    else if (bio.length > 50) base -= 15;
    else if (bio.length > 20) base -= 10;
    else base -= 5;
  } else base += 15;

  if (setAt) {
    const now = new Date();
    const bioDate = new Date(setAt);
    const diffDays = Math.ceil(Math.abs(now - bioDate) / (1000 * 60 * 60 * 24));

    if (diffDays < 30) base -= 20;
    else if (diffDays < 90) base -= 10;
    else if (diffDays > 365) base += 15;
    else if (diffDays > 730) base += 25;
  } else base += 10;

  if (metaBusiness) base -= 25;
  base = Math.max(10, Math.min(90, base));

  return Math.round(base / 10) * 10;
}

async function handleBioCheck(
  ctx,
  numbersToCheck,
  mode = 'normal'
) {
  if (!waClient || waConnectionStatus !== 'open') {
    return ctx.reply(config.message.waNotConnected, {
      parse_mode: 'Markdown'
    });
  }

  if (!numbersToCheck || numbersToCheck.length === 0) {
    return ctx.reply(
      `<blockquote>Mana nomor yang mau dicek?</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }

  const progressMsg = await ctx.reply(
    `<blockquote>⏳ Memulai pengecekan ${numbersToCheck.length} nomor...</blockquote>`,
    { parse_mode: 'HTML' }
  );

  let results = [];

  const jids = numbersToCheck.map(num => num.trim() + '@s.whatsapp.net');

  // cek nomor terdaftar
  const existenceResults = await waClient.onWhatsApp(...jids);

  const registered = [];
  const notRegistered = [];

  existenceResults.forEach(res => {
    if (res.exists) {
      registered.push(res.jid);
    } else {
      notRegistered.push(res.jid.split('@')[0]);
    }
  });

  // progress
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    progressMsg.message_id,
    null,
    `📡 Nomor terdaftar: ${registered.length}\n🚫 Tidak terdaftar: ${notRegistered.length}`
  );

  // =========================
// BATCH CHECKING
// =========================

let batchSize = 50;
let delayTime = 200;

switch (mode) {

  case 'cepat':
    batchSize = 120;
    delayTime = 50;
    break;

  case 'normal':
    batchSize = 60;
    delayTime = 150;
    break;

  case 'lambat':
    batchSize = 25;
    delayTime = 500;
    break;
}

for (let i = 0; i < registered.length; i += batchSize) {

  const batch = registered.slice(i, i + batchSize);

  const promises = batch.map(jid =>
  limit(async () => {

    const number = jid.split('@')[0];

    try {

      // FETCH BIO
      const status = await waClient.fetchStatus(jid);

      const data = Array.isArray(status)
        ? status[0]
        : status;

      const bio =
        data?.status?.text ||
        data?.status ||
        '-';

      const setAt = data?.setAt || null;

      // META BUSINESS
      const metaResult =
        await checkMetaBusiness(jid);

      const metaBusiness =
        metaResult?.isBusiness || false;

      const businessData =
        metaResult?.businessData || {};

      // BUSINESS TYPE
      let metaBusinessType = null;

      if (metaBusiness) {

        if (
          businessData?.verifiedLevel ||
          businessData?.isVerified
        ) {

          metaBusinessType = 'exclusive';

        } else {

          metaBusinessType = 'low';
        }
      }

      // JAM %
      const jamPercentage =
        getJamPercentage(
          bio,
          setAt,
          metaBusiness
        );

      // SAVE RESULT
      results.push({
        number,
        registered: true,
        bio,
        setAt,
        metaBusiness,
        metaBusinessType,
        jamPercentage,

        metaData: {
          name:
            businessData?.businessName ||
            businessData?.name ||
            '-',

          description:
            businessData?.description ||
            '-',

          timezone:
            businessData?.timezone ||
            '-',

          category:
            businessData?.category ||
            '-',

          businessSince:
            businessData?.businessHours?.timezone ||
            '-',

          catalog:
            businessData?.catalog
              ? true
              : false,

          email:
            businessData?.email ||
            '-',

          cover:
            businessData?.coverPhoto?.url ||
            '-'
        }
      });

    } catch (err) {

      console.log(
        `Error ${number}`,
        err.message
      );

      results.push({
        number,
        registered: false
      });
    }
  })
);

  await Promise.allSettled(promises);

  // UPDATE PROGRESS
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    progressMsg.message_id,
    null,
    `⏳ Sedang mengecek...

✅ Progress:
${Math.min(i + batch.length, registered.length)}/${registered.length}

📝 Bio:
${results.filter(v => v.bio && v.bio !== '-').length}

🏢 Business:
${results.filter(v => v.metaBusiness).length}`
  );

  await delay(delayTime);
    }

  // =========================
  // FILTER DATA
  // =========================

  const withBio = results.filter(r => r.registered && r.bio);

  const noBio = results.filter(r => r.registered && !r.bio);

  const notReg = notRegistered;

  // =========================
  // META BUSINESS
  // =========================

  const businessUsers = results.filter(r => r.metaBusiness);

  let businessExclusive = 0;
  let businessStandard = 0;
  let businessLow = 0;
  let businessSuite = 0;

  businessUsers.forEach(r => {
    const type = (r.metaBusinessType || 'low').toLowerCase();

    if (type.includes('exclusive')) {
      businessExclusive++;
    } else if (type.includes('standard')) {
      businessStandard++;
    } else if (type.includes('suite')) {
      businessSuite++;
    } else {
      businessLow++;
    }
  });

  // =========================
  // TAHUN BIO
  // =========================

  const bioYearStats = {};

  withBio.forEach(r => {
    if (!r.setAt) return;

    const year = new Date(r.setAt).getFullYear();

    if (!bioYearStats[year]) {
      bioYearStats[year] = 0;
    }

    bioYearStats[year]++;
  });

  // =========================
// FILE TXT
// =========================

const timestamp = Date.now();
const filename = `hasil_cekbio_${timestamp}.txt`;

let fileContent = `HASIL CEK BIO WHATSAPP\n\n`;

fileContent += `Total Nomor Dicek: ${numbersToCheck.length}\n`;
fileContent += `Nomor Terdaftar di WA: ${registered.length}\n\n`;

fileContent += `Statistik Ringkasan:\n`;
fileContent += `  - Terdaftar WA: ${registered.length}\n`;
fileContent += `  - Tidak Terdaftar WA: ${notReg.length}\n`;
fileContent += `  - Memiliki Bio: ${withBio.length}\n`;
fileContent += `  - Tanpa Bio: ${noBio.length}\n`;
fileContent += `  - Business Meta: ${businessUsers.length}\n`;
fileContent += `    ├ Eklusif: ${businessExclusive}\n`;
fileContent += `    ├ Standart: ${businessStandard}\n`;
fileContent += `    ├ Low: ${businessLow}\n`;
fileContent += `    └ Suite: ${businessSuite}\n\n`;

fileContent += `Statistik Bio Berdasarkan Tahun Set:\n`;

Object.keys(bioYearStats)
  .sort()
  .forEach(year => {
    fileContent += `  - ${year}: ${bioYearStats[year]}\n`;
  });

fileContent += `\n`;

// =========================
// DETAIL NOMOR DENGAN BIO
// =========================

if (withBio.length > 0) {

  fileContent += `[ NOMOR DENGAN BIO (${withBio.length}) ]\n\n`;

  withBio.forEach((r, index) => {

    const dateStr = r.setAt
      ? new Date(r.setAt).toLocaleString('id-ID')
      : '-';

    const businessType =
      r.metaBusinessType
        ? `${capitalize(r.metaBusinessType)} Meta Business`
        : 'Non Business';

    const meta = r.metaData || {};

    fileContent += `[${index + 1}] Nomor: ${r.number} (${businessType})\n`;

    fileContent += `Bio: ${r.bio || '-'}\n`;

    fileContent += `Set: ${dateStr}\n`;

    if (r.metaBusiness) {

      fileContent += `Business Details:\n`;

      fileContent += `    ├ Name: ${meta.name || '-'}\n`;

      fileContent += `    ├ Desc: ${meta.description || '-'}\n`;

      fileContent += `    ├ Timezone: ${meta.timezone || '-'}\n`;

      fileContent += `    ├ Category: ${meta.category || '-'}\n`;

      fileContent += `    ├ Since: ${meta.businessSince || '-'}\n`;

      fileContent += `    ├ Katalog: ${
        meta.catalog ? 'Katalog tersedia' : 'Tidak ada katalog'
      }\n`;

      fileContent += `    ├ Email: ${meta.email || '-'}\n`;

      fileContent += `    └ Cover: ${meta.cover || '-'}\n`;

    }

    fileContent += `\n`;
  });
}

// =========================
// TANPA BIO
// =========================

if (noBio.length > 0) {

  fileContent += `[ NOMOR TANPA BIO (${noBio.length}) ]\n\n`;

  noBio.forEach((r, index) => {

    fileContent += `[${index + 1}] ${r.number}\n`;

  });

  fileContent += `\n`;
}

// =========================
// TIDAK TERDAFTAR
// =========================

if (notReg.length > 0) {

  fileContent += `[ NOMOR TIDAK TERDAFTAR (${notReg.length}) ]\n\n`;

  notReg.forEach((num, index) => {

    fileContent += `[${index + 1}] ${num}\n`;

  });

  fileContent += `\n`;
}
  

  // =========================
  // SIMPAN FILE
  // =========================

  fs.writeFileSync(filename, fileContent, 'utf8');

  // progress final
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    progressMsg.message_id,
    null,
    `✅ Checking selesai\n📁 Mengirim file hasil...`
  );

  // auto kirim file
  await ctx.replyWithDocument(
  {
    source: filename
  },
  {
    caption:
`
📊 HASIL CEK BIO WHATSAPP

Total Nomor Dicek: ${numbersToCheck.length}
Nomor Terdaftar di WA: ${registered.length}

Statistik Ringkasan:
• Terdaftar WA: ${registered.length}
• Tidak Terdaftar WA: ${notReg.length}
• Memiliki Bio: ${withBio.length}
• Tanpa Bio: ${noBio.length}

Business Meta:
├ Eklusif: ${businessExclusive}
├ Standart: ${businessStandard}
├ Low: ${businessLow}
└ Suite: ${businessSuite}

📁 File berhasil dibuat`,
    parse_mode: 'HTML'
  }
);

  // hapus file
  fs.unlinkSync(filename);
}

const getUptime = () => {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    return `${hours}h ${minutes}m ${seconds}s`;
};

async function checkPairingStatus(number) {

  try {

    const jid = number + '@s.whatsapp.net';

    const result =
      await waClient.onWhatsApp(jid);

    if (!result || !result[0]) {

      return false;
    }

    return result[0].exists;

  } catch {

    return false;
  }
}
// ========================= AUTO SAVE USER PRIVATE =========================

bot.use(async (ctx, next) => {
  try {

    if (ctx.chat?.type === 'private') {
      const userId = ctx.from.id.toString();
      const userDBPath = path.join(__dirname, 'database', 'users.json');
      let users = [];

      try {
        if (fs.existsSync(userDBPath)) {
          users = JSON.parse(fs.readFileSync(userDBPath, 'utf8') || '[]');
        } else {
          fs.writeFileSync(userDBPath, JSON.stringify([]));
        }
      } catch (e) {
        console.error('⚠️ users.json rusak, dibuat ulang:', e.message);
        users = [];
        fs.writeFileSync(userDBPath, JSON.stringify([]));
      }

      if (!users.includes(userId)) {
        users.push(userId);
        fs.writeFileSync(userDBPath, JSON.stringify(users, null, 2));
        console.log(`✅ User baru disimpan otomatis: ${userId}`);
      }
    }
  } catch (err) {
    console.error('❌ Gagal auto-save user:', err.message);
  }

  await next();
});

//======================== COMMAND FITUR ====================

bot.command('start', async (ctx) => {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const wakturun = getUptime();
  const refData = loadRefs();
  const CHANNEL_ID = config.channelId;
  const GROUP_ID = config.groupId;
  
  const startPayload = ctx.message.text.split(' ')[1];
  if (startPayload && startPayload.startsWith('ref_')) {
    const referrerId = startPayload.replace('ref_', '');
    if (referrerId !== userId) {
      if (!refData[referrerId]) refData[referrerId] = { invited: [], bonusChecks: 0, totalInvited: 0 };

      if (!refData[referrerId].invited.includes(userId)) {
        refData[referrerId].invited.push(userId);
        saveRefs(refData);
        console.log(`✅ ${userId} berhasil jadi referral untuk ${referrerId}`);

        try {
          await ctx.telegram.sendMessage(
            referrerId,
            `<blockquote>📢 <b>Kabar Baik!</b>\n👤 ${userName} baru saja join menggunakan link referral kamu 🎉</blockquote>`,
            { parse_mode: 'HTML' }
          );
        } catch (err) {
          console.warn(`⚠️ Gagal kirim notif ke ${referrerId}:`, err.message);
        }
      }
    }
  }
  
  try {
    const channelMember = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
    const groupMember = await ctx.telegram.getChatMember(GROUP_ID, userId);

    if (['left', 'kicked'].includes(channelMember.status) || ['left', 'kicked'].includes(groupMember.status)) {
      return ctx.replyWithPhoto(
        { source: './database/waysexxy1.jpg' },
        {
          caption: `<blockquote>🚫 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳
𝚃𝙾 𝚄𝚂𝙴 𝚃𝙷𝙴 𝙱𝙾𝚃, 𝙿𝙻𝙴𝙰𝚂𝙴 𝚁𝙴𝙰𝙳 𝚃𝙷𝙴 𝚁𝚄𝙻𝙴𝚂 𝙱𝙴𝙻𝙾𝚆: 

1. 𝙹𝙾𝙸𝙽 𝙰 𝙲𝙷𝙰𝙽𝙽𝙴𝙻 𝙾𝚁 𝙶𝚁𝙾𝚄𝙿.
2. 𝙸𝙽𝚅𝙸𝚃𝙴 𝙵𝚁𝙸𝙴𝙽𝙳𝚂 𝚅𝙸𝙰 𝚁𝙴𝙵𝙴𝚁𝚁𝙰𝙻 𝙵𝙾𝚁 𝙵𝚁𝙴𝙴 𝙿𝙾𝙸𝙽𝚃𝚂.

𝙾𝙽𝙲𝙴 𝚈𝙾𝚄'𝚅𝙴 𝙵𝙾𝙻𝙻𝙾𝚆𝙴𝙳 𝚃𝙷𝙴 𝚂𝚃𝙴𝙿𝚂 𝙰𝙱𝙾𝚅𝙴, 𝚈𝙾𝚄 𝙲𝙰𝙽 𝙲𝙾𝙽𝚃𝙸𝙽𝚄𝙴 𝚄𝚂𝙸𝙽𝙶 𝚃𝙷𝙴 𝙱𝙾𝚃.
© wāys
</blockquote>`,
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [{ text: '📢 Join Channel', url: `https://t.me/${CHANNEL_ID.replace('@', '')}` }],
            [{ text: '👥 Join Group', url: `https://t.me/${GROUP_ID.replace('@', '')}` }]
          ])
        }
      );
    }

    const caption = `<blockquote>🪐 Ciao fratello ${userName} Sono un bot di controllo della biografia di WhatsApp sviluppato da waysexxy.
╔─═⊱ 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝚄𝚃𝙰𝙼𝙰 ─═⬣
║ 𝙽𝙰𝙼𝙴 : 𝙱𝙾𝚃 𝙲𝙴𝙺 𝙱𝙸𝙾
║ 𝙸𝙳 : <code>${userId}</code>
║ 𝚄𝚂𝙴𝚁 : ${userName}
║ 𝙳𝙴𝚅 : @waysexxy
║ 𝙾𝙽𝙻𝙸𝙽𝙴 : ${wakturun}
╚━═━═━═━═━═━═━═━═━═━═⪼
</blockquote>`;

    await ctx.replyWithPhoto(
      { source: './database/waysexxy.jpg' },
      {
        caption,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            { text: '🪐 𝙼𝙴𝙽𝚄 𝙾𝚆𝙽𝙴𝚁', callback_data: 'owner' },
            { text: '🌐 𝙼𝙴𝙽𝚄 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿', callback_data: 'whatsapp' }
          ],
          [
            { text: '🚀 𝙼𝙴𝙽𝚄 𝙼𝙾𝚁𝙴', callback_data: 'more' }
          ],
          [
            { text: '👑 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁', url: 'https://t.me/waysexxy' }
          ]
        ])
      }
    );
    await ctx.replyWithAudio(
      { source: './database/waysexxy.mp3' },
    {
      title: '.⋆♱ 𝙿𝙰𝙸𝙽𝙵𝚄𝙻 𝙸𝚃𝚂𝙴𝙻𝙵',
      performer: 'ᯓ★ 𝙹𝚄𝚂𝚃 𝙵𝚁𝙸𝙴𝙽𝙳𝚂',
      caption: '♬⋆.𝚋𝚘𝚝 𝚋𝚢 𝚠𝚊𝚢𝚜𝚜 ˚ ',
      }
    );
  } catch (err) {
    console.error('Error cek member:', err);
    ctx.reply('⚠️ Terjadi kesalahan saat memeriksa keanggotaan.');
  }
});

bot.action('owner', async (ctx) => {
  try {
    await ctx.deleteMessage();
    await ctx.replyWithPhoto(
      { source: './database/waysexxy.jpg' },
      {
        caption: `<blockquote>╔─═⊱ 𝙼𝙴𝙽𝚄 𝙾𝚆𝙽𝙴𝚁 ─═⬣
║⁀➴ /pairing
║╰┈➤ 𝙺𝙾𝙽𝙴𝙺𝙸𝙽 𝙺𝙴 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿
║⁀➴ /clearsesi
║╰┈➤ 𝙼𝙴𝙽𝙶𝙷𝙰𝙿𝚄𝚂 𝙸𝚂𝙸 𝚂𝙴𝚂𝚂
║⁀➴ /broadcast
║╰┈➤ 𝚂𝙷𝙰𝚁𝙴 𝚃𝙴𝚇𝚃 𝙺𝙴 𝚂𝙴𝙼𝚄𝙰 𝚄𝚂𝙴𝚁
║⁀➴ /totaluser
║╰┈➤ 𝙹𝚄𝙼𝙻𝙰𝙷 𝙿𝙴𝙽𝙶𝙶𝚄𝙽𝙰
║⁀➴ /listid
║╰┈➤ 𝙳𝙰𝙵𝚃𝙰𝚁 𝙻𝙸𝚂𝚃 𝙸𝙳
║⁀➴ /addprem
║╰┈➤ 𝚃𝙰𝙼𝙱𝙰𝙷 𝙰𝙺𝚂𝙴𝚂 𝙿𝚁𝙴𝙼𝙸𝚄𝙼
║⁀➴ /delprem
║╰┈➤ 𝙷𝙰𝙿𝚄𝚂 𝙰𝙺𝚂𝙴𝚂 𝙿𝚁𝙴𝙼𝙸𝚄𝙼
║⁀➴ /listprem
║╰┈➤ 𝙳𝙰𝙵𝚃𝙰𝚁 𝚄𝚂𝙴𝚁 𝙿𝚁𝙴𝙼𝙸𝚄𝙼
║⁀➴ /addowner
║╰┈➤ 𝚃𝙰𝙼𝙱𝙰𝙷 𝙾𝚆𝙽𝙴𝚁 
║⁀➴ /delowner
║╰┈➤ 𝙷𝙰𝙿𝚄𝚂 𝙾𝚆𝙽𝙴𝚁
║⁀➴ /listowner
║╰┈➤ 𝙳𝙰𝙵𝚃𝙰𝚁 𝙾𝚆𝙽𝙴𝚁
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [{ text: '⬅️ Kembali', callback_data: 'back_to_start' }]
        ])
      }
    );
  } catch (err) {
    console.error('Error di owner menu:', err);
  }
});

bot.action('whatsapp', async (ctx) => {
  try {
    await ctx.deleteMessage();
    await ctx.replyWithPhoto(
      { source: './database/waysexxy.jpg' },
      {
        caption: `<blockquote>╔─═⊱ 𝙼𝙴𝙽𝚄 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿 ─═⬣
║⁀➴ /info
║╰┈➤ 𝙸𝙽𝙵𝙾 𝙲𝙴𝙺 𝙱𝙸𝙾
║⁀➴ /cekbio 628xxxxxxxx
║╰┈➤ 𝙲𝙴𝙺 𝙱𝙸𝙾 𝚅𝙸𝙰 𝙽𝙾𝙼𝙾𝚁
║⁀➴ /fixmerah
║╰┈➤ 𝙲𝚁𝙴𝙰𝚃𝙴 𝚃𝙴𝚇𝚃 𝙵𝙸𝚇 
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [{ text: '⬅️ Kembali', callback_data: 'back_to_start' }]
        ])
      }
    );
  } catch (err) {
    console.error('Error di whatsapp menu:', err);
  }
});

bot.action('more', async (ctx) => {
  try {
    await ctx.deleteMessage();
    await ctx.replyWithPhoto(
      { source: './database/waysexxy.jpg' },
      {
        caption: `<blockquote>╔─═⊱ 𝙼𝙴𝙽𝚄 𝙼𝙾𝚁𝙴 ─═⬣
║⁀➴ /cekid
║╰┈➤ 𝙲𝙴𝙺 𝙲𝙴𝙺 𝙸𝙳 𝚃𝙴𝙻𝙴
║⁀➴ /tourl
║╰┈➤ 𝙼𝙴𝙳𝙸𝙰 𝚃𝙾 𝚄𝚁𝙻
╚━═━═━═━═━═━═━═━═━═━═⪼</blockquote>`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [{ text: '⬅️ Kembali', callback_data: 'back_to_start' }]
        ])
      }
    );
  } catch (err) {
    console.error('Error di whatsapp menu:', err);
  }
});

bot.action('back_to_start', async (ctx) => {
  try {
    await ctx.deleteMessage();
    const userId = ctx.from.id.toString();
    const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
    const wakturun = getUptime();

    const caption = `<blockquote>🪐 Ciao fratello ${userName} Sono un bot di controllo della biografia di WhatsApp sviluppato da waysexxy.
╔─═⊱ 𝙳𝙰𝚂𝙷𝙱𝙾𝙰𝚁𝙳 𝚄𝚃𝙰𝙼𝙰 ─═⬣
║ 𝙽𝙰𝙼𝙴 : 𝙱𝙾𝚃 𝙲𝙴𝙺 𝙱𝙸𝙾
║ 𝙸𝙳 : <code>${userId}</code>
║ 𝚄𝚂𝙴𝚁 : ${userName}
║ 𝙳𝙴𝚅 : @waysexxy
║ 𝙾𝙽𝙻𝙸𝙽𝙴 : ${wakturun}
╚━═━═━═━═━═━═━═━═━═━═⪼
</blockquote>`;

    await ctx.replyWithPhoto(
      { source: './database/waysexxy.jpg' },
      {
        caption,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            { text: '🪐 𝙼𝙴𝙽𝚄 𝙾𝚆𝙽𝙴𝚁', callback_data: 'owner' },
            { text: '🌐 𝙼𝙴𝙽𝚄 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿', callback_data: 'whatsapp' }
          ],
          [
            { text: '🚀 𝙼𝙴𝙽𝚄 𝙼𝙾𝚁𝙴', callback_data: 'more' }
          ],
          [
            { text: '👑 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁', url: 'https://t.me/waysexxy' }
          ]
        ])
      }
    );
  } catch (err) {
    console.error('Error di back_to_start:', err);
  }
});

// ======================= 𝙼𝙴𝙽𝚄 𝙾𝚆𝙽𝙴𝚁 =======================
bot.command('pairing', checkAccess('owner'), async (ctx) => {
  try {
    if (!waClient) {
      return ctx.reply(
        '<blockquote>❌ WhatsApp belum connect.</blockquote>',
        { parse_mode: 'HTML' }
      );
    }

    const text = ctx.message.text.split(' ')[1];

    if (!text) {
      return ctx.reply(
        '<blockquote>⚠️ Contoh:\n<code>/pairing 628xxxx</code></blockquote>',
        { parse_mode: 'HTML' }
      );
    }

    const phoneNumber = text.replace(/[^0-9]/g, '');

    if (phoneNumber.length < 10) {
      return ctx.reply(
        '<blockquote>❌ Nomor tidak valid.</blockquote>',
        { parse_mode: 'HTML' }
      );
    }

    await ctx.reply(
      '<blockquote>⏳ Sedang membuat pairing code...</blockquote>',
      { parse_mode: 'HTML' }
    );

    // delay penting buat bails
    await delay(2000);

    const code = await waClient.requestPairingCode(phoneNumber);

    if (!code) {
      return ctx.reply(
        '<blockquote>❌ Gagal mendapatkan pairing code.</blockquote>',
        { parse_mode: 'HTML' }
      );
    }

    const formatCode = code?.match(/.{1,4}/g)?.join('-') || code;

    await ctx.reply(
      `<blockquote>
📲 <b>PAIRING CODE</b>

<code>${formatCode}</code>

📌 Cara login:
1. Buka WhatsApp
2. Perangkat Tertaut
3. Tautkan dengan nomor telepon
4. Masukkan kode di atas
</blockquote>`,
      {
        parse_mode: 'HTML'
      }
    );

  } catch (err) {
    console.error('PAIRING ERROR:', err);

    await ctx.reply(
      `<blockquote>❌ Error pairing:\n<code>${err.message}</code></blockquote>`,
      {
        parse_mode: 'HTML'
      }
    );
  }
});

bot.command('clearsesi', async (ctx) => {
  const userId = ctx.from.id.toString();
  const OWNER_ID = config.ownerId.toString();
  const sessionDir = path.join(__dirname, 'session');
  
  if (userId !== OWNER_ID) {
    return ctx.reply(`<blockquote>🚫 Hanya owner yang bisa menjalankan perintah ini.</blockquote>`, {
      parse_mode: "HTML"
    });
  }

  try {

    if (!fs.existsSync(sessionDir)) {
      return ctx.reply('⚠️ Folder session tidak ditemukan.');
    }

    fs.rmSync(sessionDir, { recursive: true, force: true });
    fs.mkdirSync(sessionDir);

    await ctx.reply(
      `<blockquote>🧹 Semua file di folder <code>session</code> sudah dihapus.</blockquote>\n\n` +
      `<blockquote>🔄 Bot akan restart otomatis dalam 3 detik...</blockquote>`,
      { parse_mode: 'HTML' }
    );

    setTimeout(() => {
      console.log('🔁 Restarting bot by owner command...');
      try {
        exec('pm2 restart all || npm restart || node .', (err, stdout, stderr) => {
          if (err) {
            console.error('❌ Gagal restart bot:', err.message);
          } else {
            console.log('✅ Bot berhasil direstart oleh owner.');
          }
        });
      } catch (err) {
        console.error('⚠️ Gagal menjalankan perintah restart:', err.message);
      }
    }, 3000);

  } catch (err) {
    console.error('⚠️ Error saat hapus session:', err);
    ctx.reply('⚠️ Terjadi kesalahan saat menghapus file session.');
  }
});

bot.command('broadcast', async (ctx) => {
  const userId = ctx.from.id.toString();
  const OWNER_ID = config.ownerId.toString();

  if (userId !== OWNER_ID) {
    return ctx.reply(`<blockquote>🚫 Hanya owner yang bisa menjalankan perintah ini.</blockquote>`, {
      parse_mode: "HTML"
    });
  }

  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) {
    return ctx.reply(`<blockquote>⚠️ Gunakan format:\n\n<b>/broadcast</b> pesan yang ingin dikirim</blockquote>`, {
      parse_mode: 'HTML'
    });
  }

  let users = loadUsers();
  if (users.length === 0) {
    return ctx.reply(`<blockquote>📭 Belum ada user private yang tercatat.</blockquote>`, {
      parse_mode: "HTML"
    });
  }

  await ctx.reply(`<blockquote>📢 Mengirim broadcast ke <b>${users.length}</b> user...\nTunggu sebentar ⏳</blockquote>`, {
    parse_mode: 'HTML'
  });

  let success = 0;
  let failed = 0;
  let deleted = 0;

  for (const id of [...users]) {
    try {
      await ctx.telegram.sendMessage(id, text, { parse_mode: 'HTML' });
      success++;
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      failed++;
      const msg = err?.description || err?.message || "";

      if (
        msg.includes("bot was blocked by the user") ||
        msg.includes("Forbidden: bot was blocked by the user") ||
        msg.includes("user is deactivated") ||
        msg.includes("chat not found") ||
        msg.includes("PEER_ID_INVALID") ||
        msg.includes("Forbidden: user not found") ||
        err.response?.error_code === 403 ||
        err.response?.error_code === 400
      ) {

        users = users.filter(u => u !== id);
        deleted++;
        fs.writeFileSync(userDBPath, JSON.stringify(users, null, 2));
        console.log(`🗑️ User ${id} dihapus dari database.`);
      }
    }
  }

  return ctx.reply(
    `<blockquote>✅ Broadcast selesai!\n\n📨 Terkirim: <b>${success}</b>\n❌ Gagal: <b>${failed}</b>\n🗑️ Dihapus: <b>${deleted}</b> user tidak valid</blockquote>`,
    { parse_mode: 'HTML' }
  );
});

bot.command('totaluser', async (ctx) => {
  const userId = ctx.from.id.toString();
  const OWNER_ID = config.ownerId.toString();

  if (userId !== OWNER_ID) {
    return ctx.reply(`<blockquote>🚫 Hanya owner yang bisa menjalankan perintah ini.</blockquote>`, {
      parse_mode: "HTML"
    });
  }

  try {
    const userDBPath = path.join(__dirname, 'database', 'users.json');
    if (!fs.existsSync(userDBPath)) {
      fs.writeFileSync(userDBPath, JSON.stringify([]));
    }

    const users = JSON.parse(fs.readFileSync(userDBPath, 'utf8') || '[]');
    const total = users.length;

    return ctx.reply(
      `<blockquote>📊 <b>Total Pengguna Bot</b>\n\n👤 Jumlah User: <b>${total}</b></blockquote>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Gagal ambil total user:', err);
    return ctx.reply('⚠️ Terjadi kesalahan saat menghitung total user.');
  }
});

bot.command("listid", async (ctx) => {
  const fromId = ctx.from.id.toString();
  if (!isOwner(fromId))
    return ctx.reply("<blockquote>🚫 Hanya owner yang bisa melihat total ID!</blockquote>", { parse_mode: "HTML" });

  const users = loadUsers();

  if (users.length === 0)
    return ctx.reply("<blockquote>📭 <b>Belum ada user terdaftar.</b></blockquote>", { parse_mode: "HTML" });

  const { text, buttons } = generateUserList(users, 1);

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.command("addprem", async (ctx) => {
  const fromId = ctx.from.id.toString();
  if (!isOwner(fromId)) return ctx.reply("<blockquote>🚫 Hanya owner yang bisa menjalankan perintah ini.!</blockquote>", {
    parse_mode: "HTML"
  });

  const args = ctx.message.text.split(" ").slice(1);
  const targetId = args[0];
  const durasi = args[1];

  if (!targetId || !durasi)
    return ctx.reply(
      "<blockquote>⚠️ Gunakan format:\n<code>/addprem user_id durasi</code>\n\n🧩 Contoh:\n<code>/addprem 12345678 7d</code>\n<code>/addprem 12345678 1m</code>\n<code>/addprem 12345678 p</code></blockquote>",
      { parse_mode: "HTML" }
    );

  const expireAt = parseDuration(durasi);
  if (!expireAt) return ctx.reply(`<blockquote>⚠️ Durasi tidak valid! Gunakan d/w/m/p.</blockquote>`, {
    parse_mode: "HTML"
  });

  roleData.premiums = roleData.premiums.filter(p => p.id !== targetId);

  roleData.premiums.push({ id: targetId, expireAt, startAt: Date.now() });
  saveRoles();

  const waktu = formatDuration(expireAt);

  await ctx.reply(`<blockquote>✨ User <code>${targetId}</code> sekarang Premium selama <b>${waktu}</b>!</blockquote>`, { parse_mode: "HTML" });

  try {
    await ctx.telegram.sendMessage(
      targetId,
      `<blockquote>🎉 <b>Selamat!</b>\nAnda telah menjadi <b>Premium User</b>!\n\n🕒 Waktu aktif: <b>${waktu}</b>\n\nSelamat menggunakan layanan bot kami 🚀</blockquote>`,
      { parse_mode: "HTML" }
    );
  } catch {
    ctx.reply("⚠️ Tidak bisa kirim pesan ke user (mungkin belum start bot).");
  }
});

bot.command("delprem", async (ctx) => {
  const fromId = ctx.from.id.toString();
  if (!isOwner(fromId)) return ctx.reply(`<blockquote>🚫 Hanya owner yang bisa menghapus user premium.</blockquote>`, {
    parse_mode: "HTML"
  });

  const args = ctx.message.text.split(" ").slice(1);
  const targetId = args[0];

  if (!targetId)
    return ctx.reply(
      "<blockquote>⚠️ Gunakan format:\n<code>/delprem user_id</code>\n\n🧩 Contoh:\n<code>/delprem 12345678</code></blockquote>",
      { parse_mode: "HTML" }
    );

  const before = roleData.premiums.length;
  roleData.premiums = roleData.premiums.filter(p => p.id !== targetId);
  saveRoles();

  if (roleData.premiums.length === before)
    return ctx.reply(`<blockquote>❌ User <code>${targetId}</code> tidak ditemukan di daftar premium.</blockquote>`, { parse_mode: "HTML" });

  ctx.reply(`<blockquote>✅ User <code>${targetId}</code> telah dihapus dari daftar Premium.</blockquote>`, { parse_mode: "HTML" });
});

bot.command("listprem", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isOwner(userId))
    return ctx.reply("<blockquote>🚫 Hanya owner yang bisa melihat daftar Premium!</blockquote>", { parse_mode: "HTML" });

  const data = roleData.premiums.filter(p => !isExpired(p.expireAt));
  if (data.length === 0)
    return ctx.reply("<blockquote>📭 Belum ada user Premium aktif.</blockquote>", { parse_mode: "HTML" });

  const { text, buttons } = generatePagedList(data, 1, "premium");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.command("addowner", async (ctx) => {
  const fromId = ctx.from.id.toString();
  const OWNER_ID = config.ownerId.toString();

  if (fromId !== OWNER_ID) return ctx.reply("<blockquote>🚫 Hanya owner utama yang bisa menjalankan perintah ini!</blockquote>", {
    parse_mode: "HTML"
  });

  const args = ctx.message.text.split(" ").slice(1);
  const targetId = args[0];
  const durasi = args[1];

  if (!targetId || !durasi)
    return ctx.reply(
      "<blockquote>⚠️ Gunakan format:\n<code>/addowner user_id durasi</code>\n\n🧩 Contoh:\n<code>/addowner 12345678 7d</code>\n<code>/addowner 12345678 1m</code>\n<code>/addowner 12345678 p</code></blockquote>",
      { parse_mode: "HTML" }
    );

  const expireAt = parseDuration(durasi);
  if (!expireAt) return ctx.reply("⚠️ Durasi tidak valid! Gunakan d/w/m/p.");

  roleData.owners = roleData.owners.filter(o => o.id !== targetId);
  roleData.owners.push({ id: targetId, expireAt, startAt: Date.now() });
  saveRoles();

  const waktu = formatDuration(expireAt);

  await ctx.reply(`<blockquote>✅ User <code>${targetId}</code> berhasil jadi *Owner* selama <b>${waktu}</b>!</blockquote>`, { parse_mode: "HTML" });

  try {
    await ctx.telegram.sendMessage(
      targetId,
      `<blockquote>👑 <b>Selamat!</b>\nAnda telah menjadi <b>Owner Bot</b>!\n\n🕒 Waktu aktif: <b>${waktu}</b>\n\nSelamat menikmati fitur eksklusif kami 🙌</blockquote>`,
      { parse_mode: "HTML" }
    );
  } catch {
    ctx.reply("<blockquote>⚠️ Tidak bisa kirim pesan ke user (mungkin belum start bot).</blockquote>", {
      parse_mode: "HTML"
    });
  }
});

bot.command("delowner", async (ctx) => {
  const fromId = ctx.from.id.toString();
  const OWNER_ID = config.ownerId.toString();

  if (fromId !== OWNER_ID)
    return ctx.reply("<blockquote>🚫 Hanya owner utama yang bisa menjalankan perintah ini!</blockquote>", {
    parse_mode: "HTML"
  });

  const args = ctx.message.text.split(" ").slice(1);
  const targetId = args[0];

  if (!targetId)
    return ctx.reply(
      "<blockquote>⚠️ Gunakan format:\n<code>/delowner user_id</code>\n\n🧩 Contoh:\n<code>/delowner 12345678</code></blockquote>",
      { parse_mode: "HTML" }
    );

  const before = roleData.owners.length;
  roleData.owners = roleData.owners.filter(o => o.id !== targetId);
  saveRoles();

  if (roleData.owners.length === before)
    return ctx.reply(`<blockquote>❌ User <code>${targetId}</code> tidak ditemukan di daftar owner.</blockquote>`, { parse_mode: "HTML" });

  ctx.reply(`<blockquote>✅ User <code>${targetId}</code> telah dihapus dari daftar Owner.</blockquote>`, { parse_mode: "HTML" });
});

bot.command("listowner", async (ctx) => {
  const userId = ctx.from.id.toString();
  const OWNER_ID = config.ownerId.toString();

  if (userId !== OWNER_ID)
    return ctx.reply("<blockquote>🚫 Hanya owner utama yang bisa melihat daftar Owner!</blockquote>", { parse_mode: "HTML" });

  const data = roleData.owners.filter(o => !isExpired(o.expireAt));
  if (data.length === 0)
    return ctx.reply("<blockquote>📭 Belum ada owner tambahan aktif.</blockquote>", { parse_mode: "HTML" });

  const { text, buttons } = generatePagedList(data, 1, "owner");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

// ======================= 𝙼𝙴𝙽𝚄 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿 =======================

bot.command('info', async (ctx) => {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const refData = loadRefs();

  if (!refData[userId]) {
    refData[userId] = { invited: [], bonusChecks: 0, totalInvited: 0 };
    saveRefs(refData);
  }

  const ownerData = roleData.owners.find(o => o.id === userId && !isExpired(o.expireAt));
  const premiumData = roleData.premiums.find(p => p.id === userId && !isExpired(p.expireAt));

  const ownerStatus = ownerData ? getDurationText(ownerData.expireAt, ownerData.startAt) : "NON OWNER";
  const premiumStatus = premiumData ? getDurationText(premiumData.expireAt, premiumData.startAt) : "NON PREMIUM";

  const userRef = refData[userId];
  const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;

  const sisaBonus = userRef.bonusChecks;
  const jumlahUndangan = userRef.invited.length;
  const totalKlaim = userRef.totalInvited;

  const caption = `<blockquote>📊 <b>INFORMASI AKUN CEKBIO</b>
────────────────────
👤 <b>Nama:</b> ${userName}
🆔 <b>ID:</b> <code>${userId}</code>
💎 <b>Status Premium:</b> ${premiumStatus}
👑 <b>Status Owner:</b> ${ownerStatus}
────────────────────
🎁 <b>Sisa cek 150 nomor:</b> ${sisaBonus}x
👥 <b>Jumlah referral:</b> ${jumlahUndangan} orang
🏆 <b>Total referral diklaim bonus:</b> ${totalKlaim} orang
────────────────────
🔗 <b>Link Undanganmu:</b>
<a href="${referralLink}">${referralLink}</a>
────────────────────
💡 <i>Undang temanmu! Setiap 5 orang dapat 5x cek 150 nomor.</i>
</blockquote>`;

  try {
    await ctx.replyWithPhoto(
      { source: './database/waysexxy.jpg' },
      {
        caption,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔗 Bagikan Link Referral', switch_inline_query: referralLink },
              { text: '💬 Hubungi Dev', url: 'https://t.me/waysexxy' }
            ]
          ]
        }
      }
    );
  } catch (err) {
    console.error('Error kirim info:', err);
    ctx.reply(
      `<blockquote>⚠️ Terjadi kesalahan saat menampilkan info akunmu.</blockquote>`,
      { parse_mode: 'HTML' }
    );
  }
});

bot.command('cekbio', async (ctx) => {
  const userId = ctx.from.id.toString();
  const refData = loadRefs();

  if (!refData[userId]) {
    refData[userId] = { invited: [], bonusChecks: 0, totalInvited: 0 };
  }

  const isOwn = isOwner(userId);
  const isPrem = isPremium(userId);
  const now = Date.now();
  const cooldownTime = 5 * 60 * 1000;

  try {

    if (!isOwn && !isPrem) {
      if (cooldowns[userId] && now - cooldowns[userId] < cooldownTime) {
        const remaining = cooldownTime - (now - cooldowns[userId]);
        const minutes = Math.ceil(remaining / 60000);
        return ctx.reply(
          `<blockquote>⏳ Tunggu <b>${minutes} menit</b> sebelum pakai /cekbio lagi.</blockquote>`,
          { parse_mode: "HTML" }
        );
      }
    }

    if (!isOwn && !isPrem) {
      const channelMember = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
      const groupMember = await ctx.telegram.getChatMember(GROUP_ID, userId);

      if (['left', 'kicked'].includes(channelMember.status) || ['left', 'kicked'].includes(groupMember.status)) {
        return ctx.reply(
          `<blockquote>🚫 <b>Kamu belum join semua tempat wajib!</b>
📢 Channel: <a href="https://t.me/${CHANNEL_ID.replace('@', '')}">${CHANNEL_ID}</a>
👥 Group: <a href="https://t.me/${GROUP_ID.replace('@', '')}">${GROUP_ID}</a></blockquote>`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📢 Join Channel', url: `https://t.me/${CHANNEL_ID.replace('@', '')}` },
                  { text: '💬 Join Group', url: `https://t.me/${GROUP_ID.replace('@', '')}` }
                ]
              ]
            }
          }
        );
      }
    }

    if (!isOwn && !isPrem) {
      const invitedCount = refData[userId]?.invited?.length || 0;
      const usedBonuses = refData[userId].totalInvited;

      if (invitedCount >= usedBonuses + 5) {
        refData[userId].bonusChecks += 5;
        refData[userId].totalInvited += 5;
        saveRefs(refData);

        await ctx.reply(
          `<blockquote>🎉 <b>Selamat!</b> Kamu telah mengundang ${invitedCount} orang.
🎁 Dapat <b>5x kesempatan cek 150 nomor!</b></blockquote>`,
          { parse_mode: "HTML" }
        );
      }

      if (invitedCount < 5 && refData[userId].bonusChecks <= 0) {
        const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;
        return ctx.reply(
          `<blockquote>🚫 <b>Kamu baru mengundang ${invitedCount} orang.</b>
Untuk memakai fitur ini, undang <b>minimal 5 orang</b> dulu.
🔗 <b>Link Undanganmu:</b> <a href="${referralLink}">${referralLink}</a></blockquote>`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
      }
    }

    const args = ctx.message.text
  .split(' ')
  .slice(1);

let mode = 'normal';

if (
  ['cepat', 'normal', 'lambat']
    .includes(args[0]?.toLowerCase())
) {
  mode = args.shift().toLowerCase();
}

const numbersToCheck =
  args.join(' ')
    .match(/\d+/g) || [];
    const jumlahNomor = numbersToCheck.length;

    if (jumlahNomor === 0) {
      return ctx.reply(`<blockquote>⚠️ Masukkan nomor yang ingin dicek.</blockquote>`, { parse_mode: "HTML" });
    }

    let maxNumbers = 80;
    let pakaiBonus = false;

    if (isOwn || isPrem) {
      maxNumbers = 9999;
    } else if (refData[userId].bonusChecks > 0) {
      maxNumbers = 150;
    }

    if (jumlahNomor > maxNumbers) {
      return ctx.reply(
        `<blockquote>⚠️ Maksimal <b>${maxNumbers}</b> nomor yang bisa dicek.</blockquote>`,
        { parse_mode: "HTML" }
      );
    }

    if (!isOwn && !isPrem) cooldowns[userId] = now;

    const result = await handleBioCheck(
  ctx,
  numbersToCheck,
  mode
);

    if (!isOwn && !isPrem && jumlahNomor > 80 && refData[userId].bonusChecks > 0) {
      refData[userId].bonusChecks -= 1;
      saveRefs(refData);
      pakaiBonus = true;
    }

    const msg = pakaiBonus
      ? `<blockquote>✅ Cek ${jumlahNomor} nomor selesai!\n📊 Sisa bonus cek 150 nomor: <b>${refData[userId].bonusChecks}</b></blockquote>`
      : `<blockquote>✅ Cek ${jumlahNomor} nomor selesai!</blockquote>`;

    await ctx.reply(msg, { parse_mode: "HTML" });

    if (!isOwn && !isPrem) setTimeout(() => delete cooldowns[userId], cooldownTime);

  } catch (err) {
    console.error('Error cekbio:', err);
    return ctx.reply(
      `<blockquote>⚠️ Terjadi kesalahan saat memeriksa nomor.\n🔁 Bonus kamu tidak berkurang.</blockquote>`,
      { parse_mode: "HTML" }
    );
  }
});

bot.command("fixmerah", async (ctx) => {
  const userId = ctx.from.id.toString();
  const userName = "@waysexxy";
  const refData = loadRefs();
  const OWNER_ID = config.ownerId.toString();

  const isOwn = isOwner(userId);
  const isPrem = isPremium(userId);

  try {
    const now = Date.now();
    const cooldownTime = 5 * 60 * 1000;

    if (!isOwn && !isPrem) {
      if (cooldowns[userId] && now - cooldowns[userId] < cooldownTime) {
        const remaining = cooldownTime - (now - cooldowns[userId]);
        const minutes = Math.ceil(remaining / 60000);
        return ctx.reply(
          `<blockquote>⏳ Tunggu <b>${minutes} menit</b> sebelum pakai /fixmerah lagi.</blockquote>`,
          { parse_mode: "HTML" }
        );
      }
    }

    if (!isOwn && !isPrem) {
      const channelMember = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
      const groupMember = await ctx.telegram.getChatMember(GROUP_ID, userId);

      if (["left", "kicked"].includes(channelMember.status) || ["left", "kicked"].includes(groupMember.status)) {
        return ctx.reply(
          `<blockquote>🚫 <b>Kamu belum join semua tempat wajib!</b>
📢 Channel: <a href="https://t.me/${CHANNEL_ID.replace("@", "")}">${CHANNEL_ID}</a>
👥 Group: <a href="https://t.me/${GROUP_ID.replace("@", "")}">${GROUP_ID}</a></blockquote>`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "📢 Join Channel", url: `https://t.me/${CHANNEL_ID.replace("@", "")}` },
                  { text: "💬 Join Group", url: `https://t.me/${GROUP_ID.replace("@", "")}` },
                ],
              ],
            },
          }
        );
      }
    }

    if (!isOwn && !isPrem) {
      const invitedCount = refData[userId]?.invited?.length || 0;

      if (invitedCount < 3) {
        const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${userId}`;
        return ctx.reply(
          `<blockquote>🚫 <b>Kamu baru mengundang ${invitedCount} orang.</b>
Untuk memakai fitur ini, kamu harus mengundang <b>minimal 3 orang</b> dulu.
🔗 <b>Link Undanganmu:</b> <a href="${referralLink}">${referralLink}</a></blockquote>`,
          { parse_mode: "HTML", disable_web_page_preview: true }
        );
      }
    }

    await ctx.reply(`<blockquote>⏳ Sedang membuat pesan Fix Merah...</blockquote>`, {
      parse_mode: "HTML",
    });

    const prompt = `
Generate exactly ONE variation of the following WhatsApp unban message in English.
Make it polite, formal, and clear. Keep structure and meaning the same.

METHOD FIX MERAH BY ${userName}

Hello sir, please help me solve my problem. I can't request a verification code because I get a message saying I need the official WhatsApp app to use this account, even though I am already using the latest official version. I hope my issue can be resolved so I can continue using my number +62xxxxxx.
Thank you very much, Support Team at WhatsApp.

End the message with:
Send this via Gmail to support@support.whatsapp.com
Note: Don't sell this method!
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=AIzaSyCgBitS1kfNscc_5XmQyGAUQLA6pP7pUm8",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );

    const dataAI = await response.json();
    const aiText =
      dataAI.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "⚠️ Tidak ada respons dari AI.";

    const waUrl = `https://wa.me/?text=${encodeURIComponent(aiText)}`;

    await ctx.reply(
      `<blockquote><b>🧩 METHOD FIX MERAH BY ${userName}</b>\n\n${aiText}\n\n📧 <b>Kirim manual ke:</b> support@support.whatsapp.com</blockquote>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "💬 Kirim via WhatsApp", url: waUrl }]],
        },
      }
    );

    if (!isOwn && !isPrem) {
      cooldowns[userId] = now;
      setTimeout(() => delete cooldowns[userId], cooldownTime);
    }

  } catch (err) {
    console.error("🚫 Error:", err);
    ctx.reply(
      `<blockquote>⚠️ <b>Terjadi kesalahan saat membuat pesan Fix Merah.</b>\n<code>${err.message}</code></blockquote>`,
      { parse_mode: "HTML" }
    );
  }
});

// ======================= 𝙼𝙴𝙽𝚄 𝙼𝙾𝚁𝙴 =======================

bot.command('cekid', async (ctx) => {
  try {
    const msg = ctx.message;
    const reply = msg.reply_to_message;
    let targetUser = reply ? reply.from : msg.from;

    const userId = targetUser.id.toString();
    const name = targetUser.first_name || '-';
    const username = targetUser.username ? `@${targetUser.username}` : '-';
    const tanggal = new Date().toISOString().split('T')[0];

    let avatarUrl = 'https://i.ibb.co/9v2YzS0/default-avatar.png';
    try {
      const photos = await ctx.telegram.getUserProfilePhotos(userId, { limit: 1 });
      if (photos.total_count > 0) {
        const file = photos.photos[0][0];
        avatarUrl = (await ctx.telegram.getFileLink(file.file_id)).href;
      }
    } catch {
      console.warn('Gagal ambil foto profil');
    }

    const width = 800, height = 450;
    const canvas = createCanvas(width, height);
    const c = canvas.getContext('2d');

    c.fillStyle = '#0a1a2f';
    c.fillRect(0, 0, width, height);

    c.fillStyle = '#fff';
    c.roundRect(40, 60, width - 80, height - 120, 20);
    c.fill();

    c.fillStyle = '#0a1a2f';
    c.font = 'bold 36px Arial';
    c.textAlign = 'center';
    c.fillText('ID CARD TELEGRAM', width / 2, 120);

    const avatar = await loadImage(avatarUrl);
    c.save();
    c.beginPath();
    c.arc(160, 240, 70, 0, Math.PI * 2);
    c.clip();
    c.drawImage(avatar, 90, 170, 140, 140);
    c.restore();

    c.fillStyle = '#000';
    c.textAlign = 'left';
    c.font = 'bold 26px Arial';
    c.fillText('Informasi Pengguna:', 270, 180);

    c.font = '22px Arial';
    c.fillText(`Nama: ${name}`, 270, 220);
    c.fillText(`User ID: ${userId}`, 270, 255);
    c.fillText(`Username: ${username}`, 270, 290);
    c.fillText(`Tanggal: ${tanggal}`, 270, 325);

    c.textAlign = 'center';
    c.font = 'italic 20px Arial';
    c.fillStyle = '#666';
    c.fillText('ID Card by Dev waysexxy', width / 2, height - 25);

    const outPath = path.join(__dirname, `idcard_${userId}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outPath, buffer);

    await ctx.replyWithPhoto(
      { source: outPath },
      {
        caption: `<blockquote>👤 Informasi Pengguna:
• Nama     : ${name}
• Username : ${username}
• ID       : <code>${userId}</code>
• Bahasa   : id
• User Link: <a href="https://t.me/${username.replace('@', '')}">Klik di sini</a></blockquote>`,
        parse_mode: 'HTML'
      }
    );

    fs.unlinkSync(outPath);
  } catch (err) {
    console.error(err);
    ctx.reply('⚠️ Terjadi kesalahan saat membuat ID Card.');
  }
});

bot.command('tourl', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
    if (['left', 'kicked'].includes(member.status)) {
      return ctx.reply(
        `<blockquote>🚫 Kamu harus join channel official dulu supaya bisa pakai fitur ini.</blockquote>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [{ text: '📢 Channel Official', url: CHANNEL_LINK }]
          ])
        }
      );
    }

    const reply = ctx.message.reply_to_message;
    if (!reply)
      return ctx.reply(`<blockquote>❌ Balas pesan yang berisi file/audio/video dengan perintah /tourl.</blockquote>`, { parse_mode: 'HTML' });

    let fileId, filename;
    if (reply.document) {
      fileId = reply.document.file_id;
      filename = reply.document.file_name;
    } else if (reply.photo) {
      fileId = reply.photo[reply.photo.length - 1].file_id;
      filename = 'photo.jpg';
    } else if (reply.video) {
      fileId = reply.video.file_id;
      filename = reply.video.file_name || 'video.mp4';
    } else if (reply.audio) {
      fileId = reply.audio.file_id;
      filename = reply.audio.file_name || 'audio.mp3';
    } else if (reply.voice) {
      fileId = reply.voice.file_id;
      filename = 'voice.ogg';
    } else {
      return ctx.reply(`<blockquote>❌ Pesan yang kamu balas tidak mengandung file/audio/video yang bisa diupload.</blockquote>`, { parse_mode: 'HTML' });
    }

    const link = await ctx.telegram.getFileLink(fileId);
    const res = await fetch(link.href);
    const fileBuffer = Buffer.from(await res.arrayBuffer());

    const catboxUrl = await uploadToCatbox(fileBuffer, filename);

    await ctx.reply(
      `<blockquote>✅ File berhasil diupload ke Catbox:\n${catboxUrl}</blockquote>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error(err);
    ctx.reply(`<blockquote>❌ Gagal upload file: ${err.message}</blockquote>`, { parse_mode: 'HTML' });
  }
});

// ======================= CALLBACK =======================

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data) return;

  const menuPrefixes = [
    "owner", "whatsapp", "more", "back_to_start"
  ];
  if (menuPrefixes.some(p => data.startsWith(p))) return;

  try {

    if (data.startsWith("users_")) {
      const match = data.match(/users_page_(\d+)/);
      if (!match) return;
      const page = parseInt(match[1]);
      const users = loadUsers();
      const { text, buttons } = generateUserList(users, page);

      return await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons },
      });
    }
 
    if (data.startsWith("premium_")) {
      const match = data.match(/premium_page_(\d+)/);
      if (!match) return;
      const page = parseInt(match[1]);
      const list = roleData.premiums.filter(p => !isExpired(p.expireAt));
      const { text, buttons } = generatePagedList(list, page, "premium");

      return await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons },
      });
    }
 
    if (data.startsWith("owner_")) {
      const match = data.match(/owner_page_(\d+)/);
      if (!match) return;
      const page = parseInt(match[1]);
      const list = roleData.owners.filter(o => !isExpired(o.expireAt));
      const { text, buttons } = generatePagedList(list, page, "owner");

      return await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons },
      });
    }

  } catch (err) {
    console.error("❌ Error callback:", err);
  }

  await ctx.answerCbQuery();
});

setInterval(() => {
  console.log('🕐 Menjalankan auto-backup rutin...');
  autoBackup();
}, 1000 * 60 * 60 * 6);

(async () => {
    showBanner();
    autoBackup();
    await startBot();
    await syncReferralBonuses();
    await startWhatsAppClient();
    console.log('Bot Telegram OTW!');
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));