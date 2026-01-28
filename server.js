const express = require('express');
const multer = require('multer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Fayl sistem əməliyyatları üçün

const app = express();
const port = 3000;

// CORS ayarları (Frontend-dən gələn sorğulara icazə vermək üçün)
app.use(cors({
    origin: 'http://127.0.0.1:5500', // Frontend-inizin işlədiyi URL-i buraya daxil edin
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Müvəqqəti faylları yadda saxlamaq üçün Multer storage ayarı
const storage = multer.memoryStorage(); // Faylları yaddaşda saxlamaq
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Hər fayl üçün 5MB limit
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
    // 'images' - frontend-də FormData.append('images', file) istifadə olunduğu ad
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Şəkil faylları tapılmadı.' });
        }

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica); // Mətn əlavə etmək üçün font

        for (const file of req.files) {
            let image;
            const imageBuffer = file.buffer; // Multer faylı buffer olaraq verir

            // Şəkil tipini yoxla
            if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
                image = await pdfDoc.embedJpg(imageBuffer);
            } else if (file.mimetype === 'image/png') {
                image = await pdfDoc.embedPng(imageBuffer);
            } else {
                // Digər şəkil formatlarını dəstəkləmək istəyirsinizsə, burada əlavə edə bilərsiniz
                console.warn(`Dəstəklənməyən şəkil formatı: ${file.mimetype}. Bu şəkil atlanacaq.`);
                continue; // Bu şəkli atla və növbətiyə keç
            }

            const page = pdfDoc.addPage(); // Hər şəkil üçün yeni səhifə
            const { width, height } = page.getSize();
            const imageDims = image.scaleToFit(width - 50, height - 50); // Şəkli səhifəyə uyğunlaşdır

            page.drawImage(image, {
                x: page.getWidth() / 2 - imageDims.width / 2,
                y: page.getHeight() / 2 - imageDims.height / 2,
                width: imageDims.width,
                height: imageDims.height,
            });

            // Fayl adını hər səhifənin altına əlavə etmək istəyirsinizsə:
            // page.drawText(file.originalname, {
            //     x: 25,
            //     y: 25,
            //     font,
            //     size: 12,
            //     color: rgb(0, 0, 0),
            // });
        }

        if (pdfDoc.getPageCount() === 0) {
            return res.status(400).json({ message: 'Heç bir şəkil dəstəklənən formatda deyil və ya çevrilmədi.' });
        }

        const pdfBytes = await pdfDoc.save();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="converted_images.pdf"');
        res.send(Buffer.from(pdfBytes));

    } catch (error) {
        console.error('PDF çevirmə zamanı xəta:', error);
        res.status(500).json({ message: 'Server xətası: Şəkillər PDF-ə çevrilərkən problem yaşandı.' });
    }
});

// Serveri işə sal
app.listen(port, () => {
    console.log(`Server http://localhost:${port} ünvanında işləyir.`);
});