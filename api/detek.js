const { requestCode } = require('./wa_code.js');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const axios = require('axios');

// ── ANTI-CRASH GLOBAL ──
process.on('unhandledRejection', (reason) => {
    const msg = reason && reason.message ? reason.message : String(reason);
    console.error('[UNHANDLED REJECTION] ' + msg);
});
process.on('uncaughtException', (err) => {
    const msg = err && err.message ? err.message : String(err);
    console.error('[UNCAUGHT EXCEPTION] ' + msg);
});

// ── LOG CHANNEL ──
const LOG_CHANNEL = '-1003924892114';

// ── SESSIONS ──
const sessions = {};

// ── STORE STATUS NOMOR ──
const numberStatus = new Map();
const monitorIntervals = new Map();

// ── BATASAN NOMOR ──
const MAX_USER_NUMBERS = 25;
const MAX_OWNER_NUMBERS = 200;

// ── MAX TELEGRAM MESSAGE ──
const MAX_TEXT_LENGTH = 3900;

// ── FUNGSI BANTUAN ──
function formatCooldown(seconds) {
    if (!seconds || seconds <= 0) return '0 d';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let result = '';
    if (h > 0) result += h + ' j ';
    if (m > 0) result += m + ' m ';
    if (s > 0 || result === '') result += s + ' d';
    return result.trim();
}

function getMethodLabel(method) {
    const map = { 'sms': 'SMS', 'email_otp': 'Email OTP', 'wa_old': 'WA Old' };
    return map[method] || String(method).toUpperCase();
}

function getWIBTime() {
    const now = new Date();
    return now.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).replace(/:/g, '.');
}

function buildProgress(current, total, barLength) {
    if (!barLength) barLength = 10;
    const percent = Math.round((current / total) * 100);
    const filled = Math.round((percent / 100) * barLength);
    const empty = barLength - filled;
    const bar = '▰'.repeat(filled) + '▱'.repeat(empty);
    return bar + ' ' + percent + '%';
}

// ─── TRUNCATE TEXT ───
function truncateText(text) {
    if (!text) return '';
    if (text.length <= MAX_TEXT_LENGTH) return text;
    return text.substring(0, MAX_TEXT_LENGTH - 50) + '\n\n... (dipersingkat)';
}

// ─── BUILD STATUS ──────────────────────────────────────────────
function buildStatusForNumbers(numbers) {
    const timeStr = getWIBTime();

    const readyList = [];
    const cloneList = [];
    const bannedList = [];
    const tempList = [];
    const cooldownList = [];
    const rateLimitList = [];
    const unknownList = [];

    for (const number of numbers) {
        const entry = numberStatus.get(number);
        if (!entry) { unknownList.push({ number: number }); continue; }

        let category = entry.category || 'unknown';
        const nowTime = Date.now();
        const isCooldown = entry.cooldownUntil && entry.cooldownUntil > nowTime;
        const remaining = isCooldown ? Math.floor((entry.cooldownUntil - nowTime) / 1000) : 0;

        // AUTO-CONVERT: Cooldown habis -> Ready
        if (category === 'cooldown' && !isCooldown) {
            category = 'ready';
        }

        if (category === 'clone') {
            cloneList.push({ number: number });
        } else if (category === 'banned') {
            bannedList.push({ number: number });
        } else if (category === 'temporary') {
            tempList.push({ number: number });
        } else if (category === 'rate_limited') {
            rateLimitList.push({ number: number });
        } else if (category === 'cooldown' || isCooldown) {
            cooldownList.push({ number: number, text: formatCooldown(remaining), remaining: remaining });
        } else if (category === 'ready') {
            readyList.push(number);
        } else {
            unknownList.push({ number: number });
        }
    }

    cooldownList.sort(function(a, b) { return a.remaining - b.remaining; });

    // ── Hitung sisa cooldown paling lama ──
    let maxRemaining = 0;
    if (cooldownList.length > 0) {
        maxRemaining = cooldownList[cooldownList.length - 1].remaining;
    }

    let text = '◉ OTP COOLDOWN MONITOR\n';
    text += '<pre>⚠️ Waktu cooldown bisa berubah sewaktu-waktu. Jika ada yang mencoba login ke nomor tersebut, cooldown akan direset ulang oleh WhatsApp.\n';
    text += 'Segera login ke-nomor yang telah melakukan detek.</pre>\n\n';

    // ═══ NOMOR SIAP OTP ═══
    text += '<pre>Nomor siap OTP</pre>\n';
    if (readyList.length === 0) {
        text += '(Tidak ada nomor siap)\n';
    } else {
        readyList.slice(0, 30).forEach(function(n) { text += '<code>+' + n + '</code>  ✓ Siap Menerima OTP\n'; });
        if (readyList.length > 30) text += '... dan ' + (readyList.length - 30) + ' nomor lainnya\n';
    }
    text += '\n';

    // ═══ NOMOR COOLDOWN ═══
    if (cooldownList.length > 0) {
        text += '<pre>Nomor dalam cooldown (sisa waktu)</pre>\n';
        cooldownList.slice(0, 50).forEach(function(item) {
            text += '<code>+' + item.number + '</code>  ' + item.text + '\n';
        });
        if (cooldownList.length > 50) text += '... dan ' + (cooldownList.length - 50) + ' nomor lainnya\n';
        text += '\n';
    }

    // ═══ NOMOR TIDAK DAPAT MENERIMA OTP ═══
    const hasIssues = cloneList.length > 0 || bannedList.length > 0 || tempList.length > 0 || unknownList.length > 0;
    if (hasIssues) {
        text += '<pre>Nomor yang tidak dapat menerima OTP\n';

        if (cloneList.length > 0) {
            text += '❌ Tidak Support Clone (WA Official)\n';
            cloneList.slice(0, 25).forEach(function(item) { text += '<code>+' + item.number + '</code>\n'; });
            if (cloneList.length > 25) text += '... dan ' + (cloneList.length - 25) + ' nomor lainnya\n';
            text += '\n';
        }

        if (bannedList.length > 0) {
            text += '⛔ Terbanned / Blocked\n';
            bannedList.slice(0, 25).forEach(function(item) { text += '<code>+' + item.number + '</code>\n'; });
            if (bannedList.length > 25) text += '... dan ' + (bannedList.length - 25) + ' nomor lainnya\n';
            text += '\n';
        }

        if (tempList.length > 0) {
            text += 'Si Mark ngambek njir\n';
            text += 'Silahkan Cek Ulang\n';
            tempList.slice(0, 25).forEach(function(item) { text += '<code>+' + item.number + '</code>\n'; });
            if (tempList.length > 25) text += '... dan ' + (tempList.length - 25) + ' nomor lainnya\n';
            text += '\n';
        }

        if (unknownList.length > 0) {
            text += 'Nomor tidak diketahui (mungkin WA Official/error)\n';
            unknownList.slice(0, 25).forEach(function(item) {
                text += '<code>+' + item.number + '</code>  ❓ Silahkan Cek Ulang\n';
            });
            if (unknownList.length > 25) text += '... dan ' + (unknownList.length - 25) + ' nomor lainnya\n';
            text += '\n';
        }

        text += '⚠️ Ada nomor yang tidak siap, periksa kembali.\n';
        text += '</pre>\n\n';
    } else if (readyList.length > 0 && cooldownList.length === 0 && rateLimitList.length === 0) {
        text += '✅ Semua nomor siap menerima OTP\n\n';
    }

    // ═══ RATE LIMIT (DIPISAH) ═══
    if (rateLimitList.length > 0) {
        text += '<pre>⛔ Rate Limit (terlalu banyak request)\n';
        rateLimitList.slice(0, 25).forEach(function(item) { text += '<code>+' + item.number + '</code>\n'; });
        if (rateLimitList.length > 25) text += '... dan ' + (rateLimitList.length - 25) + ' nomor lainnya\n';
        text += '⚠️ Tunggu beberapa jam atau ganti metode.\n';
        text += '</pre>\n\n';
    }

    // ═══ FOOTER ═══
    text += '⟳ ' + timeStr + '\n';
    if (maxRemaining > 0) {
        text += '⏱ Monitor aktif: ' + formatCooldown(maxRemaining) + ' lagi\n';
    } else {
        text += '⏱ Monitor aktif\n';
    }
    text += '↻ Diperbarui otomatis';

    return truncateText(text);
}

// ─── LOG KE CHANNEL ──
async function sendLogToChannel(bot, action, userId, username, details, status) {
    if (!LOG_CHANNEL) return;
    if (!status) status = '✅';
    try {
        const now = new Date();
        const waktu = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'numeric', year: 'numeric' }) +
            ' ' + now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });

        let logText = '<pre>𖣂 ' + action + '\n';
        logText += '─────────────────\n';
        logText += '◉ User      : @' + (username || 'Unknown') + ' (ID: ' + userId + ')\n';
        logText += '◉ Waktu     : ' + waktu + ' WIB\n';
        if (details) logText += '⏆ Detail    : ' + details + '\n';
        logText += '─────────────────\n';
        logText += '◉ ' + status + ' Selesai.</pre>';

        const keyboard = {
            inline_keyboard: [[{ text: '⏆ USE THE BOT', url: 'https://t.me/cekwaysbot' }]]
        };

        await bot.sendMessage(LOG_CHANNEL, logText, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch (e) {
        console.error('[LOG] ' + (e.message || e));
    }
}

// ─── UPDATE MONITOR ──
async function updateMonitor(chatId, bot) {
    try {
        const monitor = monitorIntervals.get(chatId);
        if (!monitor) return;

        const messageId = monitor.messageId;
        const numbers = monitor.numbers;

        let text;
        try {
            text = buildStatusForNumbers(numbers);
        } catch (buildErr) {
            console.error('[MONITOR BUILD] ' + (buildErr.message || buildErr));
            return;
        }

        const keyboard = {
            inline_keyboard: [
                [{ text: '⏹ Stop Monitoring', callback_data: 'detek_stop_' + chatId }],
                [{ text: '❓ Pertanyaan', callback_data: 'detek_faq_' + chatId }]
            ]
        };

        try {
            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (editErr) {
            const msg = editErr && editErr.message ? editErr.message : String(editErr);

            if (msg.indexOf('message to edit not found') !== -1 ||
                msg.indexOf('message is not modified') === -1 && msg.indexOf('MESSAGE_ID_INVALID') !== -1) {
                clearInterval(monitor.interval);
                monitorIntervals.delete(chatId);
                return;
            }

            if (msg.indexOf('message is not modified') !== -1) {
                return;
            }

            console.error('[MONITOR EDIT] ' + msg);
        }
    } catch (outerErr) {
        console.error('[MONITOR OUTER] ' + (outerErr.message || outerErr));
    }
}

// ─── START MONITOR ──
function startMonitor(chatId, messageId, numbers, bot) {
    try {
        if (monitorIntervals.has(chatId)) {
            const old = monitorIntervals.get(chatId);
            if (old && old.interval) clearInterval(old.interval);
            monitorIntervals.delete(chatId);
        }
        const interval = setInterval(function() {
            updateMonitor(chatId, bot).catch(function(err) {
                console.error('[MONITOR INTERVAL] ' + (err.message || err));
            });
        }, 10000);
        monitorIntervals.set(chatId, { interval: interval, messageId: messageId, numbers: numbers });
    } catch (e) {
        console.error('[START MONITOR] ' + (e.message || e));
    }
}

// ─── FAQ TEXT ───
const FAQ_TEXT = '<b>❓ PERTANYAAN YANG SERING DITANYAKAN</b>\n\n' +
'<b>1. Status ready tapi masih jam?</b>\n' +
'Kemungkinan besar nomor tersebut ditabrak orang lain — ada pihak lain yang mencoba login ke nomor yang sama di saat bersamaan.\n\n' +
'Ketika ada yang request OTP ke nomor itu, WhatsApp langsung mereset cooldown SMS, sehingga status yang tadinya Ready bisa berubah jadi jam-jaman lagi.\n\n' +
'Solusinya: segera login secepat mungkin setelah status Ready muncul.\n\n' +
'<b>2. Status ready tapi OTP SMS-nya 2-5 menit?</b>\n' +
'Ini wajar dan bukan berarti hasil deteksi salah.\n\n' +
'Begini alurnya: kamu deteksi → status Ready → kamu coba login → WhatsApp mendeteksi kamu request OTP perangkat → WA langsung memberikan cooldown SMS baru (biasanya 2–5 menit).\n\n' +
'Cooldown itu muncul karena kamu sendiri yang baru request OTP, bukan karena deteksinya meleset.\n\n' +
'<b>3. Seberapa akurat deteksi ini?</b>\n' +
'Sangat akurat, selama tidak ada yang menabrak nomor tersebut.\n\n' +
'Cara membuktikannya: coba deteksi nomor yang sedang cooldown panjang (misal 5 jam atau lebih) — waktu yang ditampilkan pasti sesuai dengan sisa cooldown aslinya.\n\n' +
'Jika hasilnya meleset, hampir pasti ada orang lain yang request OTP ke nomor itu tepat di saat deteksi berjalan.';

// ─── DAILY LIMIT UNTUK /limitin ──
const userDailyLimit = new Map();

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function checkAndUpdateDailyLimit(userId, maxLimit) {
    const today = getToday();
    if (maxLimit === Infinity) return { allowed: true, remaining: Infinity };
    if (!userDailyLimit.has(userId)) {
        userDailyLimit.set(userId, { date: today, count: 0 });
    }
    const record = userDailyLimit.get(userId);
    if (record.date !== today) {
        record.date = today;
        record.count = 0;
    }
    if (record.count >= maxLimit) {
        return { allowed: false, remaining: 0 };
    }
    record.count += 1;
    return { allowed: true, remaining: maxLimit - record.count };
}

module.exports = function setupDetek(bot, createBox, escapeHtml, adminId, langgananModule) {
    // ── HANDLER /detek ──
    bot.onText(/\/detek\s+([\s\S]+)/, async function(msg, match) {
        try {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const username = msg.from.username || msg.from.first_name || 'User';
            const rawInput = match[1].trim();
            if (!rawInput) {
                await bot.sendMessage(chatId, '❌ Masukkan nomor yang ingin didetek.');
                return;
            }

            const allDigits = rawInput.match(/\d+/g);
            if (!allDigits) {
                await bot.sendMessage(chatId, '❌ Tidak ada angka ditemukan.');
                return;
            }
            const candidates = allDigits.filter(function(d) { return d.length >= 8; });
            if (candidates.length === 0) {
                await bot.sendMessage(chatId, '❌ Tidak ada nomor valid (minimal 8 digit).');
                return;
            }
            const uniqueNumbers = Array.from(new Set(candidates));

            const isAdmin = (userId === adminId);
            let maxNumbers;

            if (isAdmin) {
                maxNumbers = MAX_OWNER_NUMBERS;
            } else if (langgananModule && typeof langgananModule.getLimits === 'function') {
                const limits = langgananModule.getLimits(userId);
                maxNumbers = limits.detek || 0;
                if (maxNumbers === 0) {
                    await bot.sendMessage(chatId, '❌ Kamu belum punya akses untuk fitur ini. Silakan subscribe dulu.');
                    if (typeof langgananModule.showLanggananMenu === 'function') {
                        await langgananModule.showLanggananMenu(chatId, userId);
                    }
                    return;
                }
            } else {
                maxNumbers = MAX_USER_NUMBERS;
            }

            let processedNumbers = uniqueNumbers;
            let skippedNumbers = [];
            if (uniqueNumbers.length > maxNumbers) {
                processedNumbers = uniqueNumbers.slice(0, maxNumbers);
                skippedNumbers = uniqueNumbers.slice(maxNumbers);
                const level = (langgananModule && typeof langgananModule.getLevel === 'function')
                    ? langgananModule.getLevel(userId)
                    : (isAdmin ? 'Owner' : 'Regular');
                const warningBox = createBox([
                    '◈ Batas Terlampaui',
                    '│ Level kamu : ' + level,
                    '│ Kamu input : ' + uniqueNumbers.length + ' nomor',
                    '└ Diproses   : ' + processedNumbers.length + ' nomor pertama'
                ]);
                await bot.sendMessage(chatId, '<pre>' + escapeHtml(warningBox) + '</pre>', { parse_mode: 'HTML' });
            }

            const total = processedNumbers.length;
            const statusMsg = await bot.sendMessage(chatId, '◉ Memproses ' + total + ' nomor...\n' + buildProgress(0, total));

            let successCount = 0;
            let cooldownCount = 0;
            let errorCount = 0;
            let cloneCount = 0;
            let tempCount = 0;
            let bannedCount = 0;
            let rateLimitCount = 0;
            const delayMs = 300;

            let progressStep = Math.max(5, Math.floor(total / 5));
            if (progressStep < 1) progressStep = 1;

            for (let i = 0; i < processedNumbers.length; i++) {
                const number = processedNumbers[i];
                try {
                    const result = await requestCode(number, 'sms');
                    const category = result.category || 'unknown';
                    const wait = result.wait || 0;
                    const now = Date.now();
                    let cooldownUntil = null;
                    let specialStatus = null;

                    if (category === 'clone') {
                        specialStatus = 'clone';
                        cloneCount++;
                    } else if (category === 'banned') {
                        specialStatus = 'banned';
                        bannedCount++;
                    } else if (category === 'temporary') {
                        specialStatus = 'temporary';
                        tempCount++;
                    } else if (category === 'rate_limited') {
                        cooldownUntil = now + (wait * 1000 || 300000);
                        rateLimitCount++;
                    } else if (category === 'cooldown') {
                        cooldownUntil = now + (wait * 1000);
                        cooldownCount++;
                    } else if (category === 'ready') {
                        cooldownUntil = 0;
                        successCount++;
                    } else {
                        errorCount++;
                    }

                    numberStatus.set(number, {
                        cooldownUntil: cooldownUntil,
                        lastChecked: now,
                        method: 'sms',
                        specialStatus: specialStatus,
                        category: category,
                        status: result.status,
                        reason: result.reason,
                        wait: wait
                    });
                } catch (error) {
                    errorCount++;
                    numberStatus.set(number, {
                        cooldownUntil: null,
                        lastChecked: Date.now(),
                        method: 'sms',
                        specialStatus: null,
                        category: 'error',
                        status: 'error',
                        reason: error.message,
                        wait: 0
                    });
                }

                const current = i + 1;
                if (current % progressStep === 0 || current === total) {
                    try {
                        await bot.editMessageText(
                            '◉ Memproses ' + total + ' nomor...\n' + buildProgress(current, total),
                            { chat_id: chatId, message_id: statusMsg.message_id }
                        );
                    } catch (e) { /* silent */ }
                }
                await new Promise(function(resolve) { setTimeout(resolve, delayMs); });
            }

            const logDetails = 'Nomor: ' + processedNumbers.length + ' (✅ ' + successCount + ' ready, ⏳ ' + cooldownCount + ' cooldown, ⛔ ' + rateLimitCount + ' rate limit, ❌ ' + cloneCount + ' clone, ⛔ ' + bannedCount + ' banned, ⏳ ' + tempCount + ' temp, ❌ ' + errorCount + ' error)' + (skippedNumbers.length > 0 ? ' (ada ' + skippedNumbers.length + ' nomor dilewati)' : '');
            await sendLogToChannel(bot, 'DETEK', userId, username, logDetails, '✅');

            let finalText = buildStatusForNumbers(processedNumbers);
            if (skippedNumbers.length > 0) {
                finalText += '\n\n⛔ ' + skippedNumbers.length + ' NOMOR TIDAK DICEK\n';
                finalText += 'Nomor berikut dilewati karena melebihi batas ' + maxNumbers + ':\n';
                skippedNumbers.forEach(function(n) { finalText += '<code>+' + n + '</code>\n'; });
            }

            finalText = truncateText(finalText);

            const monitorKeyboard = {
                inline_keyboard: [
                    [{ text: '⏹ Stop Monitoring', callback_data: 'detek_stop_' + chatId }],
                    [{ text: '❓ Pertanyaan', callback_data: 'detek_faq_' + chatId }]
                ]
            };

            try {
                await bot.editMessageText(finalText, {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'HTML',
                    reply_markup: monitorKeyboard
                });
            } catch (editErr) {
                console.error('[DETEK FINAL] ' + (editErr.message || editErr));
            }

            startMonitor(chatId, statusMsg.message_id, processedNumbers, bot);
        } catch (err) {
            console.error('[DETEK HANDLER] ' + (err.message || err));
        }
    });

    // ═══════════════════════════════════════════════════════════
//         HELPER: DETEKSI TIPE FILE (Support Semua)
// ═══════════════════════════════════════════════════════════
function isExcelFile(ext) {
    return ['xlsx', 'xls', 'ods'].includes(ext);
}
function isTextFile(ext) {
    // Semua ekstensi yang mungkin berisi teks
    const textExts = [
        'txt', 'csv', 'json', 'log', 'dat', 'text',
        'tsv', 'md', 'xml', 'yaml', 'yml', 'conf', 'config',
        'ini', 'sql', 'html', 'htm', 'js', 'php'
    ];
    return textExts.includes(ext);
}

// ═══════════════════════════════════════════════════════════
//         HELPER: PARSE FILE → LIST NOMOR
// ═══════════════════════════════════════════════════════════
async function parseNumbersFromFile(buffer, ext) {
    const numbers = [];

    try {
        // ═══ EXCEL FILES (.xlsx, .xls, .ods) ═══
        if (isExcelFile(ext)) {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                for (const row of json) {
                    if (!row || row.length === 0) continue;
                    for (const cell of row) {
                        if (cell === null || cell === undefined || cell === '') continue;
                        const str = String(cell).trim();
                        const matches = str.match(/\d+/g);
                        if (matches) {
                            for (const match of matches) {
                                const num = match.replace(/\D/g, '');
                                if (num.length >= 8 && num.length <= 15) numbers.push(num);
                            }
                        }
                    }
                }
            }
            return numbers;
        }

        // ═══ TEXT-BASED FILES (.txt, .csv, .json, dll) ═══
        let content = '';
        
        // Coba UTF-8 dulu
        try {
            content = buffer.toString('utf8');
        } catch (e) {
            // Kalau gagal, coba latin1
            content = buffer.toString('latin1');
        }

        // Kalau hasilnya banyak karakter null → ini binary, coba latin1
        const nullCount = (content.match(/\x00/g) || []).length;
        if (nullCount > content.length * 0.1) {
            content = buffer.toString('latin1');
        }

        // ── Extract semua angka 8-15 digit ──
        const matches = content.match(/\d{8,15}/g) || [];
        for (const m of matches) {
            numbers.push(m);
        }

        // ── Kalau tidak ada match, coba split per baris & ambil semua digit ──
        if (numbers.length === 0) {
            const lines = content.split(/[\r\n]+/);
            for (const line of lines) {
                const digits = line.match(/\d+/g);
                if (digits) {
                    for (const d of digits) {
                        if (d.length >= 8 && d.length <= 15) numbers.push(d);
                    }
                }
            }
        }

        return numbers;

    } catch (e) {
        console.error('[DETEKFILE] Parse error:', e.message);
        return numbers;
    }
}

// ═══════════════════════════════════════════════════════════
//         HANDLER: /detekfile (Wajib Reply File)
// ═══════════════════════════════════════════════════════════
bot.onText(/^\/detekfile$/, async function(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name || 'User';

    // ── Cek wajib reply file ──
    if (!msg.reply_to_message || !msg.reply_to_message.document) {
        const box = createBox([
            '❌ CARA PAKAI /detekfile',
            '',
            '1. Kirim file ke chat ini',
            '2. Reply file tersebut',
            '3. Ketik /detekfile',
            '',
            'Format file yang didukung:',
            '  .txt  .csv  .xlsx  .xls',
            '  .json .log  .tsv   .dat',
            '  .xml  .yaml .md    dan lainnya',
            '',
            'Isi file harus berisi nomor HP:',
            '  6281234567890',
            '  6281234567891',
            '  6289876543210',
            '  ...'
        ]);
        return bot.sendMessage(chatId, '<pre>' + escapeHtml(box) + '</pre>', { parse_mode: 'HTML' });
    }

    const doc = msg.reply_to_message.document;
    const fileName = doc.file_name || 'file';
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const fileSize = doc.file_size || 0;

    // Batas ukuran file (20 MB)
    if (fileSize > 20 * 1024 * 1024) {
        const box = createBox([
            '❌ FILE TERLALU BESAR',
            '',
            'Maksimal: 20 MB',
            'File kamu: ' + (fileSize / 1024 / 1024).toFixed(2) + ' MB'
        ]);
        return bot.sendMessage(chatId, '<pre>' + escapeHtml(box) + '</pre>', { parse_mode: 'HTML' });
    }

    // ── Cek level ──
    const isAdmin = (userId === adminId);
    let maxNumbers;
    if (isAdmin) {
        maxNumbers = MAX_OWNER_NUMBERS;
    } else if (langgananModule && typeof langgananModule.getLimits === 'function') {
        const limits = langgananModule.getLimits(userId);
        maxNumbers = limits.detek || 0;
        if (maxNumbers === 0) {
            await bot.sendMessage(chatId, '❌ Kamu belum punya akses untuk fitur ini. Silakan subscribe dulu.');
            if (typeof langgananModule.showLanggananMenu === 'function') await langgananModule.showLanggananMenu(chatId, userId);
            return;
        }
    } else {
        maxNumbers = MAX_USER_NUMBERS;
    }

    const loadingMsg = await bot.sendMessage(chatId, '📁 Membaca file ' + fileName + '...');

    try {
        // ── Download file dari Telegram ──
        const fileLink = await bot.getFileLink(doc.file_id);
        const response = await axios.get(fileLink, { 
            responseType: 'arraybuffer', 
            timeout: 60000,
            maxContentLength: 20 * 1024 * 1024
        });
        const buffer = Buffer.from(response.data);

        // ── Parse nomor dari file ──
        const rawNumbers = await parseNumbersFromFile(buffer, ext);
        
        // ── Bersihkan & dedupe ──
        const cleaned = rawNumbers
            .map(n => String(n).replace(/\D/g, ''))
            .filter(n => n.length >= 8 && n.length <= 15);
        const uniqueNumbers = [...new Set(cleaned)];

        if (uniqueNumbers.length === 0) {
            await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
            const box = createBox([
                '❌ TIDAK ADA NOMOR VALID',
                '',
                'File      : ' + fileName,
                'Tipe file : .' + ext,
                '',
                'Pastikan file berisi nomor HP',
                'dengan panjang 8-15 digit.',
                '',
                'Contoh isi file:',
                '6281234567890',
                '6281234567891'
            ]);
            return bot.sendMessage(chatId, '<pre>' + escapeHtml(box) + '</pre>', { parse_mode: 'HTML' });
        }

        // ── Batas jumlah ──
        let processedNumbers = uniqueNumbers;
        let skippedNumbers = [];
        if (uniqueNumbers.length > maxNumbers) {
            processedNumbers = uniqueNumbers.slice(0, maxNumbers);
            skippedNumbers = uniqueNumbers.slice(maxNumbers);
            const level = (langgananModule && typeof langgananModule.getLevel === 'function')
                ? langgananModule.getLevel(userId)
                : (isAdmin ? 'Owner' : 'Regular');
            const warningBox = createBox([
                '◈ Batas Terlampaui',
                '│ File       : ' + fileName,
                '│ Level kamu : ' + level,
                '│ Total file : ' + uniqueNumbers.length + ' nomor',
                '└ Diproses   : ' + processedNumbers.length + ' nomor pertama'
            ]);
            await bot.sendMessage(chatId, '<pre>' + escapeHtml(warningBox) + '</pre>', { parse_mode: 'HTML' });
        }

        // ── Hapus pesan loading ──
        await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

        // ── Info file ──
        const fileInfoBox = createBox([
            '📁 FILE DITERIMA',
            '────────────────────',
            'Nama  : ' + fileName,
            'Tipe  : .' + ext,
            'Total : ' + uniqueNumbers.length + ' nomor unik',
            'Proses: ' + processedNumbers.length + ' nomor'
        ]);
        await bot.sendMessage(chatId, '<pre>' + escapeHtml(fileInfoBox) + '</pre>', { parse_mode: 'HTML' });

        // ── Progress ──
        const total = processedNumbers.length;
        const statusMsg = await bot.sendMessage(chatId, '◉ Memproses ' + total + ' nomor dari file...\n' + buildProgress(0, total));

        let successCount = 0, cooldownCount = 0, errorCount = 0, cloneCount = 0, tempCount = 0, bannedCount = 0, rateLimitCount = 0;
        const delayMs = 300;
        let progressStep = Math.max(5, Math.floor(total / 5));
        if (progressStep < 1) progressStep = 1;

        for (let i = 0; i < processedNumbers.length; i++) {
            const number = processedNumbers[i];
            try {
                const result = await requestCode(number, 'sms');
                const category = result.category || 'unknown';
                const wait = result.wait || 0;
                const now = Date.now();
                let cooldownUntil = null;
                let specialStatus = null;

                if (category === 'clone') { specialStatus = 'clone'; cloneCount++; }
                else if (category === 'banned') { specialStatus = 'banned'; bannedCount++; }
                else if (category === 'temporary') { specialStatus = 'temporary'; tempCount++; }
                else if (category === 'rate_limited') { cooldownUntil = now + (wait * 1000 || 300000); rateLimitCount++; }
                else if (category === 'cooldown') { cooldownUntil = now + (wait * 1000); cooldownCount++; }
                else if (category === 'ready') { cooldownUntil = 0; successCount++; }
                else { errorCount++; }

                numberStatus.set(number, {
                    cooldownUntil: cooldownUntil,
                    lastChecked: now,
                    method: 'sms',
                    specialStatus: specialStatus,
                    category: category,
                    status: result.status,
                    reason: result.reason,
                    wait: wait
                });
            } catch (error) {
                errorCount++;
                numberStatus.set(number, {
                    cooldownUntil: null,
                    lastChecked: Date.now(),
                    method: 'sms',
                    specialStatus: null,
                    category: 'error',
                    status: 'error',
                    reason: error.message,
                    wait: 0
                });
            }

            const current = i + 1;
            if (current % progressStep === 0 || current === total) {
                try {
                    await bot.editMessageText(
                        '◉ Memproses ' + total + ' nomor dari file...\n' + buildProgress(current, total),
                        { chat_id: chatId, message_id: statusMsg.message_id }
                    );
                } catch (e) {}
            }
            await new Promise(function(resolve) { setTimeout(resolve, delayMs); });
        }

        // ── Log ke channel ──
        const logDetails = 'FILE: ' + fileName + ' | Nomor: ' + processedNumbers.length + ' (✅ ' + successCount + ' ready, ⏳ ' + cooldownCount + ' cooldown, ⛔ ' + rateLimitCount + ' rate limit, ❌ ' + cloneCount + ' clone, ⛔ ' + bannedCount + ' banned, ⏳ ' + tempCount + ' temp, ❌ ' + errorCount + ' error)' + (skippedNumbers.length > 0 ? ' (ada ' + skippedNumbers.length + ' nomor dilewati)' : '');
        await sendLogToChannel(bot, 'DETEK FILE', userId, username, logDetails, '✅');

        // ── Tampilkan hasil ──
        let finalText = buildStatusForNumbers(processedNumbers);
        if (skippedNumbers.length > 0) {
            finalText += '\n\n⛔ ' + skippedNumbers.length + ' NOMOR TIDAK DICEK\n';
            finalText += 'Nomor berikut dilewati karena melebihi batas ' + maxNumbers + ':\n';
            skippedNumbers.forEach(function(n) { finalText += '<code>+' + n + '</code>\n'; });
        }
        finalText = truncateText(finalText);

        const monitorKeyboard = {
            inline_keyboard: [
                [{ text: '⏹ Stop Monitoring', callback_data: 'detek_stop_' + chatId }],
                [{ text: '❓ Pertanyaan', callback_data: 'detek_faq_' + chatId }]
            ]
        };

        try {
            await bot.editMessageText(finalText, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'HTML',
                reply_markup: monitorKeyboard
            });
        } catch (editErr) {
            console.error('[DETEKFILE FINAL] ' + (editErr.message || editErr));
        }

        // Mulai monitor
        startMonitor(chatId, statusMsg.message_id, processedNumbers, bot);

    } catch (error) {
        console.error('[DETEKFILE] Error:', error.message);
        await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
        const box = createBox([
            '❌ Terjadi kesalahan',
            '',
            'File : ' + fileName,
            'Error: ' + error.message
        ]);
        await bot.sendMessage(chatId, '<pre>' + escapeHtml(box) + '</pre>', { parse_mode: 'HTML' });
    }
});

// ── /detekfile tanpa reply → tampil cara pakai ──
bot.onText(/^\/detekfile$/, async function(msg) {
    if (msg.reply_to_message && msg.reply_to_message.document) return; // sudah di-handle
    const chatId = msg.chat.id;
    const box = createBox([
        '📁 CARA PAKAI /detekfile',
        '',
        '1. Kirim file ke chat ini',
        '2. Reply file tersebut',
        '3. Ketik /detekfile',
        '',
        'Format file yang didukung:',
        '  .txt  .csv  .xlsx  .xls',
        '  .json .log  .tsv   .dat',
        '  .xml  .yaml .md    .html',
        '  dan semua file teks lainnya',
        '',
        'Isi file berisi nomor HP.',
        'Maksimal: 20 MB'
    ]);
    await bot.sendMessage(chatId, '<pre>' + escapeHtml(box) + '</pre>', { parse_mode: 'HTML' });
});
    
    bot.onText(/\/detek$/, async function(msg) {
        try {
            await bot.sendMessage(msg.chat.id, 'Gunakan: /detek 62812xxxxxxx (bisa lebih dari 1, pisahkan spasi/enter)');
        } catch (e) { /* silent */ }
    });

    // ── HANDLER /limitin ──
    bot.onText(/\/limitin\s+(.+)/, async function(msg, match) {
        try {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const number = match[1].trim();

            const isAdmin = (userId === adminId);
            let maxLimitin;

            if (isAdmin) {
                maxLimitin = Infinity;
            } else if (langgananModule && typeof langgananModule.getLimits === 'function') {
                const limits = langgananModule.getLimits(userId);
                maxLimitin = limits.limitin || 0;
                if (maxLimitin === 0) {
                    await bot.sendMessage(chatId, '❌ Kamu belum punya akses untuk fitur ini. Silakan subscribe dulu.');
                    if (typeof langgananModule.showLanggananMenu === 'function') {
                        await langgananModule.showLanggananMenu(chatId, userId);
                    }
                    return;
                }
            } else {
                maxLimitin = 1;
            }

            const daily = checkAndUpdateDailyLimit(userId, maxLimitin);
            if (!daily.allowed) {
                await bot.sendMessage(chatId, '❌ Kamu sudah mencapai batas ' + maxLimitin + '× /limitin hari ini. Coba lagi besok.');
                return;
            }

            sessions[userId] = {
                number: number,
                running: false,
                msgId: null,
                chatId: chatId,
                method: null,
                stopRequested: false,
                attemptCount: 0
            };
            const sent = await bot.sendMessage(chatId, 'Pilih metode limitin:');
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: 'SMS', callback_data: 'limitin_method_sms_' + userId },
                        { text: 'Email', callback_data: 'limitin_method_email_otp_' + userId },
                        { text: 'WA Old', callback_data: 'limitin_method_wa_old_' + userId }
                    ],
                    [{ text: 'Batal', callback_data: 'limitin_cancel_' + userId }]
                ]
            };

            await bot.editMessageText('Pilih metode limitin:', {
                chat_id: chatId,
                message_id: sent.message_id,
                reply_markup: keyboard,
                parse_mode: 'HTML'
            });
            sessions[userId].msgId = sent.message_id;
            sessions[userId].chatId = chatId;
        } catch (err) {
            console.error('[LIMITIN HANDLER] ' + (err.message || err));
        }
    });

    bot.onText(/\/limitin$/, async function(msg) {
        try {
            await bot.sendMessage(msg.chat.id, 'Gunakan: /limitin 62812xxxxxxx');
        } catch (e) { /* silent */ }
    });

    async function updateMessage(chatId, msgId, newText, newKeyboard) {
        try {
            await bot.editMessageText(newText, {
                chat_id: chatId,
                message_id: msgId,
                reply_markup: newKeyboard,
                parse_mode: 'HTML'
            });
        } catch (e) { /* silent */ }
    }

    async function doLimitinLoop(userId, bot) {
        try {
            const session = sessions[userId];
            if (!session || !session.running || session.stopRequested) return;
            const number = session.number;
            const chatId = session.chatId;
            const msgId = session.msgId;
            const method = session.method;

            const result = await requestCode(number, method);
            const category = result.category || 'unknown';
            const wait = result.wait || 0;

            session.attemptCount += 1;

            let cooldownText = '0 d';
            let isSuccess = false;
            let isBlocked = false;
            let isRateLimit = false;
            let isBanned = false;
            let isClone = false;
            let isTemporary = false;

            if (category === 'banned') {
                isBanned = true;
                cooldownText = '⛔ Terbanned / Blocked';
            } else if (category === 'clone') {
                isClone = true;
                cooldownText = '❌ Tidak Support Clone (WA Official)';
            } else if (category === 'temporary') {
                isTemporary = true;
                cooldownText = '⚠️ Temporary — Butuh verifikasi ulang';
            } else if (category === 'rate_limited') {
                isRateLimit = true;
                cooldownText = '⛔ Rate limit (' + formatCooldown(wait || 300) + ')';
            } else if (category === 'cooldown') {
                isBlocked = true;
                cooldownText = formatCooldown(wait);
            } else if (category === 'ready') {
                isSuccess = true;
                cooldownText = wait > 0 ? formatCooldown(wait) + ' (cooldown)' : '0 d (OTP terkirim)';
            } else {
                cooldownText = wait > 0 ? formatCooldown(wait) + ' (cooldown)' : '❓ Tidak diketahui';
            }

            let text = '<pre>[' + getMethodLabel(method) + '] [' + number + '] Limitin Percobaan ke-' + session.attemptCount + '\n◉ Cooldown: ' + cooldownText + '</pre>';

            let keyboard = null;
            let delay = 0;

            if (isBanned) {
                text += '\n\n⛔ Nomor ini telah <b>terbanned / blocked</b> oleh WhatsApp. Tidak bisa dilanjutkan.';
                keyboard = { inline_keyboard: [[{ text: 'Stop', callback_data: 'limitin_stop_' + userId }]] };
                session.running = false;
                await updateMessage(chatId, msgId, text, keyboard);
                delete sessions[userId];
                return;
            }

            if (isClone) {
                text += '\n\n❌ Nomor ini tidak support clone (WA Official). Tidak bisa dilanjutkan.';
                keyboard = { inline_keyboard: [[{ text: 'Stop', callback_data: 'limitin_stop_' + userId }]] };
                session.running = false;
                await updateMessage(chatId, msgId, text, keyboard);
                delete sessions[userId];
                return;
            }

            if (isTemporary) {
                text += '\n\n⚠️ Nomor ini butuh verifikasi ulang. Coba login manual dulu.';
                keyboard = { inline_keyboard: [[{ text: 'Stop', callback_data: 'limitin_stop_' + userId }]] };
                session.running = false;
                await updateMessage(chatId, msgId, text, keyboard);
                delete sessions[userId];
                return;
            }

            if (isRateLimit) {
                text += '\n\n⛔ Rate limit terdeteksi. Coba lagi nanti atau ganti metode.';
                keyboard = { inline_keyboard: [[{ text: 'Stop', callback_data: 'limitin_stop_' + userId }]] };
                session.running = false;
                await updateMessage(chatId, msgId, text, keyboard);
                delete sessions[userId];
                return;
            }

            if ((isBlocked || isSuccess) && wait > 3600) {
                text += '\n\n⛔ Cooldown terlalu lama (' + formatCooldown(wait) + '). Proses limitin dihentikan otomatis.';
                keyboard = { inline_keyboard: [[{ text: 'Stop', callback_data: 'limitin_stop_' + userId }]] };
                session.running = false;
                await updateMessage(chatId, msgId, text, keyboard);
                delete sessions[userId];
                return;
            }

            if ((isBlocked || isSuccess) && wait > 0) {
                text += '\n\nMengulang otomatis dalam ' + formatCooldown(wait + 2) + '...';
                keyboard = { inline_keyboard: [[{ text: 'Stop', callback_data: 'limitin_stop_' + userId }]] };
                delay = (wait + 2) * 1000;
            } else {
                if (isSuccess) text += '\n\n✓ OTP sukses terkirim!';
                text += '\n\nMengulang otomatis beberapa menit...';
                keyboard = { inline_keyboard: [[{ text: '[ X ]Stop', callback_data: 'limitin_stop_' + userId }]] };
                delay = 300000;
            }
            await updateMessage(chatId, msgId, text, keyboard);

            if (!session.stopRequested && session.running && delay > 0) {
                setTimeout(function() { doLimitinLoop(userId, bot); }, delay);
            }
        } catch (error) {
            console.error('[LIMITIN LOOP] ' + (error.message || error));
            try {
                const session = sessions[userId];
                if (session) {
                    await updateMessage(session.chatId, session.msgId, 'Error: ' + error.message, null);
                    session.running = false;
                    delete sessions[userId];
                }
            } catch (e) { /* silent */ }
        }
    }

    // ── CALLBACK ──
    bot.on('callback_query', async function(query) {
        try {
            const data = query.data;
            const userId = query.from.id;
            const chatId = query.message.chat.id;
            const messageId = query.message.message_id;

            if (data.indexOf('detek_stop_') === 0) {
                await bot.answerCallbackQuery(query.id);
                const targetChatId = parseInt(data.replace('detek_stop_', ''));
                if (targetChatId !== chatId) return;

                if (monitorIntervals.has(chatId)) {
                    clearInterval(monitorIntervals.get(chatId).interval);
                    monitorIntervals.delete(chatId);
                }

                try {
                    await bot.editMessageReplyMarkup(
                        { inline_keyboard: [[{ text: '❓ Pertanyaan', callback_data: 'detek_faq_' + chatId }]] },
                        { chat_id: chatId, message_id: messageId }
                    );
                } catch (e) { /* silent */ }

                await bot.sendMessage(chatId, '⏹ Monitoring dihentikan.');
                return;
            }

            if (data.indexOf('detek_faq_') === 0) {
                await bot.answerCallbackQuery(query.id);
                const targetChatId = parseInt(data.replace('detek_faq_', ''));
                if (targetChatId !== chatId) return;

                const keyboard = {
                    inline_keyboard: [[{ text: '↩ Kembali ke Monitor', callback_data: 'detek_back_' + chatId }]]
                };
                try {
                    await bot.editMessageText(FAQ_TEXT, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                } catch (e) {
                    try {
                        await bot.sendMessage(chatId, FAQ_TEXT, { parse_mode: 'HTML', reply_markup: keyboard });
                    } catch (e2) { /* silent */ }
                }
                return;
            }

            if (data.indexOf('detek_back_') === 0) {
                await bot.answerCallbackQuery(query.id);
                const targetChatId = parseInt(data.replace('detek_back_', ''));
                if (targetChatId !== chatId) return;

                const monitor = monitorIntervals.get(chatId);
                if (!monitor) {
                    await bot.sendMessage(chatId, 'Monitor sudah tidak aktif. Jalankan /detek lagi.');
                    return;
                }

                const text = buildStatusForNumbers(monitor.numbers);
                const keyboard = {
                    inline_keyboard: [
                        [{ text: '⏹ Stop Monitoring', callback_data: 'detek_stop_' + chatId }],
                        [{ text: '❓ Pertanyaan', callback_data: 'detek_faq_' + chatId }]
                    ]
                };
                try {
                    await bot.editMessageText(text, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                } catch (e) { /* silent */ }
                return;
            }

            if (data.indexOf('limitin_') !== 0) {
                await bot.answerCallbackQuery(query.id);
                return;
            }
            await bot.answerCallbackQuery(query.id);
            const parts = data.split('_');
            const action = parts[1];
            const targetUserId = parseInt(parts[parts.length - 1]);

            if (targetUserId !== userId) {
                await bot.answerCallbackQuery(query.id, { text: 'Bukan sesi Anda.', show_alert: true });
                return;
            }

            const session = sessions[userId];
            if (!session) {
                await bot.editMessageText('Sesi tidak ditemukan. Silakan ketik /limitin lagi.', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }
            session.msgId = messageId;
            session.chatId = chatId;

            if (action === 'cancel') {
                session.running = false;
                session.stopRequested = true;
                await bot.editMessageText('Limitin dibatalkan.', { chat_id: chatId, message_id: messageId });
                delete sessions[userId];
                return;
            }

            if (action === 'stop') {
                session.running = false;
                session.stopRequested = true;
                await bot.editMessageText('Proses limitin dihentikan.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: null,
                    parse_mode: 'HTML'
                });
                delete sessions[userId];
                return;
            }

            if (action === 'method') {
                const method = parts[2];
                session.method = method;
                session.running = true;
                session.stopRequested = false;
                session.attemptCount = 0;
                const label = getMethodLabel(method);
                await bot.editMessageText('Memulai limitin dengan metode ' + label + '...', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: null,
                    parse_mode: 'HTML'
                });
                doLimitinLoop(userId, bot);
            }
        } catch (err) {
            console.error('[CALLBACK] ' + (err.message || err));
        }
    });

    console.log('[DETEK] Plugin detek/limitin siap (anti-crash).');
};