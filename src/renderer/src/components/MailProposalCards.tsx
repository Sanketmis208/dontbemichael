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

  const decide = async (decision: ProposalDecision): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const standing = decision === 'approve' && standOn && kind.trim() ? kind : undefined;
      const res = await window.cth.decideMailProposal(p.id, decision, decision === 'approve' ? { subject, body } : {}, decision === 'changes' ? note : undefined, standing);
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
      <FoldHeader open={f.open} toggle={f.toggle} summary={<>{t('askMe.mailTo', { to: isolate(p.to) })}<br />{subject}</>} title={
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
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={label}>{t('askMe.mailBody')}</span>
        <GrowingTextarea className="cth-input" value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} maxHeight={320} dir="auto" style={field} />
      </label>
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
