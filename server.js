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

// ===============================================================
// XƏTANI DÜZƏLDƏN ƏSAS SƏTİR (BURA ƏLAVƏ EDİLDİ)
// ===============================================================
// Render, Heroku kimi proksi arxasında olan mühitlərdə IP-ni düzgün oxumaq üçün:
app.set('trust proxy', 1); 

const port = process.env.PORT || 3000;

// ===============================================================
// TƏHLÜKƏSİZLİK QAYDALARI
// ===============================================================

// 1. Helmet istifadə edərək müxtəlif təhlükəsizlik başlıqları əlavə edin
app.use(helmet());

// 2. Sorğu limitləməsi (Rate Limiting)
const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 dəqiqə
    max: 100, // Hər IP üçün 5 dəqiqədə 100 sorğu
    max: 50, // Hər IP üçün 5 dəqiqədə 100 sorğu
    message: 'Çoxlu sorğu göndərmisiniz, zəhmət olmasa bir az gözləyin.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Bütün API sorğularına rate limiting tətbiq et
app.use(apiLimiter);

// ... (kodun qalan hissəsi eyni qalır)

// 3. CORS ayarları
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://photo-to-pdf.ct.ws';
const allowedOrigins = [
    frontendOrigin,
    'http://localhost:5500',
    'http://127.0.0.1:5500',
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

// Müvəqqəti fayllar üçün qovluq
const tempUploadDir = path.join(os.tmpdir(), 'image_to_pdf_uploads');
if (!fs.existsSync(tempUploadDir)) {
    fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(1E9 * Math.random());
        const fileExtension = path.extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${fileExtension}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 25 * 1024 * 1024, 
        files: 10 
    }, 
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Yalnız JPEG, PNG və WebP şəkil fayllarına icazə verilir!'), false);
        }
    }
});

app.post('/convert-to-pdf', upload.array('images'), async (req, res) => {
    let uploadedFilePaths = [];
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Şəkil faylları tapılmadı.' });
        }

        const pdfDoc = await PDFDocument.create();
        for (const file of req.files) {
            uploadedFilePaths.push(file.path);
            let image;
            const imageBuffer = fs.readFileSync(file.path);

            try {
                if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
                    image = await pdfDoc.embedJpg(imageBuffer);
                } else if (file.mimetype === 'image/png') {
                    image = await pdfDoc.embedPng(imageBuffer);
                } else {
                    continue; 
                }
            } catch (embedError) {
                console.error(`Embed xətası: ${file.originalname}`, embedError);
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
            return res.status(400).json({ message: 'Heç bir şəkil çevrilmədi.' });
        }

        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="converted_images.pdf"');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('Xəta:', error);
        res.status(500).json({ message: 'Server xətası baş verdi.' });
    } finally {
        uploadedFilePaths.forEach(filePath => {
            fs.unlink(filePath, (err) => { if (err) console.error(err); });
        });
    }
});

app.listen(port, () => {
    console.log(`Server ${port} portunda işləyir.`);
});
