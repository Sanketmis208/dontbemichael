import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { MailProposal, ProposalDecision } from '@shared/mailProposals';
import { useStore } from '@/store/store';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';
import { AgentAvatar } from './AgentAvatar';
import type { MemberLook } from './askMeFilter';
import { ALWAYS_OPEN, FoldBody, FoldHeader, foldCardClass, foldCardStyle, type FoldControl } from './AskCardFold';
import { GrowingTextarea } from './GrowingTextarea';
import { PixelButton } from './PixelButton';
import { emailHref, parseEmailHref } from '@shared/emailLink';
import { EmailChip } from '@/markdown/EmailChip';
import { Icon } from './Icon';
import { InfoTip } from './InfoTip';
import { sizeWords } from './EmailTabView';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

/** Rows shown before "Show all" on a card with many files. */
const FILES_SHOWN = 5;

/** The last part of a folder path, on either system. */
const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/**
 * Send on approval (docs/designs/send-on-approval.md): an email a team member
 * proposed, on Ask me. The owner can edit the subject and body, then Approve,
 * Ask for changes (with a note) or Don't send. The team member sends the
 * approved version; the app keeps it, so nothing changes after the owner's yes.
 */
export function MailProposalCards({ proposals, refresh, look, hiddenIds, fold }: {
  proposals: MailProposal[];
  refresh: () => void;
  /** Each member's department look (docs/designs/ask-me-department-colors.md). */
  look?: (agentId: string) => MemberLook | undefined;
  /** Proposals the board's department filter hides: kept mounted, so typed
   *  edits survive, and drawn nowhere. */
  hiddenIds?: ReadonlySet<string>;
  /** Folding under the board's one open card rule; open when not given. */
  fold?: (id: string) => FoldControl;
}) {
  return <>{proposals.map((p) => <ProposalCard key={p.id} p={p} refresh={refresh} look={look?.(p.agentId)} hide={!!hiddenIds?.has(p.id)} fold={fold?.(p.id) ?? ALWAYS_OPEN} />)}</>;
}

/** Wraps text in a bidi isolate (FSI ... PDI) for use inside a translated line. */
const isolate = (s: string): string => `\u2068${s}\u2069`;

// .cth-input draws the resting edge and the focus ring; the resets here keep
// the browser's own border, outline and field colors out (as CompanyProfileFields).
const field: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: 'none', outline: 'none',
  background: 'var(--cth-card)', color: 'var(--cth-ink)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px'
};
const label: CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--cth-ink-3)' };
const meta: CSSProperties = { fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)', overflowWrap: 'anywhere' };

function ProposalCard({ p, refresh, look: lk, hide, fold: f }: { p: MailProposal; refresh: () => void; look?: MemberLook; hide: boolean; fold: FoldControl }) {
  // From the reply's thread record; a card filed while the server was out of reach has none.
  const replyHref = p.thread?.inReplyTo ? emailHref({ mailbox: p.mailbox, messageId: p.thread.inReplyTo }) : null;
  const replying = replyHref ? parseEmailHref(replyHref) : null;
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const mailboxes = useHarnessConfig()?.mailboxes;
  const name = agents.find((a) => a.id === p.agentId)?.name ?? p.agentId;
  const godName = useResolvedGodName();
  const from = mailboxes?.find((m) => m.id === p.mailbox)?.address ?? p.mailbox;
  const [subject, setSubject] = useState(p.subject);
  const [body, setBody] = useState(p.body);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The agent's offer to send this kind without asking from now on: off until
  // the owner ticks it, and its words can be narrowed first.
  const [standOn, setStandOn] = useState(false);
  const [kind, setKind] = useState(p.offerStanding ?? '');
  // Files the member attached from its folder (agent-attach-files.md): the
  // positions still on the email; the owner may take any off before approving.
  const files = p.files?.items ?? [];
  const [kept, setKept] = useState<number[]>(() => files.map((_, i) => i));
  const [allFiles, setAllFiles] = useState(false);
  const [fileState, setFileState] = useState<Record<number, 'opening' | 'gone' | 'failed'>>({});
  const openFile = async (i: number): Promise<void> => {
    setFileState((s) => ({ ...s, [i]: 'opening' }));
    let r: { ok: boolean; reason?: 'gone' | 'failed' };
    try { r = await window.cth.openMailProposalFile(p.id, i); } catch { r = { ok: false, reason: 'failed' }; }
    setFileState((s) => {
      const next = { ...s };
      if (r.ok) delete next[i]; else next[i] = r.reason === 'gone' ? 'gone' : 'failed';
      return next;
    });
  };
  const keptFolders = Array.from(new Set(kept.map((i) => folderName(files[i].from))));

  const decide = async (decision: ProposalDecision): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const standing = decision === 'approve' && standOn && kind.trim() ? kind : undefined;
      // The files left on it go only when the owner took some off.
      const left = files.length && kept.length < files.length ? { files: kept } : {};
      const res = await window.cth.decideMailProposal(p.id, decision, decision === 'approve' ? { subject, body, ...left } : {}, decision === 'changes' ? note : undefined, standing);
      if (!res.ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <section
      aria-label={lk ? `${t('askMe.mailTitle', { name })}, ${lk.dept}` : t('askMe.mailTitle', { name })}
      data-askme-hidden={hide || undefined}
      className={foldCardClass(f.open)}
      style={foldCardStyle(f.open, hide)}
    >
      {/* Folded: who it goes to and the subject as it stands (owner, 2026-11-05). */}
      <FoldHeader open={f.open} toggle={f.toggle} summary={<>{t('askMe.mailTo', { to: isolate(p.to) })}<br />{subject}{kept.length > 0 && <><br />{t('askMe.mailFilesCount', { count: kept.length })}</>}</>} title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)' }}>
          <AgentAvatar id={p.agentId} name={name} size={17} />
          {t('askMe.mailTitle', { name })}
        </div>
      } />
      <FoldBody open={f.open} pin={f.pin}>
      <div style={meta}>
        {/* Addresses isolated, so they read left to right inside an Arabic line. */}
        <div>{t('askMe.mailFrom', { from: isolate(from) })}</div>
        <div>{t('askMe.mailTo', { to: isolate(p.to) })}</div>
        {p.cc && <div>{t('askMe.mailCc', { cc: isolate(p.cc) })}</div>}
        {/* The email this reply answers, one click away (original-email-view.md, E1). */}
        {replying && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {t('emailTab.replyingTo')}
            <EmailChip email={replying} words={p.to}>{p.to}</EmailChip>
          </div>
        )}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={label}>{t('askMe.mailSubject')}</span>
        <input className="cth-input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} dir="auto" style={field} />
      </label>
      {/* What else leaves with it (eng review D2): the owner approves seeing it. */}
      {(p.forward || (p.attachFrom?.length ?? 0) > 0) && (
        <div style={meta}>
          {p.forward && <div>{t('askMe.mailForwards')}</div>}
          {(p.attachFrom?.length ?? 0) > 0 && <div>{t('askMe.mailAttaches', { count: p.attachFrom!.length })}</div>}
        </div>
      )}
      {kept.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ ...label, display: 'flex', alignItems: 'center', gap: 5 }}>
            {t('askMe.mailFiles', { count: kept.length, from: isolate(keptFolders.join(', ')) })}
            <InfoTip text={t('askMe.mailFilesTip', { name })} />
          </span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderRadius: 'var(--cth-r-md)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)' }}>
            {(allFiles ? kept : kept.slice(0, FILES_SHOWN)).map((i, row) => {
              const file = files[i];
              const st = fileState[i];
              return (
                <li key={i} style={{ display: 'flex', flexDirection: 'column', padding: '3px 6px 3px 9px', boxShadow: row ? 'inset 0 1px 0 var(--cth-line)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 24 }}>
                    <button
                      type="button"
                      className="cth-email-attachment"
                      onClick={() => void openFile(i)}
                      disabled={busy || st === 'opening'}
                      aria-label={t('emailTab.attachmentOpen', { name: file.name })}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1, padding: 0, border: 0, background: 'transparent', cursor: st === 'opening' ? 'default' : 'pointer', fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, textAlign: 'start' }}
                    >
                      <span aria-hidden style={{ color: 'var(--cth-ink-3)', display: 'grid' }}><Icon name="file" size={0.8125} /></span>
                      <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--cth-indigo-text)' }}>{file.name}</span>
                      <span style={{ marginInlineStart: 'auto', flexShrink: 0, fontSize: 10.5, color: 'var(--cth-ink-3)' }}>{st === 'opening' ? t('emailTab.attachmentOpening') : sizeWords(file.size)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setKept((k) => k.filter((x) => x !== i))}
                      disabled={busy}
                      aria-label={t('askMe.mailFileRemove', { name: file.name })}
                      title={t('askMe.mailFileRemove', { name: file.name })}
                      style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, flexShrink: 0, padding: 0, border: 0, borderRadius: 'var(--cth-r-sm)', background: 'transparent', color: 'var(--cth-ink-3)', cursor: 'pointer' }}
                    >
                      <Icon name="x" size={0.75} />
                    </button>
                  </div>
                  {(st === 'gone' || st === 'failed') && (
                    <span role="status" style={{ paddingInlineStart: 20, fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-3)' }}>
                      {t(st === 'gone' ? 'askMe.mailFileGone' : 'emailTab.attachmentFailed')}
                    </span>
                  )}
                </li>
              );
            })}
            {!allFiles && kept.length > FILES_SHOWN && (
              <li style={{ boxShadow: 'inset 0 1px 0 var(--cth-line)' }}>
                <button type="button" onClick={() => setAllFiles(true)} style={{ padding: '4px 9px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--cth-font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--cth-indigo-text)' }}>
                  {t('askMe.mailFilesAll', { count: kept.length })}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
      {kept.length < files.length && (
        <button type="button" onClick={() => setKept(files.map((_, i) => i))} disabled={busy} style={{ alignSelf: 'flex-start', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--cth-font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--cth-indigo-text)' }}>
          {t('askMe.mailFilesPutBack', { count: files.length - kept.length })}
        </button>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={label}>{t('askMe.mailBody')}</span>
        <GrowingTextarea className="cth-input" value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} maxHeight={320} dir="auto" style={field} />
      </label>
      {/* What the email promises for later: each becomes a card Michael keeps
          once it is sent (owner, 2026-11-27). */}
      {(p.promises?.length ?? 0) > 0 && (
        <div data-mail-promises style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ ...label, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {t('askMe.mailPromises')}
            <InfoTip text={t('askMe.mailPromisesTip', { name, manager: godName })} />
          </span>
          <ul style={{ margin: 0, paddingInlineStart: 16, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>
            {p.promises!.map((line, i) => <li key={i} dir="auto">{line}</li>)}
          </ul>
        </div>
      )}
      {p.offerStanding && !asking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cth-ink)' }}>
            <input type="checkbox" checked={standOn} onChange={(e) => setStandOn(e.target.checked)} disabled={busy} />
            {t('askMe.mailStanding')}
          </label>
          {standOn && (
            <input className="cth-input" value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy} aria-label={t('askMe.mailStanding')} dir="auto" style={field} />
          )}
        </div>
      )}
      {asking && (
        <GrowingTextarea
          className="cth-input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} dir="auto"
          placeholder={t('askMe.mailNote')} aria-label={t('askMe.mailNote')} style={field}
        />
      )}
      {failed && (
        <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{t('askMe.mailFailed')}</div>
      )}
      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {asking ? (
          <>
            <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => setAsking(false)}>{t('askMe.mailCancel')}</PixelButton>
            <PixelButton variant="primary" size="sm" disabled={busy || !note.trim()} onClick={() => void decide('changes')}>{t('askMe.mailSendNote')}</PixelButton>
          </>
        ) : (
          <>
            <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => void decide('decline')}>{t('askMe.mailDecline')}</PixelButton>
            <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => setAsking(true)}>{t('askMe.mailChanges')}</PixelButton>
            <PixelButton variant="primary" size="sm" disabled={busy || !subject.trim() || !body.trim()} onClick={() => void decide('approve')}>{t('askMe.approve')}</PixelButton>
          </>
        )}
      </div>
      </FoldBody>
    </section>
  );
}
