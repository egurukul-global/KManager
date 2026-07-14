// ==================== RECEIPT CAMERA (jscanify + OpenCV.js) ====================
import jscanify from 'jscanify/client';

const OPENCV_CDN = 'https://docs.opencv.org/4.7.0/opencv.js';

let opencvLoadPromise = null;

/**
 * Load OpenCV.js from CDN once (async). jscanify needs global `cv`.
 */
export function loadOpenCv() {
  if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }
  if (opencvLoadPromise) return opencvLoadPromise;

  opencvLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-opencv="1"]');
    if (existing && window.cv) {
      if (window.cv.Mat) {
        resolve(window.cv);
        return;
      }
      window.cv.onRuntimeInitialized = () => resolve(window.cv);
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_CDN;
    script.async = true;
    script.dataset.opencv = '1';
    script.onerror = () => {
      opencvLoadPromise = null;
      reject(new Error('Failed to load OpenCV.js. Check your network connection.'));
    };
    script.onload = () => {
      if (!window.cv) {
        opencvLoadPromise = null;
        reject(new Error('OpenCV.js loaded but cv is missing'));
        return;
      }
      if (window.cv.Mat) {
        resolve(window.cv);
        return;
      }
      window.cv.onRuntimeInitialized = () => resolve(window.cv);
    };
    document.head.appendChild(script);
  });

  return opencvLoadPromise;
}

/**
 * Convert a canvas to a JPEG File for uploadReceipt().
 */
export function canvasToReceiptFile(canvas, name = `receipt-${Date.now()}.jpg`) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not create image from camera'));
          return;
        }
        resolve(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  });
}

/**
 * Open a live camera scanner modal with jscanify edge highlight.
 * Resolves with a cropped/straightened File, or null if cancelled.
 *
 * @returns {Promise<File|null>}
 */
export function openReceiptCameraScanner() {
  return new Promise(async (resolve) => {
    let stream = null;
    let rafId = 0;
    let running = true;
    let scanner = null;

    const cleanup = () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      modal.remove();
    };

    const finish = (file) => {
      cleanup();
      resolve(file || null);
    };

    const modal = document.createElement('div');
    modal.className = 'modal active receipt-scan-modal';
    modal.innerHTML = `
      <div class="modal-content receipt-scan-modal-content">
        <button type="button" class="close-modal" data-scan-cancel>&times;</button>
        <h2>Scan receipt</h2>
        <p class="form-hint" id="receiptScanStatus">Loading camera…</p>
        <div class="receipt-scan-stage">
          <video id="receiptScanVideo" playsinline muted autoplay style="display:none;"></video>
          <canvas id="receiptScanSource" style="display:none;"></canvas>
          <canvas id="receiptScanHighlight" class="receipt-scan-highlight"></canvas>
        </div>
        <div id="receiptScanPreviewWrap" class="receipt-scan-preview-wrap" style="display:none;">
          <p class="form-hint">Cropped preview — confirm to continue</p>
          <img id="receiptScanPreviewImg" alt="Cropped receipt" class="receipt-scan-preview-img">
        </div>
        <div class="btn-group" style="margin-top:14px;flex-wrap:wrap;">
          <button type="button" class="success" id="receiptScanCaptureBtn" disabled>Capture</button>
          <button type="button" class="primary" id="receiptScanConfirmBtn" style="display:none;">Use this photo</button>
          <button type="button" class="secondary" id="receiptScanRetakeBtn" style="display:none;">Retake</button>
          <button type="button" class="secondary" data-scan-cancel>Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const statusEl = modal.querySelector('#receiptScanStatus');
    const video = modal.querySelector('#receiptScanVideo');
    const sourceCanvas = modal.querySelector('#receiptScanSource');
    const highlightCanvas = modal.querySelector('#receiptScanHighlight');
    const captureBtn = modal.querySelector('#receiptScanCaptureBtn');
    const confirmBtn = modal.querySelector('#receiptScanConfirmBtn');
    const retakeBtn = modal.querySelector('#receiptScanRetakeBtn');
    const previewWrap = modal.querySelector('#receiptScanPreviewWrap');
    const previewImg = modal.querySelector('#receiptScanPreviewImg');
    const stage = modal.querySelector('.receipt-scan-stage');

    let capturedFile = null;

    modal.querySelectorAll('[data-scan-cancel]').forEach(btn => {
      btn.onclick = () => finish(null);
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) finish(null);
    });

    try {
      statusEl.textContent = 'Loading scanner (OpenCV)…';
      await loadOpenCv();
      scanner = new jscanify();

      statusEl.textContent = 'Starting camera… Allow camera access if asked.';
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      video.srcObject = stream;
      await video.play();

      const syncCanvasSize = () => {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        sourceCanvas.width = w;
        sourceCanvas.height = h;
        highlightCanvas.width = w;
        highlightCanvas.height = h;
      };
      if (video.readyState >= 2) syncCanvasSize();
      else video.onloadedmetadata = syncCanvasSize;

      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
      const highlightCtx = highlightCanvas.getContext('2d');

      const tick = () => {
        if (!running) return;
        if (video.readyState >= 2 && sourceCanvas.width) {
          try {
            sourceCtx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);
            const highlighted = scanner.highlightPaper(sourceCanvas, {
              color: '#ff8c00',
              thickness: 6
            });
            highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
            highlightCtx.drawImage(highlighted, 0, 0);
          } catch (err) {
            // Occasional OpenCV frame errors — keep looping
            console.warn('jscanify frame:', err);
            highlightCtx.drawImage(sourceCanvas, 0, 0);
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      statusEl.textContent = 'Align the receipt inside the orange outline, then tap Capture.';
      captureBtn.disabled = false;

      captureBtn.onclick = async () => {
        captureBtn.disabled = true;
        statusEl.textContent = 'Cropping & straightening…';
        try {
          // Freeze current frame for extract
          sourceCtx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);

          let paperW = 1000;
          let paperH = Math.round(paperW * 1.4);
          let extracted = scanner.extractPaper(sourceCanvas, paperW, paperH);

          // If edges not found, fall back to full frame
          if (!extracted) {
            extracted = document.createElement('canvas');
            extracted.width = sourceCanvas.width;
            extracted.height = sourceCanvas.height;
            extracted.getContext('2d').drawImage(sourceCanvas, 0, 0);
            statusEl.textContent = 'No clear edges found — using full photo. You can retake.';
          } else {
            statusEl.textContent = 'Preview your cropped receipt.';
          }

          capturedFile = await canvasToReceiptFile(extracted);
          previewImg.src = URL.createObjectURL(capturedFile);
          stage.style.display = 'none';
          previewWrap.style.display = '';
          captureBtn.style.display = 'none';
          confirmBtn.style.display = '';
          retakeBtn.style.display = '';
          running = false;
          if (rafId) cancelAnimationFrame(rafId);
        } catch (err) {
          console.error(err);
          statusEl.textContent = err.message || 'Capture failed. Try again.';
          captureBtn.disabled = false;
        }
      };

      retakeBtn.onclick = () => {
        capturedFile = null;
        previewWrap.style.display = 'none';
        stage.style.display = '';
        captureBtn.style.display = '';
        confirmBtn.style.display = 'none';
        retakeBtn.style.display = 'none';
        captureBtn.disabled = false;
        statusEl.textContent = 'Align the receipt, then tap Capture.';
        running = true;
        rafId = requestAnimationFrame(tick);
      };

      confirmBtn.onclick = () => {
        if (!capturedFile) {
          statusEl.textContent = 'Nothing captured yet.';
          return;
        }
        finish(capturedFile);
      };
    } catch (err) {
      console.error('receipt camera:', err);
      let msg = err?.message || 'Could not open camera scanner';
      if (err?.name === 'NotAllowedError' || /permission|denied/i.test(msg)) {
        msg = 'Camera permission denied. Allow camera access in your browser settings, then try again.';
      } else if (err?.name === 'NotFoundError') {
        msg = 'No camera found on this device.';
      } else if (!window.isSecureContext && location.hostname !== 'localhost') {
        msg = 'Camera requires HTTPS (or localhost).';
      }
      statusEl.textContent = msg;
      captureBtn.disabled = true;
    }
  });
}
