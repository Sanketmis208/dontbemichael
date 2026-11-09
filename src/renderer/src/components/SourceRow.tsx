/**
 * What an Ask me card rests on, as chips under its question
 * (docs/designs/ask-me-source-links.md; owner, 2026-11-08: the owner should
 * never search for what the team already read).
 *
 * One row per entry, read through the shared `sourcesOf`, so it shows exactly
 * what Michael's checks count. Each kind opens the way the app already opens
 * it: a web page through main's guarded openExternal, an email in its office
 * tab (EmailChip), a file through main's folder check (FileChip). A web chip
 * shows the site beside its words, so a label can't hide where it goes.
 * Labels are plain text, never markdown. No sources, no row.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { parseEmailHref } from '@shared/emailLink';
import { sourcesOf, type Source } from '@shared/askSources';
import { isExternal, labelMismatch, linkName } from '@/markdown/mdLinks';
import { EmailChip } from '@/markdown/EmailChip';
import { FileChip, useAskFileChecks } from './FileChip';
import { Icon } from './Icon';

type Who = { raisedBy?: string; assignee?: string };

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle', maxWidth: '100%',
  height: 24, padding: '0 8px', margin: '1px 0', border: 0, borderRadius: 'var(--cth-r-sm)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 500, lineHeight: '24px', whiteSpace: 'nowrap',
  background: 'var(--cth-neutral-soft)', color: 'var(--cth-indigo-text)', cursor: 'pointer'
};
const words: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220, unicodeBidi: 'isolate' };
const muted: CSSProperties = { color: 'var(--cth-ink-3)', fontWeight: 400 };

/** The site a web link really opens: a known app's name, else its host
 *  without `www.` (mdLinks, the same names card links use). */
function siteOf(url: string): string {
  return linkName(url) ?? '';
}

function WebChip({ label, url }: { label: string; url: string }) {
  const { t } = useTranslation();
  const site = siteOf(url);
  // The words name one site and the link opens another: show where it goes.
  const other = labelMismatch(label, url);
  return (
    <button
      type="button"
      className="cth-file-chip"
      title={url}
      aria-label={t('askMe.sourceOpens', { label, site: other ?? site })}
      onClick={() => { if (isExternal(url)) void window.cth.openExternal?.(url); }}
      style={chip}
    >
      <span aria-hidden style={{ color: 'var(--cth-ink-3)', display: 'grid', placeItems: 'center' }}><Icon name="web" size={0.875} /></span>
      <span dir="auto" style={words}>{label}</span>
      {(other ?? site) && <bdi dir="ltr" style={{ ...muted, ...(other ? { color: 'var(--cth-coral-text)' } : {}) }}>{other ?? site}</bdi>}
    </button>
  );
}

/** Text the owner can read but not open: a record named by its id, or a link
 *  the app won't open. */
function PlainSource({ s }: { s: Source }) {
  return (
    <span style={{ ...chip, cursor: 'default', color: 'var(--cth-ink-2)' }}>
      <span dir="auto" style={words}>{s.label}</span>
      {s.kind === 'named' && <bdi dir="auto" style={muted}>{s.id}</bdi>}
    </span>
  );
}

export function SourceRow({ entry, who, margin = '-4px 0 12px' }: { entry: unknown; who: Who; margin?: string }) {
  const { t } = useTranslation();
  const { items, searched } = useMemo(() => sourcesOf(entry), [entry]);
  // Files are checked by main, as file chips in the question are.
  const fileEntries = useMemo(() => {
    const paths = items.filter((s) => s.kind === 'file').map((s) => `\`${(s as { url: string }).url}\``);
    return paths.length ? [{ q: paths.join(' '), raisedBy: who.raisedBy }] : undefined;
  }, [items, who.raisedBy]);
  const checks = useAskFileChecks(fileEntries, who.assignee)[who.raisedBy ?? ''] ?? {};
  const [gone, setGone] = useState<Record<string, true>>({});
  if (!items.length && !searched.length) return null;
  return (
    <div role="group" aria-label={t('askMe.sources')} style={{ display: 'flex', flexDirection: 'column', gap: 4, margin }}>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((s, i) => {
            if (s.kind === 'web') return <WebChip key={i} label={s.label} url={s.url} />;
            if (s.kind === 'email') {
              const ref = parseEmailHref(s.url);
              return ref ? <EmailChip key={i} email={ref} words={s.label}>{s.label}</EmailChip> : <PlainSource key={i} s={{ kind: 'rejected', label: s.label }} />;
            }
            if (s.kind === 'file') {
              // A click that finds the file gone marks it Not found, as question chips do.
              const check = gone[s.url] ? { verdict: 'missing' as const, tab: false, path: s.url } : checks[s.url];
              return <FileChip key={i} path={s.url} check={check} who={who} onGone={(p) => setGone((g) => ({ ...g, [p]: true }))} />;
            }
            return <PlainSource key={i} s={s} />;
          })}
        </div>
      )}
      {searched.length > 0 && (
        <div dir="auto" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cth-ink-3)' }}>
          <span aria-hidden style={{ display: 'grid', placeItems: 'center' }}><Icon name="search" size={0.875} /></span>
          <span>{t('askMe.lookedIn', { places: searched.map((s) => s.label).join(', ') })}</span>
        </div>
      )}
    </div>
  );
}
