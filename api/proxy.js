export default async function handler(req, res) {
    // 1. Mengizinkan akses (CORS) dari website kamu
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-magnific-api-key');

    // Handle preflight request browser
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Ambil URL target (Magnific) dari body atau parameter
        const targetUrl = req.query.url || req.body?.url;
        const apiKey = req.headers['x-magnific-api-key'];

        if (!targetUrl || !apiKey) {
            return res.status(400).json({ error: "URL target dan API Key wajib disertakan." });
        }

        // Siapkan perlengkapan untuk menembak API Magnific
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'x-magnific-api-key': apiKey
            }
        };

        // Jika POST (Start Generate), teruskan semua payloadnya
        if (req.method === 'POST') {
            const payload = { ...req.body };
            delete payload.url; // Hapus properti internal
            fetchOptions.body = JSON.stringify(payload);
        }

        // Tembak server Magnific dari Backend Vercel (Ini 100% lolos blokir CORS)
        const response = await fetch(targetUrl, fetchOptions);
        const data = await response.json();

        // Kembalikan hasilnya ke website
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        return res.status(500).json({ error: error.message || 'Gagal menghubungi server Magnific.' });
    }
}
