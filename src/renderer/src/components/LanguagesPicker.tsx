import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_LANGUAGES, joinLanguages, languageNames, splitLanguages } from '@shared/languages';

/**
 * The languages the business serves customers in (owner, 2026-11-19: picked
 * from a list, never typed). One chip per language with a remove button, then
 * a list of languages (named in the app's language) to add one from. Saved as
 * the one line agents read, "English, Spanish" (shared/languages.ts). A saved
 * language that is not on the list (typed before, or written by an agent)
 * still shows as a chip and can be removed.
 */
export function LanguagesPicker({ value, onChange, inputClassName, inputStyle }: {
  value: string | undefined;
  onChange: (languages: string | undefined) => void;
  inputClassName?: string;
  inputStyle?: CSSProperties;
}) {
  const { t, i18n } = useTranslation();
  const chosen = splitLanguages(value);
  const names = useMemo(() => languageNames(i18n.language), [i18n.language]);
  const taken = new Set(chosen.map((c) => c.toLowerCase()));
  const open = names.filter((n) => !taken.has(n.toLowerCase()));

  const save = (next: string[]): void => onChange(joinLanguages(next));
  const full = chosen.length >= MAX_LANGUAGES;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {chosen.length > 0 && (
        <ul aria-label={t('companyProfile.languagesChosen')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
          {chosen.map((lang, i) => (
            <li key={lang} style={chip}>
              <span>{lang}</span>
              <button type="button" onClick={() => save(chosen.filter((_, j) => j !== i))} aria-label={t('companyProfile.languagesRemove', { language: lang })}
                title={t('companyProfile.socialRemoveShort')} style={chipX}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <span style={{ fontSize: 12, color: 'var(--cth-ink-3)' }}>{t('companyProfile.languagesMax', { count: MAX_LANGUAGES })}</span>
      ) : (
        // Always shows its prompt: picking adds a chip and the list starts over.
        <select
          value=""
          onChange={(e) => { if (e.target.value) save([...chosen, e.target.value]); }}
          aria-label={t('companyProfile.languagesAdd')}
          className={inputClassName}
          style={{ ...inputStyle, maxWidth: 320 }}
        >
          <option value="">{chosen.length ? t('companyProfile.languagesMore') : t('companyProfile.languagesAdd')}</option>
          {open.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
    </div>
  );
}

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 4px 0 12px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 13, fontWeight: 500, color: 'var(--cth-ink)'
};
const chipX: CSSProperties = {
  width: 22, height: 22, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 'var(--cth-r-pill)',
  background: 'transparent', color: 'var(--cth-ink-3)', cursor: 'pointer'
};
