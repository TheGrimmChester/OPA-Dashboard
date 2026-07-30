import React, { createContext, useContext, useMemo, useState } from 'react'

// Wave 27-4: lightweight i18n — extract strings early; translations can land later.

const MESSAGES = {
  en: {
    'diag.title': 'Diagnostics',
    'diag.subtitle': 'Suspect commits · heap dominators · threads · locks',
    'diag.commits': 'Suspect commits',
    'diag.heap': 'Heap',
    'diag.threads': 'Threads',
    'diag.locks': 'Locks',
    'diag.service': 'Service',
    'diag.release': 'Release',
    'diag.author': 'Author',
    'diag.score': 'Score',
    'diag.evidence': 'Evidence',
    'diag.when': 'When',
    'diag.result': 'Result',
    'diag.recordRelease': 'Record release',
    'diag.releases': 'Recent releases',
    'diag.emptyCommits': 'No release markers in window — POST /api/releases',
    'diag.emptyHeap': 'No heap snapshots — POST /v1/heap',
    'diag.emptyThreads': 'No thread samples — POST /v1/threads',
    'diag.emptyLocks': 'No lock contention — POST /v1/locks',
    'nav.locale': 'Language',
  },
  fr: {
    'diag.title': 'Diagnostics',
    'diag.subtitle': 'Commits suspects · tas · fils · verrous',
    'diag.commits': 'Commits suspects',
    'diag.heap': 'Tas',
    'diag.threads': 'Fils',
    'diag.locks': 'Verrous',
    'diag.service': 'Service',
    'diag.release': 'Version',
    'diag.author': 'Auteur',
    'diag.score': 'Score',
    'diag.evidence': 'Preuves',
    'diag.when': 'Quand',
    'diag.result': 'Résultat',
    'diag.recordRelease': 'Enregistrer une version',
    'diag.releases': 'Versions récentes',
    'diag.emptyCommits': 'Aucun marqueur de version — POST /api/releases',
    'diag.emptyHeap': 'Aucun instantané de tas — POST /v1/heap',
    'diag.emptyThreads': 'Aucun échantillon de fil — POST /v1/threads',
    'diag.emptyLocks': 'Aucune contention — POST /v1/locks',
    'nav.locale': 'Langue',
  },
}

const I18nContext = createContext({ locale: 'en', setLocale: () => {}, t: (k) => k })

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => localStorage.getItem('opa_locale') || 'en')
  const value = useMemo(() => {
    const dict = MESSAGES[locale] || MESSAGES.en
    return {
      locale,
      setLocale: (l) => {
        localStorage.setItem('opa_locale', l)
        setLocale(l)
      },
      t: (key) => dict[key] || MESSAGES.en[key] || key,
      locales: Object.keys(MESSAGES),
    }
  }, [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

export function LocaleSwitcher() {
  const { locale, setLocale, locales, t } = useI18n()
  return (
    <label className="opa-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      {t('nav.locale')}
      <select className="opa-input" value={locale} onChange={(e) => setLocale(e.target.value)} style={{ padding: '2px 6px' }}>
        {locales.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </label>
  )
}
