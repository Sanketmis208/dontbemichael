import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_SOCIAL } from '@shared/companyProfile';
import { looksLikeLink, socialSite } from '@shared/socialSite';

/**
 * The company's social media links (owner, 2026-11-19: a text box with one
 * link per line was not friendly): one field per link, the site it is on named
 * beside it, a remove button on each, and Add a link up to MAX_SOCIAL. Empty
 * rows are never saved.
 */
export function SocialLinks({ value, onChange, inputClassName, inputStyle }: {
  value: string[] | undefined;
  onChange: (links: string[] | undefined) => void;
  inputClassName?: string;
  inputStyle?: CSSProperties;
}) {
  const { t } = useTranslation();
  const saved = (value ?? []).filter((l) => l.trim());
  // Rows being edited, an empty one included, so a new row stays while it is typed in.
  const [rows, setRows] = useState<string[]>(() => (saved.length ? saved : ['']));
  const focusLast = useRef(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  // A change from outside (a profile read again) replaces the rows.
  useEffect(() => {
    const mine = rows.filter((r) => r.trim());
    if (mine.join('\n') !== saved.join('\n')) setRows(saved.length ? saved : ['']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.join('\n')]);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    inputs.current[rows.length - 1]?.focus();
  }, [rows.length]);

  const save = (next: string[]): void => {
    setRows(next);
    const links = next.map((l) => l.trim()).filter(Boolean).slice(0, MAX_SOCIAL);
    onChange(links.length ? links : undefined);
  };

  const add = (): void => {
    if (rows.length >= MAX_SOCIAL) return;
    focusLast.current = true;
    setRows([...rows, '']);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((link, i) => {
        const site = socialSite(link);
        const odd = link.trim() !== '' && !looksLikeLink(link);
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ ...siteChip, color: site ? 'var(--cth-ink)' : 'var(--cth-ink-3)' }}>
                {site ?? t('companyProfile.socialLink')}
              </span>
              <input
                ref={(el) => { inputs.current[i] = el; }}
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => save(rows.map((r, j) => (j === i ? e.target.value : r)))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (link.trim()) add(); } }}
                placeholder={i === 0 ? t('companyProfile.socialPlaceholder') : t('companyProfile.socialPlaceholderMore')}
                aria-label={site ? t('companyProfile.socialAria', { site, n: i + 1 }) : t('companyProfile.socialAriaPlain', { n: i + 1 })}
                aria-invalid={odd || undefined}
                autoComplete="off"
                spellCheck={false}
                className={inputClassName}
                style={{ ...inputStyle, flex: 1 }}
              />
              {(rows.length > 1 || link) && (
                <button
                  type="button"
                  onClick={() => save(rows.length > 1 ? rows.filter((_, j) => j !== i) : [''])}
                  aria-label={t('companyProfile.socialRemove', { n: i + 1 })}
                  title={t('companyProfile.socialRemoveShort')}
                  className="cth-business-row"
                  style={removeButton}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>
            {odd && <span style={{ fontSize: 12, color: 'var(--cth-coral-text)', paddingInlineStart: 96 }}>{t('companyProfile.socialNotLink')}</span>}
          </div>
        );
      })}
      {rows.length < MAX_SOCIAL ? (
        <button type="button" onClick={add} style={addButton} className="cth-business-row">
          <span aria-hidden="true">+</span> {t('companyProfile.socialAdd')}
        </button>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--cth-ink-3)' }}>{t('companyProfile.socialMax', { count: MAX_SOCIAL })}</span>
      )}
    </div>
  );
}

const siteChip: CSSProperties = {
  width: 88, flexShrink: 0, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 'var(--cth-r-pill)', background: 'var(--cth-neutral-soft)', fontSize: 12, fontWeight: 600,
  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
};
const removeButton: CSSProperties = {
  width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 'var(--cth-r-md)',
  background: 'transparent', color: 'var(--cth-ink-3)', cursor: 'pointer'
};
const addButton: CSSProperties = {
  alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', border: 'none',
  borderRadius: 'var(--cth-r-md)', background: 'transparent', color: 'var(--cth-ink-2)', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 500
};
