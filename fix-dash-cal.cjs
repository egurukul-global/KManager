const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard.js', 'utf8');

const regex = /\/\/ Expenses filtering based on timeline[\s\S]*?const totalExpUsd/;
const replacement = `// Expenses filtering based on timeline
    const timeline = localStorage.getItem('kmanager_dash_timeline') || 'all';
    const savedPeriod = localStorage.getItem('kmanager_dash_period_date');
    let filteredExpenses = expenses;
    let expLabel = "All time";
    
    if (timeline === 'current_period' && calendarEntries.length > 0) {
      // Find the active/current period (closest future date or exactly today)
      const today = new Date().toISOString().split('T')[0];
      const futurePeriods = calendarEntries.filter(c => c.budget_period_date >= today).sort((a,b) => a.budget_period_date.localeCompare(b.budget_period_date));
      const current = futurePeriods[0] || calendarEntries[calendarEntries.length - 1]; // fallback to latest if all past
      if (current) {
        filteredExpenses = expenses.filter(e => e.date && e.date >= current.budget_period_date);
        expLabel = current.name || current.budget_period_date;
      }
    } else if (timeline === 'specific_period' && savedPeriod) {
      filteredExpenses = expenses.filter(e => e.date && e.date >= savedPeriod);
      const matched = calendarEntries.find(c => c.budget_period_date === savedPeriod);
      expLabel = matched ? matched.name : savedPeriod;
    }
    
    const totalExpUsd`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/dashboard.js', code);
