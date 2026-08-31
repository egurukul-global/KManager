// src/utils/exportCsv.js

/**
 * Downloads a CSV string as a file
 */
export function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Converts an array of JS objects to a CSV string.
 * @param {Array} data - Array of objects.
 * @param {Array} headers - Optional array of strings for column headers (must match object keys).
 */
export function convertArrayOfObjectsToCSV(data, headers = null) {
  if (!data || !data.length) return '';
  const headerKeys = headers || Object.keys(data[0]);
  const csvRows = [];
  
  // Add Header Row
  csvRows.push(headerKeys.join(','));
  
  // Add Data Rows
  for (const row of data) {
    const values = headerKeys.map(header => {
      let val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      // Escape double quotes and enclose in double quotes
      val = val.replace(/"/g, '""');
      return `"${val}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}
