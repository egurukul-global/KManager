import i18next from 'i18next';
import enCommon from './locales/en/common.json';
import xxCommon from './locales/xx/common.json';

const LANGUAGE_KEY = 'oneKailasa_language';
const DEFAULT_LANGUAGE = 'en';

export async function initI18n() {
  const savedLang = localStorage.getItem(LANGUAGE_KEY) || DEFAULT_LANGUAGE;

  await i18next.init({
    lng: savedLang,
    fallbackLng: DEFAULT_LANGUAGE,
    resources: {
      en: {
        common: enCommon
      },
      xx: {
        common: xxCommon
      }
    },
    interpolation: {
      escapeValue: false // Not needed for vanilla JS templates if sanitized elsewhere, but good to know
    }
  });

  setDocumentDirection(savedLang);
}

export function t(key, options) {
  return i18next.t(key, options);
}

export function getCurrentLanguage() {
  return i18next.language || DEFAULT_LANGUAGE;
}

export async function setLanguage(language) {
  await i18next.changeLanguage(language);
  localStorage.setItem(LANGUAGE_KEY, language);
  setDocumentDirection(language);
}

export function isRTL(language) {
  const rtlLangs = ['ar', 'he', 'fa', 'ur'];
  return rtlLangs.includes(language);
}

export function setDocumentDirection(language) {
  const dir = isRTL(language) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
}
