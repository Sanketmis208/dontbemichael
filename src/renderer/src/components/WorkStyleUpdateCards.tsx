import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { InfoTip } from './InfoTip';
import { fieldLabel } from './fieldText';
import { useStore } from '@/store/store';
import { AgentAvatar } from './AgentAvatar';
import type { MemberLook } from './askMeFilter';
import { ALWAYS_OPEN, FoldBody, FoldHeader, foldCardClass, foldCardStyle, type FoldControl } from './AskCardFold';
import { splitAgentRole } from '@shared/agentRole';
import { jobBase } from '@shared/jobChange';
import { lineChanges, noLineChanges, roleLabel } from '@shared/workStyleText';
import { effectiveWorkStyle } from '@shared/michaelWorkStyle';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { decisionId, type WorkStyleOffer } from '@shared/workStyleUpdates';
import { decideWorkStyleOffer, adoptWorkStyleOffer } from '@/shell/workStyleOffers';
import { refreshNeedsYou } from '@/shell/useNeedsYou';
import { JobChangeReview, type ReviseOk, type ReviseResult, type ReviseRun } from './JobChangeReview';

/** Each update's worked out result, by its updates, member and job, for this
 *  app session: reopening the card never pays for the analysis again
 *  (eng review E5). */
const kept = new Map<string, { ok: ReviseOk; from: string }>();
const keptKey = (offer: WorkStyleOffer, from: string): string => `${(offer.keys ?? [offer.key]).join(',')}|${offer.agentId}|${from}`;

/** The folded card's line: the first clause of each duty it brings. */
export function dutyHeadline(duties: readonly string[]): string {
  return duties.map((d) => d.split(/[:.]/)[0].trim()).filter(Boolean).join('; ');
}

/**
 * An update to the job of someone already hired (shared/workStyleUpdates.ts;
 * docs/designs/work-style-update-card-clarity.md): when the card is first
 * opened, the update's duties are worked into the member's own current job by
 * the same analysis an owner's job change gets, and the card lists exactly
 * what is added, changed and no longer in it, or asks when the duty clashes
 * (owner, CEO review D2 to D4, 2026-11-07). Nothing saves before Use it; Keep
 * mine is on the card in every state.
 */
export function WorkStyleUpdateCards({ offers, look, hiddenIds, fold }: {
  offers: WorkStyleOffer[];
  /** Each member's department look (docs/designs/ask-me-department-colors.md). */
  look?: (agentId: string) => MemberLook | undefined;
  /** Offers (by decision id) the board's department filter hides: kept mounted, drawn nowhere. */
  hiddenIds?: ReadonlySet<string>;
  /** Folding under the board's one open card rule; open when not given. */
  fold?: (id: string) => FoldControl;
}) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const godName = useResolvedGodName();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const keep = async (offer: WorkStyleOffer) => {
    const id = decisionId(offer.key, offer.agentId);
    setBusy(id);
    setFailed(null);
    try { await decideWorkStyleOffer(offer, 'keep'); } catch { setFailed(id); }
    setBusy(null);
    refreshNeedsYou();
  };

  /** The analysis: the update's duties worked into the member's own job. */
  const analyze = (offer: WorkStyleOffer, name: string) => async ({ requestId }: ReviseRun): Promise<ReviseResult> => {
    const config = await window.cth.getConfig() as { businessName?: string; businessCity?: string };
    const agent = useStore.getState().agents.find((a) => a.id === offer.agentId);
    if (!agent) return { kind: 'error', reason: 'failed' };
    const own = splitAgentRole(agent.description ?? '');
    const ctx = { name, title: own.role || undefined, business: { name: config.businessName, city: config.businessCity }, manager: godName };
    return window.cth.workStyleRevise({ requestId, ctx, current: { instructions: effectiveWorkStyle(agent), handles: own.roleDescription }, changes: offer.duties?.length ? offer.duties : [t(offer.whyKey)], update: true });
  };

  /** What the card lists: the exact lines, or that nothing changes. */
  const changesOf = (offer: WorkStyleOffer, name: string) => (ok: ReviseOk): { node: ReactNode; none: boolean } => {
    const agent = useStore.getState().agents.find((a) => a.id === offer.agentId);
    const c = lineChanges(agent ? effectiveWorkStyle(agent) : '', ok.instructions);
    if (noLineChanges(c)) return { none: true, node: <div style={lineText}>{t('jobChange.updateNothing', { name })}</div> };
    return {
      none: false,
      node: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {c.added.length > 0 && <Group label={t('jobChange.updateAdds', { name })} lines={c.added} mark="+" />}
          {c.changed.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={groupLabel}>{t('jobChange.updateChanges')}</span>
              {c.changed.map((x, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ ...lineText, color: 'var(--cth-ink-2)', textDecoration: 'line-through' }}>{x.before}</span>
                  <span style={lineText}>{x.after}</span>
                </div>
              ))}
            </div>
          )}
          {c.removed.length > 0 && <Group label={t('jobChange.updateRemoves')} lines={c.removed} mark={'\u2212'} />}
        </div>
      )
    };
  };

  /** Cards opened at least once: their analysis has started (eng review E4). */
  const opened = useRef(new Set<string>());
  /** Bumped to work a card out again after Stop or Cancel. */
  const [runs, setRuns] = useState<Record<string, number>>({});
  const [stopped, setStopped] = useState<Set<string>>(new Set());

  return (
    <>
      {offers.map((offer) => {
        const id = decisionId(offer.key, offer.agentId);
        const agent = agents.find((a) => a.id === offer.agentId);
        const name = agent?.name ?? offer.agentId;
        const lk = look?.(offer.agentId);
        const hide = !!hiddenIds?.has(id);
        const f = fold?.(id) ?? ALWAYS_OPEN;
        if (f.open) opened.current.add(id);
        const started = opened.current.has(id) && !stopped.has(id);
        const from = agent ? jobBase(agent) : '';
        const headline = dutyHeadline(offer.duties ?? []) || t(offer.whyKey);
        return (
          <section key={id} data-work-style-offer data-askme-hidden={hide || undefined}
            aria-label={lk ? `${t('jobChange.packTitle', { name })}, ${lk.dept}` : t('jobChange.packTitle', { name })}
            className={foldCardClass(f.open)} style={foldCardStyle(f.open, hide)}>
            <FoldHeader open={f.open} toggle={f.toggle} summary={headline} title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)' }}>
                <AgentAvatar id={offer.agentId} name={name} size={17} />
                {t('jobChange.packTitle', { name })}
                <InfoTip text={t(offer.whyKey)} label={t('jobChange.packTitle', { name })} />
              </div>
            } />
            <FoldBody open={f.open} pin={f.pin}>
            {failed === id && (
              <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{t('schedulesSection.saveFailed')}</div>
            )}
            {started ? (
              <JobChangeReview
                key={runs[id] ?? 0}
                who={name || roleLabel(splitAgentRole(agent?.description ?? '').role)}
                run={analyze(offer, name)}
                previewTitle={t('jobChange.updateTitle', { name })}
                initialResult={kept.get(keptKey(offer, from))}
                onResult={(ok, at) => kept.set(keptKey(offer, at), { ok, from: at })}
                changesOf={changesOf(offer, name)}
                base={() => { const a = useStore.getState().agents.find((x) => x.id === offer.agentId); return a ? jobBase(a) : ''; }}
                apply={async (ok, _change, at) => {
                  const r = await adoptWorkStyleOffer(offer, ok, at);
                  if (r === 'applied') { useStore.getState().updateAgent(offer.agentId, { goalPlain: undefined }); refreshNeedsYou(); }
                  return r;
                }}
                applyLabel={t('jobChange.useIt')}
                sendsTask={false}
                autoRun
                onCancel={() => setStopped((x) => new Set(x).add(id))}
              />
            ) : stopped.has(id) ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <PixelButton variant="secondary" size="sm" onClick={() => { setStopped((x) => { const n = new Set(x); n.delete(id); return n; }); setRuns((r) => ({ ...r, [id]: (r[id] ?? 0) + 1 })); }}>{t('jobChange.updateAgain')}</PixelButton>
              </div>
            ) : null}
            {/* Keep mine is on the card in every state (eng review E6). */}
            <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
              <PixelButton variant="secondary" size="sm" disabled={busy === id} onClick={() => void keep(offer)}>{t('askMe.workStyleKeep')}</PixelButton>
            </div>
            </FoldBody>
          </section>
        );
      })}
    </>
  );
}

// The group names use the shared field label (fieldText).
const groupLabel = fieldLabel;
const lineText: React.CSSProperties = { fontSize: 12, lineHeight: '16.5px', color: 'var(--cth-ink)' };

/** A labelled list of whole lines with a + or minus mark for the eye. */
function Group({ label, lines, mark }: { label: string; lines: string[]; mark: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={groupLabel}>{label}</span>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span aria-hidden="true" style={{ ...lineText, color: 'var(--cth-ink-3)', minWidth: 8 }}>{mark}</span>
          <span style={lineText}>{l}</span>
        </div>
      ))}
    </div>
  );
}
