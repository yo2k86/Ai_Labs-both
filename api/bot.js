const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const admin = require('firebase-admin');

// ==========================================
// SETUP FIREBASE ADMIN SDK UNTUK BACKEND BOT
// ==========================================
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Memastikan format private key terbaca dengan benar di Vercel
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
        })
    });
}
const db = admin.firestore();

// Inisialisasi Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- FUNGSI BANTUAN UNTUK CEK LOGIN ---
// Mengambil data sesi dari Firestore
async function getAuthEmail(userId) {
    try {
        const doc = await db.collection('botSessions').doc(userId.toString()).get();
        return doc.exists ? doc.data().email : null;
    } catch (error) {
        console.error("Error checking auth:", error);
        return null;
    }
}

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

// --- FITUR LOGIN (TERHUBUNG FIRESTORE) ---
bot.command('login', async (ctx) => {
    const email = ctx.message.text.replace('/login', '').trim().toLowerCase();
    const userId = ctx.from.id;

    if (!email) {
        return ctx.replyWithMarkdown(`Masukkan email kamu, brow!\n\n*Contoh:*\n\`/login emailkamu@gmail.com\``);
    }

    const loadingMsg = await ctx.reply('⏳ Sedang memverifikasi akses ke database Ailabs...');

    try {
        // Cek apakah email ada di koleksi "authorizedUsers" (yang diinput via Web Admin)
        const userDoc = await db.collection('authorizedUsers').doc(email).get();

        if (userDoc.exists) {
            // Jika terdaftar, simpan sesi userId di koleksi "botSessions"
            await db.collection('botSessions').doc(userId.toString()).set({
                email: email,
                loginAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            ctx.replyWithMarkdown(
                `✅ *Akses Diberikan!*\n\nSelamat datang, *${email}*. Akses kamu berhasil diverifikasi.\n\n` +
                `Sekarang kamu bisa menggunakan perintah:\n` +
                `🖼️ /image [prompt] - Generate Gambar AI\n` +
                `🎬 /video - Menu Pembuatan Video AI\n` +
                `🔑 /apikey - Pengaturan API Key Magnific`
            );
        } else {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            ctx.replyWithMarkdown(
                `⛔ *Akses Ditolak!*\n\nEmail \`${email}\` belum terdaftar di sistem Ailabs. Silakan hubungi Admin Bangpro untuk mendaftarkan email kamu.`
            );
        }
    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        ctx.reply('Ada kesalahan teknis saat menghubungi server database. Coba lagi nanti.');
        console.error(error);
    }
});

// --- FITUR LOGOUT ---
bot.command('logout', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    
    if (email) {
        await db.collection('botSessions').doc(userId.toString()).delete();
        ctx.reply('🔒 Kamu telah keluar dari sistem Ailabs. Silakan /login kembali untuk menggunakan bot.');
    } else {
        ctx.reply('Kamu belum login, brow.');
    }
});

// --- CUSTOM GREETINGS & BANTUAN ---
bot.command(['test', 'halo', 'hi', 'help', 'bantuan'], async (ctx) => {
    const email = await getAuthEmail(ctx.from.id);
    let msg = `Halo, ${ctx.from.first_name}! Ada yang bisa *Ailabs gen pro* bantu, brow? 🤖\n\n`;
    
    if (email) {
        msg += `Ketik /image [prompt] untuk mulai generate gambar AI,\nAtau ketik /video untuk masuk ke menu pembuatan video.`;
    } else {
        msg += `Ketik /login [email] untuk membuka akses fitur.`;
    }
    
    ctx.replyWithMarkdown(msg);
});

// --- FITUR PENGATURAN API KEY (DENGAN TOMBOL UI) ---
bot.command('apikey', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    let status = keyDoc.exists ? "✅ Diterima & Aktif" : "❌ Belum ada";

    ctx.replyWithMarkdown(
        `🔑 *Pengaturan API Key Magnific*\n\nStatus API Key saat ini: ${status}\n\nPilih aksi di bawah ini:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('➕ Masukkan / Ganti API Key', 'action_set_apikey')],
            [Markup.button.callback('🗑️ Hapus API Key', 'action_delete_apikey')]
        ])
    );
});

bot.action('action_set_apikey', async (ctx) => {
    ctx.answerCbQuery();
    ctx.replyWithMarkdown(
        '👇 Silakan balas (reply) pesan ini dengan API Key Magnific kamu:\n\n_(Atau jika mode reply hilang saat mem-paste, ketik saja manual format ini: /setkey API_KEY_KAMU)_',
        Markup.forceReply()
    );
});

bot.action('action_delete_apikey', async (ctx) => {
    const userId = ctx.from.id;
    try {
        await db.collection('apiKeys').doc(userId.toString()).delete();
        ctx.answerCbQuery('🗑️ API Key berhasil dihapus!', { show_alert: true });
        ctx.editMessageText('🔑 *Pengaturan API Key Magnific*\n\nStatus API Key saat ini: ❌ Belum ada\n\nPilih aksi di bawah ini:', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Masukkan / Ganti API Key', callback_data: 'action_set_apikey' }]
                ]
            }
        });
    } catch (e) {
        ctx.answerCbQuery('Gagal menghapus API Key.', { show_alert: true });
    }
});

// --- FALLBACK COMMAND (Jika gagal lewat reply) ---
bot.command('setkey', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

    const apiKey = ctx.message.text.replace('/setkey', '').trim();
    if (!apiKey) {
        return ctx.reply('⚠️ Format salah! Gunakan perintah seperti ini: /setkey abcdef12345');
    }

    const loadingMsg = await ctx.reply('⏳ Memverifikasi API Key ke server Magnific...');
    try {
        // Test API Key dengan menembak list tasks Magnific
        await axios.get('https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std', {
            headers: { 'x-magnific-api-key': apiKey }
        });
        
        await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        return ctx.replyWithMarkdown(`✅ *API Key Diterima & Valid!*\n\nKey berhasil diverifikasi! Sekarang kamu bisa menggunakan menu \`/video\` untuk Motion Control.`);
    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        return ctx.replyWithMarkdown(`❌ *API Key Ditolak!*\n\nAPI Key tidak valid. Silakan periksa kembali API Key Magnific kamu.`);
    }
});

// --- Listener untuk menangkap input API Key dari balasan (reply) ---
bot.on('text', async (ctx, next) => {
    const isReply = ctx.message.reply_to_message && ctx.message.reply_to_message.text;
    
    if (isReply && ctx.message.reply_to_message.text.includes('Silakan balas (reply) pesan ini dengan API Key Magnific kamu')) {
        const userId = ctx.from.id;
        const email = await getAuthEmail(userId);
        if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

        const apiKey = ctx.message.text.trim();
        const loadingMsg = await ctx.reply('⏳ Memverifikasi API Key ke server Magnific...');
        
        try {
            // Test API Key dengan menembak list tasks Magnific
            await axios.get('https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std', {
                headers: { 'x-magnific-api-key': apiKey }
            });
            
            await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            return ctx.replyWithMarkdown(`✅ *API Key Diterima & Valid!*\n\nKey berhasil diverifikasi! Sekarang kamu bisa menggunakan menu \`/video\` untuk Motion Control.`);
        } catch (error) {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            return ctx.replyWithMarkdown(`❌ *API Key Ditolak!*\n\nAPI Key tidak valid. Silakan periksa kembali API Key Magnific kamu.`);
        }
    }
    return next();
});

// --- FITUR GENERATE IMAGE ---
bot.command('image', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) {
        return ctx.replyWithMarkdown(`⛔ *Akses Terkunci!*\nKamu harus login dengan email yang terdaftar. Gunakan perintah:\n\`/login emailkamu@gmail.com\``);
    }

    const userPrompt = ctx.message.text.replace('/image ', '');
    if (!userPrompt || userPrompt === '/image') {
        return ctx.reply('Masukkan promptnya brow! Contoh: /image cyberpunk city');
    }

    const loadingMsg = await ctx.reply(`⏳ Ailabs gen pro sedang merender gambar untuk: "${userPrompt}"...`);

    try {
        // Mode konsistensi wajah yang ketat aktif:
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
            { caption: `🎨 Prompt: ${userPrompt}\n👤 Di-generate oleh: ${email}\n\n✨ Aplikasi oleh Bangpro` }
        );

    } catch (error) {
        console.error("Error:", error.message);
        try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}
        await ctx.reply('Ada kendala teknis saat render gambar, brow. Coba lagi nanti ya.');
    }
});

// --- FITUR MENU VIDEO ---
bot.command('video', async (ctx) => {
    const email = await getAuthEmail(ctx.from.id);
    if (!email) {
        return ctx.replyWithMarkdown(`⛔ *Akses Terkunci!*\nKamu harus login dengan email yang terdaftar. Gunakan perintah:\n\`/login emailkamu@gmail.com\``);
    }

    ctx.replyWithMarkdown(
        `🎬 *Buat Video AI*\n\n` +
        `Pilih model AI yang ingin digunakan:`,
        Markup.inlineKeyboard([
            [Markup.button.url('👤 Follow Admin (Wajib)', 'https://www.facebook.com/profile.php?id=61556333717173')],
            [Markup.button.callback('🎭 Motion Control', 'model_motion')],
            [Markup.button.callback('⚡ LTX 2.0', 'model_ltx')],
            [Markup.button.callback('🔑 Pengaturan API Key', 'menu_apikey')],
            [Markup.button.callback('⬅️ Kembali', 'main_menu')]
        ])
    );
});

// --- HANDLING TOMBOL ---
bot.action('model_motion', async (ctx) => { 
    ctx.answerCbQuery(); 
    const userId = ctx.from.id;

    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Sesi expired, silakan /login kembali.');

    // Cek API Key dari database
    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    
    if (!keyDoc.exists) {
        return ctx.replyWithMarkdown(`⚠️ Kamu belum memasukkan API Key untuk Motion Control.\nSilakan gunakan menu *Pengaturan API Key* atau perintah /apikey untuk menyimpannya.`);
    }

    const activeKey = keyDoc.data().key;
    ctx.reply(`Sistem memproses Motion Control dengan API Key kamu... (Key aktif: ${activeKey.substring(0, 5)}***) ⏳`); 
});

bot.action('model_ltx', async (ctx) => { 
    ctx.answerCbQuery(); 
    const email = await getAuthEmail(ctx.from.id);
    if (!email) return;
    ctx.reply('Fitur LTX 2.0 segera hadir untuk Mbelgedez Squad! ⚡'); 
});

bot.action('menu_apikey', async (ctx) => {
    ctx.answerCbQuery();
    const userId = ctx.from.id;
    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    let status = keyDoc.exists ? "✅ Diterima & Aktif" : "❌ Belum ada";

    ctx.replyWithMarkdown(
        `🔑 *Pengaturan API Key Magnific*\n\nStatus API Key saat ini: ${status}\n\nPilih aksi di bawah ini:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('➕ Masukkan / Ganti API Key', 'action_set_apikey')],
            [Markup.button.callback('🗑️ Hapus API Key', 'action_delete_apikey')]
        ])
    );
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
