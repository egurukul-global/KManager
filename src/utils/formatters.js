import { getCurrentLanguage } from '../i18n.js';

/**
 * Format a number as currency based on language and currency code.
 * Example: formatCurrency(1234.56, 'USD', 'en') -> $1,234.56
 */
export function formatCurrency(value, currencyCode, language = getCurrentLanguage()) {
  if (value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';

  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: currencyCode || 'USD',
  }).format(num);
}

/**
 * Format a plain number according to language rules.
 * Example: formatNumber(1234.56, 'xx') -> 1,234.56 (or locale equivalent)
 */
export function formatNumber(value, language = getCurrentLanguage()) {
  if (value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';

  return new Intl.NumberFormat(language).format(num);
}

/**
 * Format a date according to language rules.
 * Example: formatDate('2023-10-01', 'en') -> 10/1/2023
 */
export function formatDate(value, language = getCurrentLanguage()) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
}
