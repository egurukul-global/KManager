const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard.js', 'utf8');

const regex = /if \(submissionCard\) \{[\s\S]*?\}\s*if \(nextEl\) \{[\s\S]*?nextEl\.title = '';\s*\}/;

const newLogic = `
    if (nextEl) {
      if (!currentEntry) {
        nextEl.textContent = '—';
        nextEl.title = 'No calendar configured';
        if (submissionLabel) submissionLabel.textContent = 'Next Budget Submission';
      } else if (hasMonthlyForCurrent) {
        nextEl.textContent = formatDisplayDate(currentEntry.submission_deadline);
        nextEl.title = 'Submitted';
        if (submissionLabel) submissionLabel.textContent = 'Next Budget Submission';
        if (submissionCard) {
          submissionCard.style.border = '2px solid var(--success)';
          submissionCard.style.boxShadow = '0 0 10px rgba(34,197,94,0.3)';
        }
      } else {
        nextEl.textContent = formatDisplayDate(currentEntry.submission_deadline);
        nextEl.title = 'Due soon';
        if (submissionLabel) submissionLabel.textContent = 'Budget Due';
        
        if (submissionCard) {
          if (submissionStatus.days < 0) {
            submissionCard.style.border = '2px solid var(--error)';
            submissionCard.style.boxShadow = '0 0 10px rgba(239,68,68,0.3)';
          } else if (submissionStatus.days <= 10) {
            submissionCard.style.border = '2px solid var(--warning)';
            submissionCard.style.boxShadow = '0 0 10px rgba(245,158,11,0.3)';
          } else {
            submissionCard.style.border = '1px solid var(--border)';
            submissionCard.style.boxShadow = 'var(--shadow)';
          }
        }
      }
    }
`;

code = code.replace(regex, newLogic);
fs.writeFileSync('src/pages/dashboard.js', code);
