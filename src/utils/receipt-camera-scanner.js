// ==================== RECEIPT CAMERA (jscanify + OpenCV.js from index.html) ====================
// OpenCV must NOT be imported/bundled by Vite — it loads via <script> in index.html.
import jscanify from 'jscanify/client';

const OPENCV_WAIT_MS = 120000;

/**
 * Wait until OpenCV.js (global `cv`) is fully ready.
 * Script is loaded from index.html — we only wait, never inject another copy.
 */
export function loadOpenCv() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV requires a browser'));
  }

  if (window.__opencvReady && window.cv?.Mat) {
    return Promise.resolve(window.cv);
  }
  if (window.__opencvLoadError) {
    return Promise.reject(new Error(window.__opencvLoadError));
  }

  return new Promise((resolve, reject) => {
    const started = Date.now();

    const succeed = () => {
      window.__opencvReady = true;
      resolve(window.cv);
    };

    const fail = (msg) => {
      reject(new Error(msg || window.__opencvLoadError || 'OpenCV failed to load'));
    };

    const onReadyEvent = () => {
      cleanup();
      if (window.cv?.Mat) succeed();
      else fail('OpenCV ready event fired but cv.Mat is missing');
    };

    const poll = () => {
      if (window.__opencvLoadError) {
        cleanup();
        fail(window.__opencvLoadError);
        return;
      }
      if (window.cv?.Mat) {
        cleanup();
        succeed();
        return;
      }
      // Hook runtime init if script already created `cv`
      if (window.cv && typeof window.cv.onRuntimeInitialized !== 'undefined') {
        const prev = window.cv.onRuntimeInitialized;
        window.cv.onRuntimeInitialized = () => {
          try {
            if (typeof prev === 'function') prev();
          } catch (_) { /* ignore */ }
          cleanup();
          succeed();
        };
      }
      if (Date.now() - started > OPENCV_WAIT_MS) {
        cleanup();
        fail('OpenCV is taking too long (over 2 minutes). Refresh the page and try again.');
        return;
      }
      timer = setTimeout(poll, 200);
    };

    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('opencv-ready', onReadyEvent);
    };

    window.addEventListener('opencv-ready', onReadyEvent);
    // Prefer waiting until page scripts finished at least once
    if (document.readyState === 'complete') {
      poll();
    } else {
      window.addEventListener('load', () => poll(), { once: true });
      // Also start a soft poll in case load already progressed
      timer = setTimeout(poll, 100);
    }
  });
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
  return new Promise((resolve) => {
    // Ensure we don't touch jscanify until window/OpenCV are ready
    const start = () => {
      openReceiptCameraScannerInner(resolve).catch((err) => {
        console.error(err);
        resolve(null);
      });
    };

    if (document.readyState === 'complete') {
      start();
    } else {
      window.addEventListener('load', start, { once: true });
    }
  });
}

async function openReceiptCameraScannerInner(resolve) {
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
      <div id="receiptScanLoader" class="receipt-scan-loader">
        <div class="receipt-scan-spinner" aria-hidden="true"></div>
        <p class="form-hint" id="receiptScanStatus">Loading scanner engine (OpenCV)…</p>
        <p class="form-hint">This can take a minute the first time. Please wait.</p>
      </div>
      <div class="receipt-scan-stage" style="display:none;">
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
  const loader = modal.querySelector('#receiptScanLoader');
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
    statusEl.textContent = 'Waiting for OpenCV…';
    await loadOpenCv();
    scanner = new jscanify();

    statusEl.textContent = 'Starting camera… Allow camera access if asked.';
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
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

    // Throttle highlight loop (~8 fps) so OpenCV does not freeze the UI
    let lastTick = 0;
    const tick = (ts) => {
      if (!running) return;
      if (ts - lastTick > 120) {
        lastTick = ts;
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
            console.warn('jscanify frame:', err);
            highlightCtx.drawImage(sourceCanvas, 0, 0);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    loader.style.display = 'none';
    stage.style.display = '';
    statusEl.textContent = 'Align the receipt inside the orange outline, then tap Capture.';
    // Keep status visible above stage
    const statusClone = document.createElement('p');
    statusClone.className = 'form-hint';
    statusClone.id = 'receiptScanLiveStatus';
    statusClone.textContent = statusEl.textContent;
    stage.parentElement.insertBefore(statusClone, stage);
    const liveStatus = statusClone;

    captureBtn.disabled = false;

    captureBtn.onclick = async () => {
      captureBtn.disabled = true;
      liveStatus.textContent = 'Cropping & straightening…';
      try {
        sourceCtx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);

        const paperW = 1000;
        const paperH = Math.round(paperW * 1.4);
        let extracted = scanner.extractPaper(sourceCanvas, paperW, paperH);

        if (!extracted) {
          extracted = document.createElement('canvas');
          extracted.width = sourceCanvas.width;
          extracted.height = sourceCanvas.height;
          extracted.getContext('2d').drawImage(sourceCanvas, 0, 0);
          liveStatus.textContent = 'No clear edges found — using full photo. You can retake.';
        } else {
          liveStatus.textContent = 'Preview your cropped receipt.';
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
        liveStatus.textContent = err.message || 'Capture failed. Try again.';
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
      liveStatus.textContent = 'Align the receipt, then tap Capture.';
      running = true;
      rafId = requestAnimationFrame(tick);
    };

    confirmBtn.onclick = () => {
      if (!capturedFile) {
        liveStatus.textContent = 'Nothing captured yet.';
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
    loader.style.display = '';
    captureBtn.disabled = true;
  }
}
