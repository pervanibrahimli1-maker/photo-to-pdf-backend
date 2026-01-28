const express = require('express');
const multer = require('multer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// ===============================================================
// TƏHLÜKƏSİZLİK QAYDALARI
// ===============================================================

// 1. Helmet istifadə edərək müxtəlif təhlükəsizlik başlıqları əlavə edin
app.use(helmet());

// 2. Sorğu limitləməsi (Rate Limiting)
// Bir IP ünvanından 5 dəqiqə ərzində maksimum 100 sorğuya icazə ver
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 dəqiqə
    max: 100, // Hər IP üçün 5 dəqiqədə 100 sorğu
    message: 'Çoxlu sorğu göndərmisiniz, zəhmət olmasa bir az gözləyin.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Bütün API sorğularına rate limiting tətbiq et
app.use(apiLimiter);

// 3. CORS ayarları
// Frontend domenini mühit dəyişənindən götürün (Render.com üçün)
// Render.com-da bu dəyəri "Environment Variables" bölməsində təyin etməlisiniz:
// FRONTEND_ORIGIN = https://photo-to-pdf.ct.ws
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://photo-to-pdf.ct.ws'; // Default olaraq daxil edildi
const allowedOrigins = [
    frontendOrigin,
    'http://localhost:5500', // Yerli inkişaf üçün
    'http://127.0.0.1:5500', // Yerli inkişaf üçün
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Bu domenə icazə verilmir (Not allowed by CORS)'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));


// Müvəqqəti fayllar üçün qovluq (OS temp qovluğunda)
const tempUploadDir = path.join(os.tmpdir(), 'image_to_pdf_uploads');
// Qovluğun mövcud olmasını təmin et
if (!fs.existsSync(tempUploadDir)) {
    fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Multer storage ayarı: Faylları müvəqqəti disqə yazır
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
    }
});

// Multer yükləmə middleware
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 5 * 1024 * 1024 * 5, // Hər fayl üçün 25MB limit
        files: 10 // Tək bir sorğuda maksimum 10 fayla icazə ver
    }, 
    fileFilter: (req, file, cb) => {
        // Yalnız JPEG, PNG və WebP formatlarına icazə ver
        if (file.mimetype === 'image/jpeg' || 
            file.mimetype === 'image/jpg' || 
            file.mimetype === 'image/png' ||
            file.mimetype === 'image/webp') { // WebP yoxlamasını əlavə et, lakin embed etməyi qeyd et
            cb(null, true);
        } else {
            cb(new Error('Yalnız JPEG, PNG və WebP şəkil fayllarına icazə verilir!'), false);
        }
    }
});

// Şəkilləri PDF-ə çevirmək üçün POST endpoint-i
app.post('/convert-to-pdf', upload.array('images'), async (req, res) => {
    let uploadedFilePaths = []; // Yüklənmiş fayl yollarını saxlamaq üçün

    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Şəkil faylları tapılmadı.' });
        }

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        for (const file of req.files) {
            uploadedFilePaths.push(file.path);
            
            let image;
            const imageBuffer = fs.readFileSync(file.path);

            try {
                if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
                    image = await pdfDoc.embedJpg(imageBuffer);
                } else if (file.mimetype === 'image/png') {
                    image = await pdfDoc.embedPng(imageBuffer);
                } else if (file.mimetype === 'image/webp') {
                    // pdf-lib 1.x WebP-ni birbaşa dəstəkləmir.
                    // Buraya WebP-ni JPG/PNG-ə çevirmə məntiqi əlavə oluna bilər.
                    // Hal-hazırda, təhlükəsizlik filtri WebP-ə icazə versə də, çevirmədən keçmir.
                    console.warn(`WebP şəkil formatı (${file.originalname}) birbaşa PDF-ə daxil edilə bilmədi. Atlandı.`);
                    continue; // Atla
                } else {
                    console.warn(`Dəstəklənməyən şəkil formatı (${file.originalname}) - ${file.mimetype}. Atlandı.`);
                    continue;
                }
            } catch (embedError) {
                console.error(`Şəkil embed edilərkən xəta: ${file.originalname} - ${embedError.message}`);
                continue;
            }

            const page = pdfDoc.addPage();
            const { width, height } = page.getSize();
            const imageDims = image.scaleToFit(width - 50, height - 50); 

            page.drawImage(image, {
                x: (page.getWidth() - imageDims.width) / 2,
                y: (page.getHeight() - imageDims.height) / 2,
                width: imageDims.width,
                height: imageDims.height,
            });
        }

        if (pdfDoc.getPageCount() === 0) {
            return res.status(400).json({ message: 'Heç bir şəkil dəstəklənən formatda deyil və ya çevrilmədi.' });
        }

        const pdfBytes = await pdfDoc.save();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="converted_images.pdf"');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('PDF çevirmə zamanı ümumi xəta:', error);
        res.status(500).json({ message: 'Server xətası: Şəkillər PDF-ə çevrilərkən problem yaşandı.' });
    } finally {
        uploadedFilePaths.forEach(filePath => {
            fs.unlink(filePath, (err) => {
                if (err) console.error(`Müvəqqəti fayl silinərkən xəta: ${filePath}`, err);
            });
        });
    }
});

// Serveri işə sal
app.listen(port, () => {
    console.log(`Server ${port} portunda işləyir.`);
    console.log(`Backend ${process.env.NODE_ENV || 'development'} mühitində işə salındı.`);
    console.log(`CORS allowed origin(s): ${allowedOrigins.join(', ')}`);
});
