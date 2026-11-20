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
 * this allow list"; shared/researchKept.ts). Each kept back piece, with Always
 * allow (it goes on the business's Always allowed list, as in Settings);
 * Ask again sends the question once more through the check with the list as
 * it is now; Keep private closes the card.
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
        const anyAllowed = k.parts.some(isAllowed);
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
                  return (
                    <li key={part} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--cth-r-md)', background: 'var(--cth-neutral-soft)' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'var(--cth-font-mono)', color: 'var(--cth-ink)', overflowWrap: 'anywhere' }}>{part}</span>
                      {on ? (
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--cth-green-text)', flexShrink: 0 }}>{t('askMe.keptAllowed')}</span>
                      ) : (
                        <PixelButton variant="secondary" size="sm" disabled={busy !== null}
                          onClick={() => void run(`${k.id}:${part}`, () => window.cth.researchAllow(part))}
                          aria-label={t('askMe.keptAllowAria', { part })}>
                          {t('askMe.keptAllow')}
                        </PixelButton>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-2)' }}>{t('askMe.keptHint', { research: researchName })}</div>
              {failed?.startsWith(k.id) && (
                <div role="alert" style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-coral-text)' }}>{t('askMe.keptFailed')}</div>
              )}
              <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                <PixelButton variant="secondary" size="sm" disabled={busy !== null} onClick={() => void run(k.id, () => window.cth.researchKeptDecide(k.id, 'keep'))}>
                  {t('askMe.keptKeep')}
                </PixelButton>
                <PixelButton variant="primary" size="sm" disabled={busy !== null || !anyAllowed} onClick={() => void run(k.id, () => window.cth.researchKeptDecide(k.id, 'again'))}>
                  {t('askMe.keptAgain')}
                </PixelButton>
              </div>
            </FoldBody>
          </section>
        );
      })}
    </>
  );
}
