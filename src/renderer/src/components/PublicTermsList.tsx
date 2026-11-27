import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTip } from './InfoTip';
import { groupName, hint, panelStyle } from './fieldText';
import { MAX_PUBLIC_TERMS, PUBLIC_TERM_MAX, cleanPublicTerms } from '@shared/publicTerms';

/**
 * Settings, Research & privacy, Always allowed (owner, 2026-11-20;
 * shared/publicTerms.ts): what the owner says is the business's own and
 * public, which the privacy check keeps as written. One field per entry, a
 * remove button on each. Company profile's public details are allowed too
 * (owner, 2026-11-26) and shown under the list, changed in Company profile.
 * Staged for the footer Save like the classes above it.
 */
export function PublicTermsList({ value, fromProfile, onChange }: {
  value: string[] | undefined;
  /** Company profile's public details not on the list (publicSuggestions). */
  fromProfile: string[];
  onChange: (terms: string[]) => void;
}) {
  const { t } = useTranslation();
  const saved = cleanPublicTerms(value);
  // Rows being edited, an empty one included, so a new row stays while typed in.
  const [rows, setRows] = useState<string[]>(() => (saved.length ? saved : ['']));
  useEffect(() => {
    if (rows.filter((r) => r.trim()).join('\n') !== saved.join('\n')) setRows(saved.length ? saved : ['']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.join('\n')]);

  const save = (next: string[]): void => { setRows(next); onChange(cleanPublicTerms(next)); };
  const full = saved.length >= MAX_PUBLIC_TERMS;

  return (
    <div style={{ ...panelStyle, gap: 0 }}>
      <h3 style={{ ...groupName, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {t('research.publicTitle')}
        <InfoTip label={t('research.publicTitle')} text={t('research.publicTip')} />
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((term, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              value={term}
              maxLength={PUBLIC_TERM_MAX}
              onChange={(e) => save(rows.map((r, j) => (j === i ? e.target.value : r)))}
              placeholder={t('research.publicPlaceholder')}
              aria-label={t('research.publicAria', { n: i + 1 })}
              autoComplete="off"
              spellCheck={false}
              className="cth-input"
              style={{ flex: 1, minWidth: 0, height: 32, padding: '0 10px', border: 'none', fontSize: 13, background: 'var(--cth-card)' }}
            />
            {(rows.length > 1 || term) && (
              <button type="button" onClick={() => save(rows.length > 1 ? rows.filter((_, j) => j !== i) : [''])}
                aria-label={t('research.publicRemove', { term: term || i + 1 })} title={t('research.publicRemoveShort')} style={iconButton}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {full ? (
          <span style={hint}>{t('research.publicMax', { count: MAX_PUBLIC_TERMS })}</span>
        ) : (
          <>
            <button type="button" onClick={() => setRows([...rows.filter((r) => r.trim()), ''])} style={addButton}>
              <span aria-hidden="true">+</span> {t('research.publicAdd')}
            </button>
          </>
        )}
      </div>
      {fromProfile.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ ...hint, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {t('research.publicFromProfile')}
            <InfoTip label={t('research.publicFromProfile')} text={t('research.publicFromProfileTip')} />
          </span>
          <ul aria-label={t('research.publicFromProfile')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'contents' }}>
            {fromProfile.map((s) => <li key={s} style={chip} title={s}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

const iconButton: CSSProperties = {
  width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 'var(--cth-r-md)',
  background: 'transparent', color: 'var(--cth-ink-3)', cursor: 'pointer'
};
const addButton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', border: 'none', borderRadius: 'var(--cth-r-md)',
  background: 'transparent', color: 'var(--cth-ink-2)', cursor: 'pointer', fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 500
};
const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: 24, maxWidth: 260, padding: '0 10px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', color: 'var(--cth-ink-2)', fontFamily: 'var(--cth-font-ui)', fontSize: 12,
  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
};
