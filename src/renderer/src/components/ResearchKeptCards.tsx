import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { AgentAvatar } from './AgentAvatar';
import type { MemberLook } from './askMeFilter';
import { ALWAYS_OPEN, FoldBody, FoldHeader, foldCardClass, foldCardStyle, type FoldControl } from './AskCardFold';
import { useResearchName } from '@/shell/research';
import { useHarnessConfig } from '@/hooks/useHarnessConfig';
import { cleanPublicTerms } from '@shared/publicTerms';
import type { ResearchKept } from '@shared/researchKept';

/**
 * A question to Research the privacy check kept words back from (owner,
 * 2026-11-20: "ask me card should offer adding whats blocked in this case to
 * this allow list"; shared/researchKept.ts). Each kept back piece is decided
 * on its own: Always allow (it goes on the business's Always allowed list, as
 * in Settings) or Keep private. One button ends the card (owner, 2026-11-21):
 * Done once every piece is decided, Done for now (the card folds and waits)
 * until then. Either sends the question again when something is allowed that
 * it has not gone with yet, so the work is not held up.
 */
export function ResearchKeptCards({ kept, refresh, look, hiddenIds, fold }: {
  kept: ResearchKept[];
  refresh: () => void;
  look?: (agentId: string) => MemberLook | undefined;
  hiddenIds?: ReadonlySet<string>;
  fold?: (id: string) => FoldControl;
}) {
  const { t } = useTranslation();
  const researchName = useResearchName();
  const config = useHarnessConfig();
  const agents = useStore((s) => s.agents);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const allowed = cleanPublicTerms(config?.researchPublic).map((x) => x.toLowerCase());
  const isAllowed = (part: string): boolean => allowed.includes(part.toLowerCase());

  const run = async (key: string, job: () => Promise<{ ok: boolean }>): Promise<void> => {
    setBusy(key);
    setFailed(null);
    try {
      const res = await job();
      if (!res.ok) setFailed(key);
    } catch {
      setFailed(key);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <>
      {kept.map((k) => {
        const name = k.fromName ?? agents.find((a) => a.id === k.from)?.name ?? k.from;
        const lk = look?.(k.from);
        const hide = !!hiddenIds?.has(k.id);
        const f = fold?.(k.id) ?? ALWAYS_OPEN;
        const title = t('askMe.keptTitle', { name, research: researchName });
        const isPrivate = (part: string): boolean => !isAllowed(part) && k.private.some((p) => p.toLowerCase() === part.toLowerCase());
        const allDecided = k.parts.every((p) => isAllowed(p) || isPrivate(p));
        // Goes again only with an allowance it has not gone with yet.
        const willAsk = k.parts.some((p) => isAllowed(p) && !k.sent.some((q) => q.toLowerCase() === p.toLowerCase()));
        const later = async (): Promise<void> => {
          if (willAsk) await run(k.id, () => window.cth.researchKeptDecide(k.id, 'later'));
          if (f.open) f.toggle();
        };
        const allow = (part: string): Promise<{ ok: boolean }> => window.cth.researchAllow(part);
        // Keep private also takes the piece back off the Always allowed list.
        const keep = async (part: string): Promise<{ ok: boolean }> => {
          if (isAllowed(part) && !(await window.cth.researchDisallow(part)).ok) return { ok: false };
          return window.cth.researchKeptPrivate(k.id, part, true);
        };
        return (
          <section
            key={k.id}
            aria-label={lk ? `${title}, ${lk.dept}` : title}
            data-askme-hidden={hide || undefined}
            className={foldCardClass(f.open)}
            style={foldCardStyle(f.open, hide)}
          >
            <FoldHeader open={f.open} toggle={f.toggle} summary={k.parts.join(', ')} title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, lineHeight: '17px', color: 'var(--cth-ink)' }}>
                <AgentAvatar id={k.from} name={name} size={17} />
                {title}
              </div>
            } />
            <FoldBody open={f.open} pin={f.pin}>
              <div style={{ fontSize: 12, lineHeight: '16.5px', color: 'var(--cth-ink)' }}>
                {k.denied ? t('askMe.keptDenied', { name, research: researchName, subject: k.subject }) : t('askMe.keptCleaned', { name, research: researchName, subject: k.subject })}
              </div>
              <ul aria-label={t('askMe.keptList')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {k.parts.map((part) => {
                  const on = isAllowed(part);
                  const priv = isPrivate(part);
                  return (
                    <li key={part} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 8px', padding: '6px 8px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-neutral-soft)' }}>
                      <span style={{ flex: '1 1 120px', minWidth: 0, fontSize: 12, fontFamily: 'var(--cth-font-mono)', color: 'var(--cth-ink)', overflowWrap: 'anywhere' }}>{part}</span>
                      <div role="group" aria-label={part} style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button type="button" aria-pressed={on} aria-label={t('askMe.keptAllowAria', { part })} disabled={busy !== null}
                          onClick={() => { if (!on) void run(`${k.id}:${part}`, () => allow(part)); }}
                          className={on ? 'cth-askme-chip is-on' : 'cth-askme-chip'}>
                          {t('askMe.keptAllow')}
                        </button>
                        <button type="button" aria-pressed={priv} aria-label={t('askMe.keptKeepAria', { part })} disabled={busy !== null}
                          onClick={() => { if (!priv) void run(`${k.id}:${part}`, () => keep(part)); }}
                          className={priv ? 'cth-askme-chip is-on' : 'cth-askme-chip'}>
                          {t('askMe.keptKeep')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>{t('askMe.keptHint')}</div>
              {failed?.startsWith(k.id) && (
                <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{t('askMe.keptFailed')}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                {willAsk && (
                  <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>{t('askMe.keptWillAsk', { name, research: researchName })}</div>
                )}
                {allDecided ? (
                  <PixelButton variant="primary" size="sm" disabled={busy !== null} onClick={() => void run(k.id, () => window.cth.researchKeptDecide(k.id, willAsk ? 'again' : 'keep'))}>
                    {t('askMe.keptDone')}
                  </PixelButton>
                ) : (
                  <PixelButton variant="secondary" size="sm" disabled={busy !== null} onClick={() => void later()}>
                    {t('askMe.keptDoneForNow')}
                  </PixelButton>
                )}
              </div>
            </FoldBody>
          </section>
        );
      })}
    </>
  );
}
