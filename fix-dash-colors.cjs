const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard.js', 'utf8');

const oldLogic = `    if (submissionCard) {
      submissionCard.classList.remove('stat-card--gold', 'stat-card--success', 'stat-card--danger');
    }

    if (nextEl) {
      if (!currentEntry) {
        nextEl.textContent = '—';
        nextEl.title = 'No calendar configured';
        if (submissionLabel) submissionLabel.textContent = 'Next Budget Submission';
        if (submissionCard) submissionCard.classList.add('stat-card--gold');
      } else if (hasMonthlyForCurrent) {
        nextEl.textContent = formatDisplayDate(currentEntry.submission_deadline);
        nextEl.title = \`Submitted for \${formatDisplayDate(currentEntry.budget_period_date)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Submitted — \${formatDisplayDate(currentEntry.budget_period_date)}\`;
        }
        if (submissionCard) submissionCard.classList.add('stat-card--success');
      } else if (submissionStatus.isOverdue) {
        const delay = Math.abs(submissionStatus.days);
        nextEl.textContent = delay === 1 ? 'Delayed 1 day' : \`Delayed \${delay} days\`;
        nextEl.title = \`Was due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        }
        if (submissionCard) submissionCard.classList.add('stat-card--danger');
      } else if (submissionStatus.days === 0) {
        nextEl.textContent = 'Due today';
        nextEl.title = \`Submit by \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        }
        if (submissionCard) submissionCard.classList.add('stat-card--gold');
      } else {
        nextEl.textContent = \`In \${submissionStatus.days} days\`;
        nextEl.title = \`Submit by \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        }
      }
    }`;

const newLogic = `    if (submissionCard) {
      submissionCard.style.border = '1px solid var(--border)'; // reset
      submissionCard.style.boxShadow = 'var(--shadow)';
    }

    if (nextEl) {
      if (!currentEntry) {
        nextEl.textContent = '—';
        nextEl.title = 'No calendar configured';
        if (submissionLabel) submissionLabel.textContent = 'Next Budget Submission';
      } else if (hasMonthlyForCurrent) {
        nextEl.textContent = formatDisplayDate(currentEntry.submission_deadline);
        nextEl.title = \`Submitted for \${formatDisplayDate(currentEntry.budget_period_date)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Submitted — \${formatDisplayDate(currentEntry.budget_period_date)}\`;
        }
        if (submissionCard) {
          submissionCard.style.border = '2px solid var(--success)';
          submissionCard.style.boxShadow = '0 0 10px rgba(16,185,129,0.2)';
        }
      } else if (submissionStatus.isOverdue) {
        const delay = Math.abs(submissionStatus.days);
        nextEl.textContent = delay === 1 ? 'Delayed 1 day' : \`Delayed \${delay} days\`;
        nextEl.title = \`Was due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        }
        if (submissionCard) {
          submissionCard.style.border = '2px solid var(--error)';
          submissionCard.style.boxShadow = '0 0 10px rgba(239,68,68,0.2)';
        }
      } else if (submissionStatus.days <= 10) {
        nextEl.textContent = submissionStatus.days === 0 ? 'Due today' : \`In \${submissionStatus.days} days\`;
        nextEl.title = \`Submit by \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        }
        if (submissionCard) {
          submissionCard.style.border = '2px solid var(--warning)';
          submissionCard.style.boxShadow = '0 0 10px rgba(245,158,11,0.2)';
        }
      } else {
        nextEl.textContent = \`In \${submissionStatus.days} days\`;
        nextEl.title = \`Submit by \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        if (submissionLabel) {
          submissionLabel.textContent = \`Due \${formatDisplayDate(currentEntry.submission_deadline)}\`;
        }
      }
    }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('src/pages/dashboard.js', code);
