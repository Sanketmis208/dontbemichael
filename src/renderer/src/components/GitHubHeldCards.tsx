import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { touchesGitHubFolder, type GitHubFlag, type HeldWrite } from '@shared/github';
import { useStore } from '@/store/store';
import { AgentAvatar } from './AgentAvatar';
import type { MemberLook } from './askMeFilter';
import { ALWAYS_OPEN, FoldBody, FoldHeader, foldCardClass, foldCardStyle, type FoldControl } from './AskCardFold';
import { GrowingTextarea } from './GrowingTextarea';
import { PixelButton } from './PixelButton';
import { hint } from './fieldText';

/**
 * A GitHub write held for the owner (docs/designs/github-connector-modes.md,
 * design review UI-D4 to UI-D8). Warnings the app worked out come first, then
 * the repo and branch, then the member's own words, then the files. The card
 * stays white; a warning is a coral line, never a tint or a border.
 */
export function GitHubHeldCards({ held, refresh, look, hiddenIds, fold }: {
  held: HeldWrite[];
  refresh: () => void;
  look?: (agentId: string) => MemberLook | undefined;
  hiddenIds?: ReadonlySet<string>;
  fold?: (id: string) => FoldControl;
}) {
  return <>{held.map((h) => <HeldCard key={h.id} h={h} refresh={refresh} look={look?.(h.agentId)} hide={!!hiddenIds?.has(h.id)} fold={fold?.(h.id) ?? ALWAYS_OPEN} />)}</>;
}

const isolate = (s: string): string => `⁨${s}⁩`;
const mono: CSSProperties = { fontFamily: 'var(--cth-font-mono)', fontSize: 11.5, overflowWrap: 'anywhere' };
const meta: CSSProperties = { fontSize: 11.5, lineHeight: '17px', color: 'var(--cth-ink-2)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px' };
const field: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: 'none', outline: 'none',
  background: 'var(--cth-card)', color: 'var(--cth-ink)', fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px'
};

/** The badge for a repo's visibility (design UI-D6): words, never color alone. */
export function VisibilityBadge({ vis }: { vis: 'public' | 'private' | 'unknown' | 'checking' }) {
  const { t } = useTranslation();
  const pub = vis === 'public';
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, borderRadius: 'var(--cth-r-pill)', padding: '1px 7px', whiteSpace: 'nowrap',
      background: pub ? 'var(--cth-amber-soft)' : 'var(--cth-neutral-soft)', color: pub ? 'var(--cth-amber-text)' : 'var(--cth-ink-2)'
    }}>
      {t(`github.vis.${vis}`)}
    </span>
  );
}

function flagText(t: (k: string, o?: Record<string, unknown>) => string, flag: GitHubFlag, files: string[]): string {
  return flag === 'workflow' ? t('github.flag.workflow', { files: files.filter(touchesGitHubFolder).join(', ') }) : t(`github.flag.${flag}`);
}

function HeldCard({ h, refresh, look: lk, hide, fold: f }: { h: HeldWrite; refresh: () => void; look?: MemberLook; hide: boolean; fold: FoldControl }) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const name = agents.find((a) => a.id === h.agentId)?.name ?? h.agentId;
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const title = t('github.cardTitle', { name });

  const decide = async (decision: 'approve' | 'decline' | 'changes'): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await window.cth.decideGitHubHeld(h.id, decision, decision === 'changes' ? note : undefined);
      if (!res.ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const changes = (() => {
    const i = h.input as { files?: Array<{ path?: unknown; content?: unknown }>; path?: unknown; content?: unknown; title?: unknown; body?: unknown; head?: unknown; base?: unknown; diff?: unknown };
    // A push from a member's working copy: the real changed lines (github-local-git.md).
    if (h.tool === 'git_push' && typeof i.diff === 'string') return i.diff;
    if (Array.isArray(i.files)) return i.files.map((x) => `${String(x.path ?? '')}\n${typeof x.content === 'string' ? x.content : ''}`).join('\n\n');
    if (typeof i.content === 'string') return `${String(i.path ?? '')}\n${i.content}`;
    if (h.tool === 'create_pull_request') return `${String(i.head ?? '')} -> ${String(i.base ?? '')}\n${String(i.title ?? '')}\n${String(i.body ?? '')}`;
    return h.tool;
  })();

  return (
    <section
      aria-label={lk ? `${title}, ${lk.dept}` : title}
      data-askme-hidden={hide || undefined}
      className={foldCardClass(f.open)}
      style={foldCardStyle(f.open, hide)}
    >
      <FoldHeader open={f.open} toggle={f.toggle} summary={<>{isolate(h.repo)} · {isolate(h.branch)}<br />{t('github.filesCount', { count: h.files.length })}</>} title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)' }}>
          <AgentAvatar id={h.agentId} name={name} size={17} />
          {title}
        </div>
      } />
      <FoldBody open={f.open} pin={f.pin}>
        {h.flags.length > 0 && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {h.flags.map((fl) => (
              <div key={fl} style={{ display: 'flex', gap: 6, fontSize: 12, lineHeight: '17px', fontWeight: 600, color: 'var(--cth-coral-text)', overflowWrap: 'anywhere' }}>
                <span aria-hidden>⚠</span><span>{flagText(t, fl, h.files)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={meta}>
          <span style={{ color: 'var(--cth-ink-3)' }}>{t('github.repo')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><span style={mono}>{h.repo}</span><VisibilityBadge vis={h.visibility} /></span>
          <span style={{ color: 'var(--cth-ink-3)' }}>{t('github.branch')}</span>
          <span style={mono}>{h.branch}</span>
        </div>
        {h.says && (
          <div style={{ background: 'var(--cth-card-2)', border: '1px solid var(--cth-line)', borderRadius: 'var(--cth-r-md)', padding: '7px 9px', fontSize: 12, lineHeight: '17px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} dir="auto">
            <div style={hint}>{t('github.says', { name })}</div>
            {h.says}
          </div>
        )}
        {h.files.length > 0 && (
          <ul aria-label={t('github.files')} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {h.files.map((file) => <li key={file} style={{ ...mono, padding: '2px 0', borderTop: '1px solid var(--cth-line)' }}>{file}</li>)}
          </ul>
        )}
        <div>
          <button type="button" onClick={() => setShowChanges((v) => !v)} aria-expanded={showChanges}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--cth-indigo-text)' }}>
            {showChanges ? t('github.hideChanges') : t('github.showChanges')}
          </button>
          {showChanges && (
            <pre style={{ ...mono, margin: '6px 0 0', maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'var(--cth-card-2)', border: '1px solid var(--cth-line)', borderRadius: 'var(--cth-r-md)', padding: 8 }}>{changes}</pre>
          )}
        </div>
        {asking && (
          <GrowingTextarea className="cth-input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} dir="auto"
            placeholder={t('github.note')} aria-label={t('github.note')} style={field} />
        )}
        {failed && <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{t('github.failed')}</div>}
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {asking ? (
            <>
              <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => setAsking(false)}>{t('github.cancel')}</PixelButton>
              <PixelButton variant="primary" size="sm" disabled={busy || !note.trim()} onClick={() => void decide('changes')}>{t('github.sendNote')}</PixelButton>
            </>
          ) : (
            <>
              <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => void decide('decline')}>{t('github.decline')}</PixelButton>
              <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => setAsking(true)}>{t('github.changes')}</PixelButton>
              <PixelButton variant="primary" size="sm" disabled={busy} onClick={() => void decide('approve')}>{t('github.approve')}</PixelButton>
            </>
          )}
        </div>
      </FoldBody>
    </section>
  );
}
