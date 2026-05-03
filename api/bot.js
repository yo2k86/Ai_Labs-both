const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// ==========================================
// SIMULASI DATABASE & PENYIMPANAN SEMENTARA
// (Nanti ini diganti dengan Firebase/Firestore agar permanen)
// ==========================================

// 1. Daftar Email yang diizinkan (Sinkron dengan Admin Panel)
const authorizedEmails = [
    'bangpro.vip@gmail.com',
    'client.mbelgedez@gmail.com'
];

// 2. Data Sesi User yang sedang login di bot
const loggedInUsers = {};

// 3. API Key Motion Control masing-masing user
const userApiKeys = {};

// ==========================================

// Inisialisasi Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- START COMMAND ---
bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `Halo, ${ctx.from.first_name}! 👋 Selamat datang di *Ailabs gen pro*.\n\n` +
        `⚠️ *Sistem Terkunci.*\nSebelum bisa menggunakan fitur bot, kamu harus memverifikasi aksesmu menggunakan email yang sudah didaftarkan ke Bangpro.\n\n` +
        `Gunakan perintah ini:\n` +
        `🔑 \`/login [email_kamu]\`\n\n` +
        `*Contoh:*\n\`/login client.mbelgedez@gmail.com\``
    );
});

// --- FITUR LOGIN (WAJIB) ---
bot.command('login', (ctx) => {
    const email = ctx.message.text.replace('/login', '').trim().toLowerCase();
    const userId = ctx.from.id;

    if (!email) {
        return ctx.replyWithMarkdown(`Masukkan email kamu, brow!\n\n*Contoh:*\n\`/login emailkamu@gmail.com\``);
    }

    // Cek apakah email ada di daftar authorized
    if (authorizedEmails.includes(email)) {
        loggedInUsers[userId] = email;
        ctx.replyWithMarkdown(
            `✅ *Akses Diberikan!*\n\nSelamat datang, *${email}*. Akses kamu berhasil diverifikasi.\n\n` +
            `Sekarang kamu bisa menggunakan perintah:\n` +
            `🖼️ /image [prompt] - Generate Gambar AI\n` +
            `🎬 /video - Menu Pembuatan Video AI\n` +
            `🔑 /setapikey [key] - Set API Motion Control`
        );
    } else {
        ctx.replyWithMarkdown(
            `⛔ *Akses Ditolak!*\n\nEmail \`${email}\` belum terdaftar di sistem Ailabs. Silakan hubungi Admin Bangpro untuk mendaftarkan email kamu.`
        );
    }
});

// --- FITUR LOGOUT ---
bot.command('logout', (ctx) => {
    const userId = ctx.from.id;
    if (loggedInUsers[userId]) {
        delete loggedInUsers[userId];
        ctx.reply('🔒 Kamu telah keluar dari sistem Ailabs. Silakan /login kembali untuk menggunakan bot.');
    } else {
        ctx.reply('Kamu belum login, brow.');
    }
});

// --- CUSTOM GREETINGS & BANTUAN ---
bot.command(['test', 'halo', 'hi', 'help', 'bantuan'], (ctx) => {
    ctx.replyWithMarkdown(
        `Halo, ${ctx.from.first_name}! Ada yang bisa *Ailabs gen pro* bantu, brow? 🤖\n\n` +
        `Ketik /login [email] untuk membuka akses fitur,\n` +
        `Ketik /image [prompt] untuk mulai generate gambar AI,\n` +
        `Atau ketik /video untuk masuk ke menu pembuatan video.`
    );
});

// --- FITUR SET API KEY MOTION CONTROL ---
bot.command('setapikey', (ctx) => {
    // PROTEKSI: Cek Login
    if (!loggedInUsers[ctx.from.id]) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

    const apiKey = ctx.message.text.replace('/setapikey', '').trim();
    const userId = ctx.from.id;

    if (!apiKey) {
        return ctx.replyWithMarkdown(`Ketik perintahnya beserta API Key kamu ya.\n*Contoh:*\n\`/setapikey abs123456789xyz\``);
    }

    userApiKeys[userId] = apiKey;
    ctx.replyWithMarkdown(`✅ *API Key Berhasil Disimpan untuk Motion Control!*`);
});

bot.command('resetapikey', (ctx) => {
    const userId = ctx.from.id;
    if (userApiKeys[userId]) {
        delete userApiKeys[userId];
        ctx.replyWithMarkdown(`🗑️ *API Key Berhasil Direset!*`);
    } else {
        ctx.reply('Kamu belum menyimpan API Key apapun.');
    }
});

// --- FITUR GENERATE IMAGE ---
bot.command('image', async (ctx) => {
    // PROTEKSI: Cek Login
    if (!loggedInUsers[ctx.from.id]) {
        return ctx.replyWithMarkdown(`⛔ *Akses Terkunci!*\nKamu harus login dengan email yang terdaftar. Gunakan perintah:\n\`/login emailkamu@gmail.com\``);
    }

    const userPrompt = ctx.message.text.replace('/image ', '');
    if (!userPrompt || userPrompt === '/image') {
        return ctx.reply('Masukkan promptnya brow! Contoh: /image cyberpunk city');
    }

    const loadingMsg = await ctx.reply(`⏳ Ailabs gen pro sedang merender gambar untuk: "${userPrompt}"...`);

    try {
        // Face Lock Aktif (sesuai request untuk selalu menjaga konsistensi wajah)
        const finalPrompt = `${userPrompt}, highly detailed, photorealistic, cinematic lighting, consistent facial structure, face lock, perfect skin texture, 8k`;

        const response = await axios.post(
            'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
            { inputs: finalPrompt },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.HF_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer' 
            }
        );

        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        await ctx.replyWithPhoto(
            { source: Buffer.from(response.data) },
            { caption: `🎨 Prompt: ${userPrompt}\n👤 Di-generate oleh: ${loggedInUsers[ctx.from.id]}\n\n✨ Aplikasi oleh Bangpro` }
        );

    } catch (error) {
        console.error("Error:", error.message);
        try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}
        await ctx.reply('Ada kendala teknis saat render gambar, brow. Coba lagi nanti ya.');
    }
});

// --- FITUR MENU VIDEO ---
bot.command('video', (ctx) => {
    // PROTEKSI: Cek Login
    if (!loggedInUsers[ctx.from.id]) {
        return ctx.replyWithMarkdown(`⛔ *Akses Terkunci!*\nKamu harus login dengan email yang terdaftar. Gunakan perintah:\n\`/login emailkamu@gmail.com\``);
    }

    ctx.replyWithMarkdown(
        `🎬 *Buat Video AI*\n\n` +
        `Pilih model AI yang ingin digunakan:`,
        Markup.inlineKeyboard([
            [Markup.button.url('👤 Follow Admin (Wajib)', 'https://www.facebook.com/profile.php?id=61556333717173')],
            [Markup.button.callback('🎭 Motion Control', 'model_motion')],
            [Markup.button.callback('⚡ LTX 2.0', 'model_ltx')],
            [Markup.button.callback('⬅️ Kembali', 'main_menu')]
        ])
    );
});

// --- HANDLING TOMBOL ---
bot.action('model_motion', (ctx) => { 
    ctx.answerCbQuery(); 
    const userId = ctx.from.id;

    // Proteksi di dalam callback juga
    if (!loggedInUsers[userId]) return ctx.reply('⛔ Sesi expired, silakan /login kembali.');

    if (!userApiKeys[userId]) {
        return ctx.replyWithMarkdown(`⚠️ Kamu belum memasukkan API Key untuk Motion Control.\nSilakan masukkan API key kamu:\n\`/setapikey [API_KEY_KAMU]\``);
    }

    const activeKey = userApiKeys[userId];
    ctx.reply(`Sistem memproses Motion Control dengan API Key kamu... (Key aktif: ${activeKey.substring(0, 5)}***) ⏳`); 
});

bot.action('model_ltx', (ctx) => { 
    ctx.answerCbQuery(); 
    if (!loggedInUsers[ctx.from.id]) return;
    ctx.reply('Fitur LTX 2.0 segera hadir untuk Mbelgedez Squad! ⚡'); 
});

bot.action('main_menu', (ctx) => { 
    ctx.answerCbQuery(); 
    ctx.reply('Kembali ke menu utama. Gunakan perintah /image atau /video.'); 
});

// === PENGGANTI bot.launch() UNTUK VERCEL ===
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error('Error Webhook:', err);
        res.status(200).send('Error but handled'); 
    }
};
