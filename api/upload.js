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

        // 2. Memisahkan header Base64 dan mengambil isinya
        const base64Content = base64Data.split(',')[1] || base64Data;
        const buffer = Buffer.from(base64Content, 'base64');
        
        // Tentukan mime type sederhana agar server tujuan tidak curiga
        let mimeType = 'application/octet-stream';
        if (fileName?.endsWith('.jpg') || fileName?.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (fileName?.endsWith('.png')) mimeType = 'image/png';
        else if (fileName?.endsWith('.mp4')) mimeType = 'video/mp4';
        else if (fileName?.endsWith('.webm')) mimeType = 'video/webm';

        const blob = new Blob([buffer], { type: mimeType });
        let publicUrl = null;

        // ==========================================
        // OPSI 1: UPLOAD KE UGUU.SE
        // ==========================================
        try {
            const formData1 = new FormData();
            formData1.append('files[]', blob, fileName || `file_${Date.now()}.jpg`);
            
            const res1 = await fetch('https://uguu.se/upload.php', {
                method: 'POST',
                body: formData1,
                // Menyamar sebagai browser PC agar tidak diblokir sistem Anti-Bot
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            
            if (res1.ok) {
                const data1 = await res1.json();
                if (data1.success && data1.files && data1.files.length > 0) {
                    publicUrl = data1.files[0].url;
                }
            }
        } catch (err1) {
            console.warn("Uguu gagal, mencoba server fallback...", err1);
        }

        // ==========================================
        // OPSI 2: FALLBACK KE TMPFILES.ORG JIKA OPSI 1 GAGAL
        // ==========================================
        if (!publicUrl) {
            try {
                const formData2 = new FormData();
                formData2.append('file', blob, fileName || `file_${Date.now()}.jpg`);
                
                const res2 = await fetch('https://tmpfiles.org/api/v1/upload', {
                    method: 'POST',
                    body: formData2,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                
                if (res2.ok) {
                    const data2 = await res2.json();
                    if (data2.status === 'success') {
                        // Tmpfiles memberikan link page HTML, kita wajib convert ke direct link (tambahkan /dl/)
                        publicUrl = data2.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
                    }
                }
            } catch (err2) {
                console.error("Tmpfiles juga gagal:", err2);
            }
        }

        // Jika kedua server gagal (sangat jarang terjadi)
        if (!publicUrl) {
            throw new Error("Semua server penyimpanan publik sedang penuh/menolak koneksi Vercel. Coba beberapa saat lagi.");
        }

        // 5. Kembalikan URL publik tersebut ke frontend (index.html) kamu dengan sukses
        return res.status(200).json({ 
            success: true, 
            url: publicUrl 
        });

    } catch (error) {
        console.error('Upload Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Gagal memproses upload ke server penampungan.' });
    }
}
