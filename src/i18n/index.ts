import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import fr from './locales/fr.json';

const deviceLocale = getLocales()[0]?.languageCode ?? 'en';

i18next
  .use(initReactI18next)
  .init({
    lng:               deviceLocale,
    fallbackLng:       'en',
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    interpolation: {
      escapeValue: false, // React already escapes output
    },
    compatibilityJSON: 'v4',
  });

export default i18next;
