const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const targetHtml = `    <div class="card" id="teamBucketsCard">`;
const replacementHtml = `
    <div class="card" id="orgBucketsCard" style="display:none; border-left: 4px solid #ea580c;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
        <h2>🌍 Org-Level Buckets</h2>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="addOrgBucketBtn" class="success" onclick="window.openOrgBucketModal()" style="display: none;">+ Add Org Bucket</button>
        </div>
      </div>
      <p style="color: #666; margin-bottom: 20px;">
        These buckets are organization-wide and managed by FIH. You can assign users (FIP, FIN, etc.) to allow them to transfer funds from these buckets.
      </p>
      <div id="orgBucketsList">Loading org buckets...</div>
    </div>

    <div class="card" id="teamBucketsCard">`;

code = code.replace(targetHtml, replacementHtml);
fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
