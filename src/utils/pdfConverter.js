let pdfjsPromise = null;

export async function loadPdfJS() {
  if (window.pdfjsLib) return window.pdfjsLib;
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = (err) => {
      pdfjsPromise = null;
      reject(err);
    };
    document.head.appendChild(script);
  });

  return pdfjsPromise;
}

/**
 * Loads a PDF from an ArrayBuffer and renders each page to base64 JPEGs.
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {Promise<string[]>} List of base64 image strings
 */
export async function convertPdfToImages(arrayBuffer) {
  const pdfjs = await loadPdfJS();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const imageUrls = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    imageUrls.push(canvas.toDataURL('image/jpeg', 0.8));
  }

  return imageUrls;
}
