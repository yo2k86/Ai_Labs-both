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
        await axios.get('https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std', {
            headers: { 'x-magnific-api-key': apiKey }
        });
        
        await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        return ctx.replyWithMarkdown(`✅ *API Key Diterima & Valid!*\n\nKey berhasil diverifikasi! Sekarang kamu bisa menggunakan menu \`/video\` untuk Motion Control.`);
    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        if (error.response && error.response.status === 401) {
            return ctx.replyWithMarkdown(`❌ *API Key Ditolak!*\n\nServer Magnific menjawab: **Unauthorized**. Key ini salah atau belum terdaftar. Silakan periksa kembali.`);
        } else if (error.response) {
            const errMsg = error.response.data?.message || `Error ${error.response.status}`;
            await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
            return ctx.replyWithMarkdown(`✅ *API Key Disimpan (Dengan Catatan)*\n\nKey kamu tersimpan dan formatnya dikenali. Namun saat dites, server memberikan pesan: _"${errMsg}"_.\nKamu tetap bisa mencobanya di menu \`/video\`.`);
        } else {
            return ctx.replyWithMarkdown(`❌ *Koneksi Gagal*\n\nTidak bisa menghubungi server Magnific saat ini. Coba lagi nanti.`);
        }
    }
});

bot.on('text', async (ctx, next) => {
    const isReply = ctx.message.reply_to_message && ctx.message.reply_to_message.text;
    
    if (isReply && ctx.message.reply_to_message.text.includes('Silakan balas (reply) pesan ini dengan API Key Magnific kamu')) {
        const userId = ctx.from.id;
        const email = await getAuthEmail(userId);
        if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

        const apiKey = ctx.message.text.trim();
        const loadingMsg = await ctx.reply('⏳ Memverifikasi API Key ke server Magnific...');
        
        try {
            await axios.get('https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std', {
                headers: { 'x-magnific-api-key': apiKey }
            });
            
            await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            return ctx.replyWithMarkdown(`✅ *API Key Diterima & Valid!*\n\nKey berhasil diverifikasi! Sekarang kamu bisa menggunakan menu \`/video\` untuk Motion Control.`);
        } catch (error) {
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            if (error.response && error.response.status === 401) {
                return ctx.replyWithMarkdown(`❌ *API Key Ditolak!*\n\nServer Magnific menjawab: **Unauthorized**.`);
            } else if (error.response) {
                const errMsg = error.response.data?.message || `Error ${error.response.status}`;
                await db.collection('apiKeys').doc(userId.toString()).set({ key: apiKey });
                return ctx.replyWithMarkdown(`✅ *API Key Disimpan (Dengan Catatan)*\n\nServer merespon: _"${errMsg}"_. Kamu tetap bisa mencobanya di menu \`/video\`.`);
            } else {
                return ctx.replyWithMarkdown(`❌ *Koneksi Gagal*`);
            }
        }
    }
    return next();
});

// --- FITUR GENERATE IMAGE ---
bot.command('image', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) return ctx.replyWithMarkdown(`⛔ *Akses Terkunci!*\nKamu harus login dengan email yang terdaftar. /login`);

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
            { caption: `🎨 Prompt: ${userPrompt}\n👤 Di-generate oleh: ${email}\n\n✨ Aplikasi oleh Bangpro` }
        );
    } catch (error) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id); } catch (e) {}
        await ctx.reply('Ada kendala teknis saat render gambar, brow. Coba lagi nanti ya.');
    }
});

// --- FITUR MENU VIDEO ---
bot.command('video', async (ctx) => {
    const email = await getAuthEmail(ctx.from.id);
    if (!email) return ctx.replyWithMarkdown(`⛔ *Akses Terkunci!*\nSilakan /login terlebih dahulu.`);

    ctx.replyWithMarkdown(
        `🎬 *Buat Video AI*\n\nPilih model AI yang ingin digunakan:`,
        Markup.inlineKeyboard([
            [Markup.button.url('👤 Follow Admin (Wajib)', 'https://www.facebook.com/profile.php?id=61556333717173')],
            [Markup.button.callback('🎭 Motion Control', 'model_motion')],
            [Markup.button.callback('⚡ LTX 2.0', 'model_ltx')],
            [Markup.button.callback('🔑 Pengaturan API Key', 'menu_apikey')],
            [Markup.button.callback('⬅️ Kembali', 'main_menu')]
        ])
    );
});

// --- [PERBAIKAN] HANDLING TOMBOL MOTION CONTROL ---
bot.action('model_motion', async (ctx) => { 
    ctx.answerCbQuery(); 
    const userId = ctx.from.id;

    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Sesi expired, silakan /login kembali.');

    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    if (!keyDoc.exists) {
        return ctx.replyWithMarkdown(`⚠️ Kamu belum memasukkan API Key untuk Motion Control.\nSilakan gunakan menu *Pengaturan API Key* atau perintah /apikey.`);
    }

    // Ubah respon menjadi instruksi pemakaian
    ctx.replyWithMarkdown(
        `🎭 *Kling 3 Standard - Motion Control Siap!*\n\n` +
        `Untuk membuat video, ketik perintah ini dan sertakan URL Gambar dan URL Video referensi:\n\n` +
        `\`/motion <URL_GAMBAR> <URL_VIDEO>\`\n\n` +
        `*Contoh:*\n\`/motion https://web.com/gambar.jpg https://web.com/video.mp4\``
    ); 
});

bot.action('model_ltx', async (ctx) => { 
    ctx.answerCbQuery(); 
    const email = await getAuthEmail(ctx.from.id);
    if (!email) return;
    ctx.reply('Fitur LTX 2.0 segera hadir untuk Mbelgedez Squad! ⚡'); 
});

bot.action('menu_apikey', async (ctx) => {
    // ... [kode sama seperti sebelumnya] ...
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


// ========================================================
// [FITUR BARU] 1. PROSES GENERATE VIDEO MOTION CONTROL
// ========================================================
bot.command('motion', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    if (!keyDoc.exists) return ctx.reply('⚠️ API Key Magnific belum diatur. Gunakan /apikey');
    const activeKey = keyDoc.data().key;

    // Menangkap input URL dari user
    const input = ctx.message.text.replace('/motion', '').trim().split(/\s+/);
    if (input.length < 2) {
        return ctx.replyWithMarkdown(`⚠️ *Format salah, brow!*\nPastikan kamu memasukkan URL gambar dan URL video.\n\nContoh:\n\`/motion https://web.com/gambar.jpg https://web.com/video.mp4\``);
    }

    const imageUrl = input[0];
    const videoUrl = input[1];
    const loadingMsg = await ctx.reply('⏳ Mengirim instruksi ke server Magnific...');

    try {
        // Melakukan POST request untuk membuat tugas motion control
        const response = await axios.post(
            'https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std',
            {
                image_url: imageUrl, //[cite: 5]
                video_url: videoUrl  //[cite: 5]
            },
            {
                headers: {
                    'Content-Type': 'application/json', //[cite: 5]
                    'x-magnific-api-key': activeKey     //[cite: 5]
                }
            }
        );

        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        
        // Ambil Task ID dari respon Magnific API
        const taskId = response.data?.task_id || response.data?.data?.task_id; 

        // Simpan Task ID ke database agar user mudah mengeceknya nanti
        await db.collection('userTasks').doc(userId.toString()).set({
            latestTaskId: taskId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        ctx.replyWithMarkdown(
            `✅ *Tugas Diterima Magnific!*\n\n` +
            `Server sedang merender video kamu. Proses ini memakan waktu beberapa menit.\n` +
            `**Task ID:** \`${taskId}\`\n\n` +
            `Karena batas waktu Vercel, bot tidak bisa menunggu prosesnya. Silakan ketik perintah ini secara berkala untuk mengecek hasil:\n\n` +
            `👉 \`/cekstatus\``
        );

    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        const errMsg = error.response?.data?.message || error.message;
        ctx.replyWithMarkdown(`❌ *Gagal mengirim tugas*\nError: ${errMsg}`);
    }
});


// ========================================================
// [FITUR BARU] 2. CEK STATUS & AMBIL VIDEO DARI MAGNIFIC
// ========================================================
bot.command('cekstatus', async (ctx) => {
    const userId = ctx.from.id;
    const email = await getAuthEmail(userId);
    if (!email) return ctx.reply('⛔ Kamu harus /login terlebih dahulu!');

    const keyDoc = await db.collection('apiKeys').doc(userId.toString()).get();
    if (!keyDoc.exists) return ctx.reply('⚠️ API Key Magnific belum diatur.');
    const activeKey = keyDoc.data().key;

    // Ambil Task ID terakhir yang disimpan di Firestore
    const taskDoc = await db.collection('userTasks').doc(userId.toString()).get();
    if (!taskDoc.exists || !taskDoc.data().latestTaskId) {
        return ctx.reply('⚠️ Kamu belum pernah melakukan generate video atau Task ID tidak ditemukan.');
    }

    const taskId = taskDoc.data().latestTaskId;
    const loadingMsg = await ctx.reply('⏳ Mengecek status video kamu di server Magnific...');

    try {
        // Melakukan GET request untuk melihat status tugas
        const response = await axios.get(
            `https://api.magnific.com/v1/ai/video/kling-v3-motion-control-std/${taskId}`,
            {
                headers: {
                    'x-magnific-api-key': activeKey //[cite: 2]
                }
            }
        );

        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

        const taskData = response.data?.data;
        const status = taskData?.status; // Status: CREATED, IN_PROGRESS, COMPLETED, FAILED[cite: 2]

        if (status === 'COMPLETED') { //[cite: 2]
            // Jika sukses, ambil URL video dari array `generated`[cite: 2]
            const videoUrl = taskData.generated[0]; 
            await ctx.replyWithVideo({ url: videoUrl }, { caption: `✅ *Video Selesai!*\n\nIni hasil Motion Control kamu, brow.`, parse_mode: 'Markdown' });
            
            // Opsional: Hapus sesi task jika sudah selesai
            await db.collection('userTasks').doc(userId.toString()).delete();
        } 
        else if (status === 'IN_PROGRESS' || status === 'CREATED') { //[cite: 2]
            ctx.replyWithMarkdown(`🔄 *Video Masih Diproses!*\n\nStatus saat ini: **${status}**.\nSabar ya brow, coba gunakan \`/cekstatus\` lagi dalam beberapa menit.`);
        } 
        else if (status === 'FAILED') { //[cite: 2]
            ctx.replyWithMarkdown(`❌ *Pembuatan Video Gagal!*\n\nServer Magnific gagal memproses videomu (Status: **FAILED**).`);
            await db.collection('userTasks').doc(userId.toString()).delete();
        } 
        else {
            ctx.reply(`Status tidak diketahui: ${status}`);
        }

    } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
        const errMsg = error.response?.data?.message || error.message;
        ctx.replyWithMarkdown(`❌ *Gagal mengecek status*\nError: ${errMsg}`);
    }
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
