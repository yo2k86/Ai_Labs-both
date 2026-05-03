const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Objek sementara untuk menyimpan API Key user 
// (CATATAN: Karena di Vercel, data ini akan hilang kalau server sedang sleep/restart. Idealnya nanti pakai database seperti Firebase/Firestore)
const userApiKeys = {};

// Di Vercel, kita gak perlu require('dotenv').config() karena env diatur di dashboard Vercel
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- START COMMAND ---
bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `Halo, ${ctx.from.first_name}! 👋 Selamat datang di *Ailabs gen pro*.\n\n` +
        `Gunakan perintah ini untuk mulai berkarya:\n` +
        `🖼️ /image [prompt] - Generate Gambar AI\n` +
        `🎬 /video - Menu Pembuatan Video AI\n` +
        `🔑 /setapikey [key] - Masukkan API Key Motion Control\n` +
        `🗑️ /resetapikey - Hapus API Key kamu\n\n` +
        `✨ *Aplikasi oleh Bangpro*`
    );
});

// --- CUSTOM GREETINGS & BANTUAN ---
bot.command(['test', 'halo', 'hi', 'help', 'bantuan'], (ctx) => {
    ctx.replyWithMarkdown(
        `Halo, ${ctx.from.first_name}! Ada yang bisa *Ailabs gen pro* bantu, brow? 🤖\n\n` +
        `Ketik /image [prompt] untuk mulai generate gambar AI,\n` +
        `Atau ketik /video untuk masuk ke menu pembuatan video.`
    );
});

// --- WELCOME MESSAGE GRUP ---
bot.on('new_chat_members', (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    newMembers.forEach((member) => {
        if (member.username !== ctx.botInfo.username) {
            ctx.replyWithMarkdown(
                `Welcome to the club, ${member.first_name}! 👋\n` +
                `Saya bot *Ailabs gen pro*. Ketik /start atau /bantuan di chat pribadi dengan saya untuk mulai generate gambar dan video AI!`
            );
        }
    });
});

// --- FITUR SET API KEY MOTION CONTROL ---
bot.command('setapikey', (ctx) => {
    const apiKey = ctx.message.text.replace('/setapikey', '').trim();
    const userId = ctx.from.id;

    if (!apiKey) {
        return ctx.replyWithMarkdown(
            `Ketik perintahnya beserta API Key kamu ya, brow.\n\n` +
            `*Contoh:*\n\`/setapikey abs123456789xyz\``
        );
    }

    userApiKeys[userId] = apiKey;
    ctx.replyWithMarkdown(
        `✅ *API Key Berhasil Disimpan!*\n\n` +
        `API Key kamu sudah aktif dan siap digunakan untuk fitur Motion Control.`
    );
});

// --- FITUR RESET API KEY ---
bot.command('resetapikey', (ctx) => {
    const userId = ctx.from.id;

    if (userApiKeys[userId]) {
        delete userApiKeys[userId];
        ctx.replyWithMarkdown(
            `🗑️ *API Key Berhasil Direset!*\n\n` +
            `Sistem sudah menghapus API Key kamu. Silakan gunakan \`/setapikey [kunci_baru]\` jika ingin memasukkan yang baru.`
        );
    } else {
        ctx.reply('Kamu belum menyimpan API Key apapun, brow. Tidak ada yang perlu direset.');
    }
});

// --- FITUR GENERATE IMAGE ---
bot.command('image', async (ctx) => {
    const userPrompt = ctx.message.text.replace('/image ', '');
    if (!userPrompt || userPrompt === '/image') {
        return ctx.reply('Masukkan promptnya brow! Contoh: /image cyberpunk city');
    }

    const loadingMsg = await ctx.reply(`⏳ Ailabs gen pro sedang merender gambar untuk: "${userPrompt}"...`);

    try {
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
            { caption: `🎨 Prompt: ${userPrompt}\n\n✨ Aplikasi oleh Bangpro` }
        );

    } catch (error) {
        console.error("Error:", error.message);
        try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}
        await ctx.reply('Ada kendala teknis saat render gambar, brow. Coba lagi nanti ya.');
    }
});

// --- FITUR MENU VIDEO ---
bot.command('video', (ctx) => {
    ctx.replyWithMarkdown(
        `🎬 *Buat Video AI*\n\n` +
        `Pilih model AI yang ingin digunakan:`,
        Markup.inlineKeyboard([
            [Markup.button.url('👤 Follow Admin (Wajib)', 'https://www.facebook.com/profile.php?id=61556333717173')],
            [Markup.button.callback('🎭 Motion Control', 'model_motion')],
            [Markup.button.callback('⚡ LTX 2.0', 'model_ltx')],
            [Markup.button.callback('⬅️ Kembali', 'main_menu')],
            [Markup.button.callback('🔑 API Key aktif (sisa 200/200)', 'check_api')]
        ])
    );
});

// --- HANDLING TOMBOL ---
bot.action('model_motion', (ctx) => { 
    ctx.answerCbQuery(); 
    const userId = ctx.from.id;

    // Cek apakah user sudah set API key
    if (!userApiKeys[userId]) {
        return ctx.replyWithMarkdown(
            `⚠️ Kamu belum memasukkan API Key untuk Motion Control.\n\n` +
            `Silakan masukkan API key kamu dengan format:\n\`/setapikey [API_KEY_KAMU]\``
        );
    }

    const activeKey = userApiKeys[userId];
    ctx.reply(`Sistem memproses Motion Control dengan API Key kamu... (Key aktif: ${activeKey.substring(0, 5)}***) ⏳\n\n_(Fitur integrasi API videonya nyusul di dapur Ailabs gen pro!)_`); 
});

bot.action('model_ltx', (ctx) => { ctx.answerCbQuery(); ctx.reply('Fitur LTX 2.0 segera hadir untuk Mbelgedez Squad! ⚡'); });
bot.action('main_menu', (ctx) => { ctx.answerCbQuery(); ctx.reply('Kembali ke menu utama. Gunakan perintah /image atau /video.'); });

// === PENTING: PENGGANTI bot.launch() UNTUK VERCEL ===
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error('Error Webhook:', err);
        // Tetap kirim 200 agar Telegram tidak mengulang pesan yang error terus-terusan
        res.status(200).send('Error but handled'); 
    }
};
