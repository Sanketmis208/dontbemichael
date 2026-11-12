import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { AgentAvatar } from './AgentAvatar';
import type { MemberLook } from './askMeFilter';
import { ALWAYS_OPEN, FoldBody, FoldHeader, foldCardClass, foldCardStyle, type FoldControl } from './AskCardFold';
import { useMissions, whenText } from './triggers/ScheduleList';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { requestIsStale, type ScheduleRequest, type ScheduledMission } from '@shared/missions';

/** One line saying what the request would do. */
function describe(req: ScheduleRequest, target: ScheduledMission | undefined, t: TFunction): string {
  const label = target?.label ?? req.draft?.label ?? '';
  switch (req.op) {
    case 'add':
      return t('askMe.scheduleAdd', { label: req.draft?.label ?? '', when: req.draft ? whenText(req.draft, t) : '' });
    case 'update': {
      const before = target ? `${target.label}, ${whenText(target, t)}` : label;
      const after = req.draft ? `${req.draft.label}, ${whenText(req.draft, t)}` : '';
      return t('askMe.scheduleUpdate', { before, after });
    }
    case 'pause': return t('askMe.schedulePause', { label });
    case 'resume': return t('askMe.scheduleResume', { label });
    case 'delete': return t('askMe.scheduleDelete', { label });
  }
}

export function ScheduleRequestCards({ requests, refresh, look, hiddenIds, fold }: {
  requests: ScheduleRequest[];
  refresh: () => void;
  /** Each member's department look (docs/designs/ask-me-department-colors.md). */
  look?: (agentId: string) => MemberLook | undefined;
  /** Requests the board's department filter hides: kept mounted, drawn nowhere. */
  hiddenIds?: ReadonlySet<string>;
  /** Folding under the board's one open card rule; open when not given. */
  fold?: (id: string) => FoldControl;
}) {
  const { t } = useTranslation();
  const { missions } = useMissions();
  const godName = useResolvedGodName();
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id;

  const decide = async (req: ScheduleRequest, approve: boolean) => {
    setBusy(req.id);
    setFailed(null);
    try {
      const res = await window.cth.decideScheduleRequest(req.id, approve);
      if (!res.ok) setFailed(req.id);
    } catch {
      setFailed(req.id);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <>
      {requests.map((req) => {
        const name = nameOf(req.agentId);
        const lk = look?.(req.agentId);
        const hide = !!hiddenIds?.has(req.id);
        const target = missions.find((m) => m.id === req.missionId);
        const stale = requestIsStale(req, missions);
        const f = fold?.(req.id) ?? ALWAYS_OPEN;
        return (
          <section
            key={req.id}
            aria-label={lk ? `${t('askMe.scheduleTitle', { name })}, ${lk.dept}` : t('askMe.scheduleTitle', { name })}
            data-askme-hidden={hide || undefined}
            className={foldCardClass(f.open)}
            style={foldCardStyle(f.open, hide)}
          >
            {/* Design v2 (branding/DESIGN.md 7.9): the only card with Approve and
                Decline. Same frame as an Ask me card. */}
            <FoldHeader open={f.open} toggle={f.toggle} summary={describe(req, target, t)} title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)' }}>
                <AgentAvatar id={req.agentId} name={name} size={17} />
                {t('askMe.scheduleTitle', { name })}
              </div>
            } />
            <FoldBody open={f.open} pin={f.pin}>
            <div style={{ fontSize: 12, lineHeight: '16.5px', color: 'var(--cth-ink)' }}>{describe(req, target, t)}</div>
            {/* The job's proposed focus area, approved with it (schedule-focus-areas.md). */}
            {req.draft?.focus && req.draft.focus !== target?.focus && (
              <div style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>
                {t('scheduledJobs.focus', { focus: req.draft.focus })}
              </div>
            )}
            {/* Why the team member asks, then what Michael could not settle (owner, 2026-09-27). */}
            {req.reason && (
              <div style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>
                {t('askMe.scheduleWhy', { reason: req.reason })}
              </div>
            )}
            {req.escalation && (
              <div style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>
                {t('askMe.scheduleMichael', { name: godName, note: req.escalation })}
              </div>
            )}
            {stale && (
              <div role="status" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-3)' }}>
                {t('askMe.scheduleStale', { name })}
              </div>
            )}
            {failed === req.id && (
              <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>
                {t('schedulesSection.saveFailed')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
              <PixelButton variant="secondary" size="sm" disabled={busy === req.id} onClick={() => void decide(req, false)}>
                {t('askMe.decline')}
              </PixelButton>
              <PixelButton variant="primary" size="sm" disabled={stale || busy === req.id} onClick={() => void decide(req, true)}>
                {t('askMe.approve')}
              </PixelButton>
            </div>
            </FoldBody>
          </section>
        );
      })}
    </>
  );
}
