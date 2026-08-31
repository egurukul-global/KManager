import { t, setLanguage, getCurrentLanguage } from './i18n.js';
import { formatCurrency, formatNumber, formatDate } from './utils/formatters.js';

window.runI18nTests = async function() {
  console.log('--- STARTING I18N TESTS ---');
  
  // 1. Check current language
  console.log('1. Current Language:', getCurrentLanguage());
  
  // 2. Test English translation
  console.log('2. t("common.save") in English:', t('common.save'));
  
  // 3. Test language switch to 'xx'
  await setLanguage('xx');
  console.log('3. Switched to XX. Current Language:', getCurrentLanguage());
  console.log('   t("common.save") in XX:', t('common.save'));
  
  // 4. Test missing key fallback (should return key)
  console.log('4. Missing key "common.missing":', t('common.missing'));
  
  // 5. Test formatters
  console.log('5. formatCurrency(1234.56, "USD", "en"):', formatCurrency(1234.56, 'USD', 'en'));
  console.log('   formatCurrency(1234.56, "USD", "xx"):', formatCurrency(1234.56, 'USD', 'xx'));
  console.log('   formatDate(new Date(), "en"):', formatDate(new Date(), 'en'));
  
  // 6. Reset to English
  await setLanguage('en');
  console.log('6. Restored to English.');
  
  console.log('--- I18N TESTS COMPLETE ---');
};
