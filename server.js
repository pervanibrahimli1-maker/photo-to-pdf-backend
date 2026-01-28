const express = require('express');
const multer = require('multer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Fayl sistem əməliyyatları üçün
const os = require('os'); // Əməliyyat sistemi üçün (müvəqqəti qovluq yaratmaq üçün)

const app = express();
const port = process.env.PORT || 3000;

// InfinityFree-dəki frontend domeniniz (ÖZ DOMENİNİZİ BURAYA DAXİL EDİN!)
const frontendOrigin = 'https://photo-to-pdf.ct.ws'; // Məsələn: 'http://example.great-site.net'
// Və ya inkişaf üçün: 'http://127.0.0.1:5500', 'http://localhost:5500'

// CORS ayarları
app.use(cors({
    origin: [frontendOrigin, 'https://photo-to-pdf.ct.ws', 'http://localhost:5500'], // Yerli inkişaf və InfinityFree domeninizi əlavə edin
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Müvəqqəti fayllar üçün qovluq
const tempUploadDir = path.join(os.tmpdir(), 'uploads');
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
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 * 10 }, // Hər fayl üçün 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Yalnız şəkil fayllarına icazə verilir!'), false);
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
            uploadedFilePaths.push(file.path); // Fayl yolunu qeyd et
            
            let image;
            const imageBuffer = fs.readFileSync(file.path); // Faylı oxuyaraq buffer al

            try {
                if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
                    image = await pdfDoc.embedJpg(imageBuffer);
                } else if (file.mimetype === 'image/png') {
                    image = await pdfDoc.embedPng(imageBuffer);
                } else {
                    console.warn(`Dəstəklənməyən şəkil formatı: ${file.mimetype}. Bu şəkil atlanacaq.`);
                    continue;
                }
            } catch (embedError) {
                console.error(`Şəkil embed edilərkən xəta: ${file.originalname}`, embedError);
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
        // Çevrilmə bitdikdən və ya xəta baş verdikdən sonra yüklənmiş faylları sil
        uploadedFilePaths.forEach(filePath => {
            fs.unlink(filePath, (err) => {
                if (err) console.error(`Müvəqqəti fayl silinərkən xəta: ${filePath}`, err);
                // else console.log(`Müvəqqəti fayl silindi: ${filePath}`);
            });
        });
    }
});

// Serveri işə sal
app.listen(port, () => {
    console.log(`Server https://photo-to-pdf.ct.ws/${port} ünvanında işləyir.`);
});

