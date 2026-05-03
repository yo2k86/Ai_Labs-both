export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb', // Mengizinkan payload besar untuk upload video Base64
        },
    },
};

export default async function handler(req, res) {
    // 1. Mengizinkan akses (CORS) dari website kamu
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method tidak diizinkan.' });
    }

    try {
        const { base64Data, fileName } = req.body;

        if (!base64Data) {
            return res.status(400).json({ success: false, error: 'Data file tidak ditemukan.' });
        }

        // 2. Memisahkan header Base64 (misal: "data:image/jpeg;base64,...") dan mengambil isinya
        const base64Content = base64Data.split(',')[1] || base64Data;
        const buffer = Buffer.from(base64Content, 'base64');
        
        // 3. Mengemas file untuk dikirim ke Catbox.moe
        const blob = new Blob([buffer]);
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', blob, fileName || `file_${Date.now()}.jpg`);

        // 4. Proses Upload dari Server Vercel ke Catbox (Ini akan lolos dari blokir CORS!)
        const catboxRes = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: formData
        });

        if (!catboxRes.ok) {
            throw new Error(`Catbox menolak koneksi: ${catboxRes.statusText}`);
        }

        // Catbox mengembalikan URL langsung dalam format teks (bukan JSON)
        const publicUrl = await catboxRes.text();

        // 5. Kembalikan URL publik tersebut ke frontend (index.html) kamu
        return res.status(200).json({ 
            success: true, 
            url: publicUrl 
        });

    } catch (error) {
        console.error('Upload Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Gagal memproses upload ke server penampungan.' });
    }
}
