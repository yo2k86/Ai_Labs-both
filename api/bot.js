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
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
        })
    });
}
const db = admin.firestore();

// Inisialisasi Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- FUNGSI BANTUAN UNTUK CEK LOGIN ---
async function getAuthEmail(userId) {
    try {
        const doc = await db.collection('botSessions').doc(userId.toString()).get();
        return doc.exists ? doc.data().email : null;
    } catch (error) {
        console.error("Error checking auth:", error);
        return null;
    }
}

// ==========================================
// COMMAND DASAR (START, LOGIN, LOGOUT, HELP)
// ==========================================
bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `Halo, ${ctx.from.first_name}! 👋 Selamat datang di *Ailabs gen pro*.\n\n` +
        `⚠️ *Sistem Terkunci.*\nSebelum bisa menggunakan fitur bot, kamu harus memverifikasi aksesmu menggunakan email yang sudah didaftarkan ke Bangpro.\n\n` +
        `Gunakan perintah ini:\n🔑 \`/login [email_kamu]\``
    );
});

bot.command('login', async (ctx) => {
    const email = ctx.message.text.replace('/login', '').trim().toLowerCase();
    const userId = ctx.from.id;

    if (!email) return ctx.replyWithMarkdown(`Masukkan email kamu, brow!\n*Contoh:*\n\`/login emailkamu@gmail.com\``);

    await ctx.sendChatAction('typing');
    const loadingMsg = await ctx.reply('⏳ Sedang memverifikasi akses ke database Ailabs...');

    try {
        const userDoc = await db.collection('authorizedUsers').doc(email).get();

        if (userDoc.exists) {
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
            ctx.replyWithMarkdown(`⛔ *Akses Ditolak!*\n\nEmail \`${email}\` belum terdaftar di sistem Ailabs.`);
        }
    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        ctx.reply('Ada kesalahan teknis saat menghubungi server database. Coba lagi nanti.');
    }
});

bot.command('logout', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (email) {
        await db.collection('botSessions').doc(userId.toString()).delete();
        ctx.reply('🔒 Kamu telah keluar dari sistem Ailabs.');
    } else {
        ctx.reply('Kamu belum login, brow.');
    }
});

bot.command(['test', 'halo', 'hi', 'help', 'bantuan'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const email = await getAuthEmail(ctx.from.id);
    let msg = `Halo, ${ctx.from.first_name}! Ada yang bisa *Ailabs gen pro* bantu? 🤖\n\n`;
    if (email) {
        msg += `Ketik /image [prompt] untuk mulai generate gambar AI,\nAtau ketik /video untuk masuk ke menu video.`;
    } else {
        msg += `Ketik /login [email] untuk membuka akses fitur.`;
    }
    ctx.replyWithMarkdown(msg);
});

// ==========================================
// FITUR PENGATURAN API KEY
// ==========================================
bot.command('apikey', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

    await ctx.sendChatAction('typing');
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
        '👇 Silakan balas (reply) pesan ini dengan API Key Magnific kamu:\n_(Atau ketik manual: /setkey API_KEY_KAMU)_',
        Markup.forceReply()
    );
});

bot.action('action_delete_apikey', async (ctx) => {
    const userId = ctx.from.id;
    try {
        await db.collection('apiKeys').doc(userId.toString()).delete();
        ctx.answerCbQuery('🗑️ API Key berhasil dihapus!', { show_alert: true });
        ctx.editMessageText('🔑 *Pengaturan API Key Magnific*\n\nStatus API Key saat ini: ❌ Belum ada', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '➕ Masukkan / Ganti API Key', callback_data: 'action_set_apikey' }]] }
        });
    } catch (e) {
        ctx.answerCbQuery('Gagal menghapus API Key.', { show_alert: true });
    }
});

bot.command('setkey', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

    const apiKey = ctx.message.text.replace('/setkey', '').trim();
    if (!apiKey) return ctx.reply('⚠️ Format salah! Gunakan: /setkey abcdef12345');

    await ctx.sendChatAction('typing');
    const loadingMsg = await ctx.reply('⏳ Memverifikasi API Key...');
    try {
        await axios.get('https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std', { headers: { 'x-magnific-api-key': apiKey } });
        await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        return ctx.replyWithMarkdown(`✅ *API Key Valid!* Sekarang kamu bisa menggunakan /video.`);
    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        if (error.response && error.response.status === 401) {
            return ctx.replyWithMarkdown(`❌ *API Key Ditolak!* Unauthorized.`);
        } else if (error.response) {
            await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
            return ctx.replyWithMarkdown(`✅ *API Key Disimpan (Catatan)*\nSistem menerima limitasi akun: _"${error.response.data?.message}"_`);
        } else {
            return ctx.reply(`❌ Koneksi Gagal ke Magnific.`);
        }
    }
});

bot.on('text', async (ctx, next) => {
    const isReply = ctx.message.reply_to_message && ctx.message.reply_to_message.text;
    if (isReply && ctx.message.reply_to_message.text.includes('balas (reply) pesan ini dengan API Key')) {
        const userId = ctx.from.id;
        const apiKey = ctx.message.text.trim();
        
        await ctx.sendChatAction('typing');
        const loadingMsg = await ctx.reply('⏳ Memverifikasi API Key...');
        
        try {
            await axios.get('https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std', { headers: { 'x-magnific-api-key': apiKey } });
            await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            return ctx.replyWithMarkdown(`✅ *API Key Valid!*`);
        } catch (error) {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            if (error.response && error.response.status === 401) return ctx.reply(`❌ *API Key Ditolak!*`);
            if (error.response) {
                await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
                return ctx.reply(`✅ *API Key Disimpan dengan catatan limitasi.*`);
            }
            return ctx.reply(`❌ *Koneksi Gagal*`);
        }
    }
    return next();
});

// ==========================================
// FITUR IMAGE GENERATOR
// ==========================================
bot.command('image', async (ctx) => {
    const email = await getAuthEmail(ctx.from.id);
    if (!email) return ctx.reply(`⛔ *Akses Terkunci!* /login dulu brow.`);

    const userPrompt = ctx.message.text.replace('/image ', '');
    if (!userPrompt || userPrompt === '/image') return ctx.reply('Masukkan prompt! Contoh: /image cyberpunk city');

    await ctx.sendChatAction('upload_photo');
    const loadingMsg = await ctx.reply(`⏳ Merender gambar...`);
    try {
        const response = await axios.post(
            'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
            { inputs: `${userPrompt}, highly detailed, 8k` },
            { headers: { 'Authorization': `Bearer ${process.env.HF_TOKEN}` }, responseType: 'arraybuffer' }
        );
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        await ctx.replyWithPhoto({ source: Buffer.from(response.data) }, { caption: `🎨 Prompt: ${userPrompt}` });
    } catch (error) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch(e){}
        await ctx.reply('Ada kendala teknis saat render gambar.');
    }
});

// ==========================================
// MENU VIDEO & MOTION CONTROL (UPLOAD STEP-BY-STEP)
// ==========================================
bot.command('video', async (ctx) => {
    const email = await getAuthEmail(ctx.from.id);
    if (!email) return ctx.reply(`⛔ Silakan /login terlebih dahulu.`);

    await ctx.sendChatAction('typing');
    ctx.replyWithMarkdown(
        `🎬 *Buat Video AI*\n\nPilih model AI yang ingin digunakan:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🎭 Motion Control', 'model_motion')],
            [Markup.button.callback('⚡ LTX 2.0', 'model_ltx')],
            [Markup.button.callback('🔑 Pengaturan API Key', 'menu_apikey')]
        ])
    );
});

bot.action('model_motion', async (ctx) => { 
    ctx.answerCbQuery(); 
    const userId = ctx.from.id;

    await ctx.sendChatAction('typing');
    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    if (!keyDoc.exists) return ctx.reply(`⚠️ Kamu belum memasukkan API Key Magnific. Gunakan /apikey.`);

    await db.collection('userStates').doc(userId.toString()).set({ step: 'WAITING_PHOTO' });
    ctx.replyWithMarkdown(`🎭 *Motion Control*\n\nSip! Pertama, silakan **Kirim/Upload FOTO** karakter referensinya ke sini.`); 
});

bot.action('model_ltx', (ctx) => { ctx.answerCbQuery(); ctx.reply('Fitur LTX 2.0 segera hadir! ⚡'); });
bot.action('menu_apikey', (ctx) => { ctx.answerCbQuery(); ctx.reply('Gunakan perintah /apikey untuk mengatur key.'); });

bot.on('photo', async (ctx, next) => {
    const userId = ctx.from.id;
    const stateDoc = await db.collection('userStates').doc(userId.toString()).get();

    if (stateDoc.exists && stateDoc.data().step === 'WAITING_PHOTO') {
        await ctx.sendChatAction('typing');
        const loadingMsg = await ctx.reply('⏳ Memproses foto referensi...');
        
        try {
            const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            const file = await ctx.telegram.getFile(photoId);
            const imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

            await db.collection('userStates').doc(userId.toString()).update({
                step: 'WAITING_VIDEO',
                tempImageUrl: imageUrl
            });

            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            return ctx.replyWithMarkdown(`✅ *Foto Diterima!*\n\nSekarang, silakan **Kirim/Upload VIDEO** gerakannya.\n_(Maks 20MB, durasi 3-30 detik)_`);
        } catch (error) {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            return ctx.reply('❌ Gagal memproses foto.');
        }
    }
    return next();
});

bot.on(['video', 'animation', 'document'], async (ctx, next) => {
    const userId = ctx.from.id;
    const stateDoc = await db.collection('userStates').doc(userId.toString()).get();

    if (stateDoc.exists && stateDoc.data().step === 'WAITING_VIDEO') {
        
        let media = ctx.message.video || ctx.message.animation;
        
        if (!media && ctx.message.document) {
            const doc = ctx.message.document;
            if (doc.mime_type && doc.mime_type.startsWith('video/')) {
                media = doc;
            } else {
                return ctx.reply('⚠️ File dokumen yang kamu kirim bukan format video brow.');
            }
        }

        if (!media) return next();

        if (media.file_size > 20000000) {
            return ctx.reply('⚠️ Ukuran video terlalu besar (> 20MB). Telegram membatasi bot, tolong kompres dulu ya brow.');
        }

        await ctx.sendChatAction('upload_video');
        const loadingMsg = await ctx.reply('⏳ Sedang memproses dan mengupload ke Magnific...\n_Proses ini butuh waktu beberapa detik._');
        
        try {
            const file = await ctx.telegram.getFile(media.file_id);
            const videoUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
            const imageUrl = stateDoc.data().tempImageUrl;

            const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
            const activeKey = keyDoc.data().key;

            // Proses Request POST[cite: 5]
            const response = await axios.post(
                'https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std',
                { image_url: imageUrl, video_url: videoUrl },
                { headers: { 'Content-Type': 'application/json', 'x-magnific-api-key': activeKey } }
            );

            const taskId = response.data?.task_id || response.data?.data?.task_id || response.data?.id; 
            
            await db.collection('userTasks').doc(userId.toString()).set({
                latestTaskId: taskId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await db.collection('userStates').doc(userId.toString()).delete(); 

            if (taskId) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id,
                    loadingMsg.message_id,
                    undefined,
                    `✅ *Tugas Berhasil Dikirim!*\n\nTask ID: \`${taskId}\`\nStatus AI: _in_progress_\n\nKlik tombol di bawah ini untuk melacak status render video kamu.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔍 Lacak Task Ini', callback_data: `track_${taskId}` }]
                            ]
                        }
                    }
                );
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `⚠️ Tugas terkirim tapi Task ID tidak terbaca. Coba ulangi.`);
            }

        } catch (error) {
            const errMsg = error.response?.data?.message || error.message;
            await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, `❌ *Gagal mengirim tugas*\nError: ${errMsg}`);
        }
    }
    return next();
});

// ==========================================
// 4. LOGIKA TOMBOL LACAK TASK & ERROR HANDLING VIDEO BESAR
// ==========================================
bot.action(/^track_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('Mengecek status di server...'); 
    const taskId = ctx.match[1];
    const userId = ctx.from.id;

    await ctx.sendChatAction('upload_video');

    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    if (!keyDoc.exists) return ctx.reply('⚠️ API Key hilang.');
    const activeKey = keyDoc.data().key;

    const loadingMsg = await ctx.reply('⏳ Menarik data dari server...');

    try {
        // Cek status GET ke server Magnific[cite: 2]
        const response = await axios.get(
            `https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std/${taskId}`,
            { headers: { 'x-magnific-api-key': activeKey } } 
        );

        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        const taskData = response.data?.data;
        const status = taskData?.status; 

        if (status === 'COMPLETED') { 
            const videoUrl = taskData.generated[0]; 
            
            try {
                await ctx.replyWithVideo({ url: videoUrl }, { caption: `✅ *Video Selesai!*\nTask ID: \`${taskId}\``, parse_mode: 'Markdown' });
            } catch (videoError) {
                ctx.replyWithMarkdown(
                    `⚠️ *File terlalu besar untuk dikirim langsung via Telegram.*\n\n` +
                    `🔗 *Link Permanen (Download Langsung):*\n${videoUrl}\n\n` +
                    `Silakan klik tombol di bawah ini untuk mengunduh videonya brow!`,
                    Markup.inlineKeyboard([[Markup.button.url('📥 Download Video', videoUrl)]])
                );
            }
        } 
        else if (status === 'IN_PROGRESS' || status === 'CREATED') { 
            ctx.replyWithMarkdown(
                `🔄 *Status AI: ${status}*\n\n` +
                `Video masih dirender brow. Task ID: \`${taskId}\`\n\n` +
                `Klik lacak lagi dalam beberapa menit.`,
                Markup.inlineKeyboard([[Markup.button.callback('🔍 Lacak Task Ini', `track_${taskId}`)]])
            );
        } 
        else if (status === 'FAILED') { 
            ctx.reply(`❌ Pembuatan Video Gagal dari server Magnific.`);
        }

    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        ctx.reply(`❌ Gagal mengecek status. Coba lagi nanti.`);
    }
});

// ==========================================
// FITUR DARURAT: PANGGIL TASK TERAKHIR
// ==========================================
bot.command('lacak', async (ctx) => {
    await ctx.sendChatAction('typing');
    const userId = ctx.from.id;
    const taskDoc = await db.collection('userTasks').doc(userId.toString()).get();
    
    if (!taskDoc.exists || !taskDoc.data().latestTaskId) {
        return ctx.reply('⚠️ Kamu belum pernah memproses video atau Task ID tidak ditemukan brow.');
    }
    
    const taskId = taskDoc.data().latestTaskId;
    ctx.replyWithMarkdown(
        `🔍 *Task Video Terakhir Kamu:*\n\`${taskId}\`\n\nKlik tombol di bawah ini untuk mengecek statusnya di Magnific:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Lacak Task Ini', `track_${taskId}`)]
        ])
    );
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
