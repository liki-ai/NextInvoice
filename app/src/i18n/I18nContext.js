import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { translations } from './translations';

const I18nContext = createContext(null);

function getNested(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (params[key] !== undefined ? String(params[key]) : match));
}

export function I18nProvider({ language, children }) {
  const t = useCallback(
    (key, params) => {
      const dict = translations[language] || translations.sq;
      const fallbackDict = translations.sq;
      const value = getNested(dict, key) ?? getNested(fallbackDict, key) ?? key;
      return typeof value === 'string' ? interpolate(value, params) : value;
    },
    [language]
  );

  const value = useMemo(() => ({ t, language }), [t, language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return ctx;
}
