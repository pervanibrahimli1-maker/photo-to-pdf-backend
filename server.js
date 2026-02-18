// server.js (Video Downloader Backend Serveriniz)

require('dotenv').config(); // .env faylındakı dəyişənləri yükləyin
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // RapidAPI sorğuları üçün
const helmet = require('helmet'); // Təhlükəsizlik üçün
const rateLimit = require('express-rate-limit'); // Sorğu limitləməsi üçün

const app = express();
// Render, Heroku kimi proksi arxasında olan mühitlərdə IP-ni düzgün oxumaq üçün:
app.set('trust proxy', 1); 

const port = process.env.PORT || 3000;

// ===============================================================
// TƏHLÜKƏSİZLİK QAYDALARI
// ===============================================================

// Helmet istifadə edərək müxtəlif təhlükəsizlik başlıqları əlavə edin
app.use(helmet());

// Sorğu limitləməsi (Rate Limiting)
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 dəqiqə
    max: 100, // Hər IP üçün 5 dəqiqədə 100 sorğu
    message: 'Çoxlu sorğu göndərmisiniz, zəhmət olmasa bir az gözləyin.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Bütün API sorğularına rate limiting tətbiq et
app.use(apiLimiter);

// CORS ayarları
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://sizin-video-downloader-frontend.ct.ws'; // Frontend domeninizi buraya əlavə edin
const allowedOrigins = [
    frontendOrigin,
    'http://localhost:5500', // Frontend test üçün
    'http://127.0.0.1:5500', // Frontend test üçün
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Bu domenə icazə verilmir (Not allowed by CORS)'));
        }
    },
    methods: ['GET'], // Sadəcə GET sorğularına icazə verin
    allowedHeaders: ['Content-Type'],
}));

// RapidAPI açarınızı ətraf mühit dəyişənlərindən götürün
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// API Hostlarını təyin edin
const TIKTOK_RAPIDAPI_HOST = 'tiktok-download-video1.p.rapidapi.com';
const INSTAGRAM_REELS_RAPIDAPI_HOST = 'instagram-reels-downloader-api.p.rapidapi.com'; // Instagram Reels API hostu

if (!RAPIDAPI_KEY) {
    console.error('RAPIDAPI_KEY ətraf mühit dəyişənlərində təyin edilməyib. Zəhmət olmasa .env faylında qeyd edin.');
    process.exit(1); // API açarı yoxdursa, serveri başlatmayın
}

// URL-in hansı platformaya aid olduğunu müəyyən edən köməkçi funksiya
function getPlatform(url) {
    if (url.includes('tiktok.com')) {
        return 'tiktok';
    }
    if (url.includes('instagram.com/reel')) {
        return 'instagram_reel';
    }
    // Gələcəkdə digər platformaları da əlavə edə bilərsiniz
    return 'unknown';
}

// 1. `/info` endpointi - Video məlumatlarını gətirir (başlıq, thumbnail)
app.get('/info', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL-i təmin edilmədi.' });
    }

    const platform = getPlatform(videoUrl);
    let options = {};
    let title = 'Başlıq Tapılmadı';
    let thumbnail = '';

    try {
        if (platform === 'tiktok') {
            options = {
                method: 'GET',
                // TikTok API üçün endpoint URL-i (getTiktokVideoInfo)
                url: `https://${TIKTOK_RAPIDAPI_HOST}/getTiktokVideoInfo`, 
                params: { url: videoUrl },
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': TIKTOK_RAPIDAPI_HOST
                }
            };
            const response = await axios.request(options);
            const rapidApiData = response.data;
            
            // Cavab strukturuna uyğun düzəliş edin
            title = rapidApiData.data?.title || 'TikTok Video Başlığı Tapılmadı';
            thumbnail = rapidApiData.data?.thumbnail_url || '';

        } else if (platform === 'instagram_reel') {
            options = {
                method: 'GET',
                // Instagram Reels API üçün endpoint URL-i (/download)
                url: `https://${INSTAGRAM_REELS_RAPIDAPI_HOST}/download`, 
                params: { url: videoUrl },
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': INSTAGRAM_REELS_RAPIDAPI_HOST
                }
            };
            const response = await axios.request(options);
            const rapidApiData = response.data;
            
            // **INSTAGRAM REELS API CAVAB STRUKTURUNU BURADA DƏQİQLƏŞDİRİN!**
            // Nümunə: Əgər API cavabı birbaşa kök obyektdə `title` və `thumbnail_url` verirsə:
            title = rapidApiData.title || 'Instagram Reel Başlığı Tapılmadı';
            thumbnail = rapidApiData.thumbnail_url || '';
            // Yox, əgər `data` obyekti içindədirsə:
            // title = rapidApiData.data?.title || 'Instagram Reel Başlığı Tapılmadı';
            // thumbnail = rapidApiData.data?.thumbnail_url || '';
            
        } else {
            return res.status(400).json({ error: 'Dəstəklənməyən platforma URL-i.' });
        }

        res.json({ title, thumbnail });

    } catch (error) {
        console.error('RapidAPI /info sorğusu zamanı xəta:', error.message);
        console.error('Xəta Cavabı:', error.response ? error.response.data : 'Cavab yoxdur');
        res.status(500).json({ error: 'Video məlumatları gətirilərkən xəta baş verdi.' });
    }
});


// 2. `/download-video` endpointi - Videonu birbaşa yükləmə linkinə yönləndirir
app.get('/download-video', async (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL-i təmin edilmədi.' });
    }

    const platform = getPlatform(videoUrl);
    let options = {};
    let directDownloadLink = null;

    try {
        if (platform === 'tiktok') {
            options = {
                method: 'GET',
                url: `https://${TIKTOK_RAPIDAPI_HOST}/getTiktokVideoInfo`,
                params: { url: videoUrl },
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': TIKTOK_RAPIDAPI_HOST
                }
            };
            const response = await axios.request(options);
            const rapidApiData = response.data;
            
            // Cavab strukturuna uyğun düzəliş edin
            directDownloadLink = rapidApiData.data?.download_url;

        } else if (platform === 'instagram_reel') {
            options = {
                method: 'GET',
                url: `https://${INSTAGRAM_REELS_RAPIDAPI_HOST}/download`, 
                params: { url: videoUrl },
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': INSTAGRAM_REELS_RAPIDAPI_HOST
                }
            };
            const response = await axios.request(options);
            const rapidApiData = response.data;
            
            // **INSTAGRAM REELS API CAVAB STRUKTURUNU BURADA DƏQİQLƏŞDİRİN!**
            // Nümunə: Əgər API cavabı birbaşa kök obyektdə `download_url` verir, və ya `video_url` adlanırsa:
            directDownloadLink = rapidApiData.download_url || rapidApiData.video_url;
            // Yox, əgər `data` obyekti içindədirsə:
            // directDownloadLink = rapidApiData.data?.download_url;
            
        } else {
            return res.status(400).json({ error: 'Dəstəklənməyən platforma URL-i.' });
        }

        if (directDownloadLink) {
            // Frontend birbaşa bu linkə yönləndiriləcək.
            return res.redirect(directDownloadLink);
        } else {
            throw new Error('RapidAPI-dən birbaşa yükləmə linki alınmadı.');
        }

    } catch (error) {
        console.error('RapidAPI /download-video sorğusu zamanı xəta:', error.message);
        console.error('Xəta Cavabı:', error.response ? error.response.data : 'Cavab yoxdur');
        res.status(500).json({ error: 'Video yüklənərkən xəta baş verdi.' });
    }
});


app.listen(port, () => {
    console.log(`Video Downloader Server ${port} portunda işləyir.`);
});
