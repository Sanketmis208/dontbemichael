/**
 * "Claude Code updated underneath the team": Michael's card on Ask me
 * (owner, 2026-11-05: the top bar chip is not required, and the popup should be
 * an Ask me card; docs/designs/team-upgrade-card.md). The business-owner half of
 * src/shared/cliUpdate.ts.
 *
 * Claude Code updates itself on disk, and each agent's terminal footer then says
 * "Update installed · Restart to update". Owners never read the terminal tab, so
 * Michael says it on Ask me instead, like the app update card (UpdateCard).
 * Nothing restarts on its own. The only action is the owner's click, which runs
 * closing time (every agent saves its work and confirms) and then reopens the
 * app, so every agent starts again on the new version.
 *
 *   status (main push) ── behind > 0, not put off ──► card on Ask me (counted)
 *     Later ──────────────► off until a newer Claude Code (putOffCliUpdate)
 *     close and reopen ──► closing time; the card steps aside while it is
 *                              open, and comes back on a refused start or a
 *                              cancel (the agents are still behind)
 *     everyone caught up (null push) ─► the card leaves
 *
 * The app makes this card: nothing goes in tasks.json, so no agent can write it,
 * answer it or restart the office through it.
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cliUpdateToastVisible, type CliUpdateStatus } from '@shared/cliUpdate';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useStore } from '@/store/store';
import { putOffCliUpdate } from '@/shell/useNeedsYou';
import { AgentAvatar } from './AgentAvatar';
import { PixelButton } from './PixelButton';

/** App's close and reopen, registered once at start (App.tsx), so the card
 *  never waits on an event nobody answers. */
let closeAndReopen: (() => Promise<boolean>) | null = null;
export function setCloseAndReopen(fn: () => Promise<boolean>): void {
  closeAndReopen = fn;
}

export function CliUpdateCard({ status, later }: { status: CliUpdateStatus | null; later: string | null }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const godId = useStore((s) => s.agents.find((a) => a.isGod)?.id);
  // Closing time open (its bar up): the bar is the one thing to read. A
  // refused start or a cancel closes the bar, and the card is back.
  const closing = useStore((s) => s.officeClosing);
  if (!status || !cliUpdateToastVisible(status, later) || closing) return null;

  const title = t('cliUpdate.title');
  return (
    <section aria-label={title} data-askme-id="team-upgrade" style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '18px', letterSpacing: '-0.01em', color: 'var(--cth-ink)' }}>{title}</div>
      {/* From Michael, like every ask: only Michael speaks to the owner. */}
      <div style={{ marginTop: 6 }}>
        <span style={personChip}><AgentAvatar id={godId} name={godName} size={16} />{godName}</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>
        {status.behind === 1
          ? t('cliUpdate.body', { version: status.installed })
          : t('cliUpdate.bodyPlural', { version: status.installed, count: status.behind })}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
        <PixelButton variant="secondary" size="sm" onClick={() => putOffCliUpdate(status.installed)}>{t('cliUpdate.later')}</PixelButton>
        {/* Starting the close is not a Later: a cancel brings the card back. */}
        <PixelButton variant="primary" size="sm" onClick={() => { void closeAndReopen?.(); }}>{t('cliUpdate.closeAndReopen')}</PixelButton>
      </div>
    </section>
  );
}

const card: CSSProperties = {
  position: 'relative', flexShrink: 0, padding: '13px 14px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-md)'
};
const personChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px 0 3px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)'
};
