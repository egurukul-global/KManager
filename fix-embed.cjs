const fs = require('fs');
let code = fs.readFileSync('src/pages/expense-reports.js', 'utf8');

if (!code.includes('convertPdfToImages')) {
  code = code.replace(/import \{ resolveReceiptViewUrl, isExternalReceiptUrl, uploadReportPdf \} from '\.\.\/utils\/upload\.js';/, 
    "import { resolveReceiptViewUrl, isExternalReceiptUrl, uploadReportPdf } from '../utils/upload.js';\nimport { convertPdfToImages } from '../utils/pdfConverter.js';");
}

const targetStr = `return { ...exp, receipt_url: resolvedUrls[0], _allReceipts: resolvedUrls };`;

const replacementStr = `
          const receipt_images = [];
          for (const rUrl of resolvedUrls) {
            try {
              const res = await fetch(rUrl);
              const blob = await res.blob();
              if (blob.type === 'application/pdf') {
                const arrBuf = await blob.arrayBuffer();
                const pdfImages = await convertPdfToImages(arrBuf);
                receipt_images.push(...pdfImages);
              } else if (blob.type.startsWith('image/')) {
                const b64 = await new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
                receipt_images.push(b64);
              }
            } catch (err) {
              console.error('Failed to process receipt image for PDF embed', err);
            }
          }
          return { ...exp, receipt_url: resolvedUrls[0], _allReceipts: resolvedUrls, receipt_images };`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/expense-reports.js', code, 'utf8');
  console.log('Fixed receipt images embed');
} else {
  console.log('Target string not found');
}
