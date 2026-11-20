import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AskOption, AskPart, PartAnswer } from '@shared/askMeRouting';
import { isComposingKey } from '@shared/imeGuard';
import { GrowingTextarea } from './GrowingTextarea';
import { FileText } from './FileChip';

/**
 * The answer fields on an Ask me card with options or several questions
 * (docs/designs/ask-me-options.md, DESIGN.md §7.8). Picking never sends:
 * Reply, on its own row under the card's box, does (D2, D3).
 */

type Who = { raisedBy?: string; assignee?: string };

/** A choice: one radio group of option rows. Nothing starts picked (4B);
 *  clicking the picked row again unpicks it. Arrows move and pick, Space picks
 *  (7A); Cmd or Ctrl+Enter sends through `onSend`. */
export function ChoiceRows({ options, pick, onPick, onSend, who }: {
  options: AskOption[];
  pick: number | undefined;
  onPick: (pick: number | undefined) => void;
  onSend: () => void;
  who: Who;
}) {
  const { t } = useTranslation();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const move = (to: number) => {
    const n = (to + options.length) % options.length;
    onPick(n);
    refs.current[n]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); return; }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onPick(pick === i ? undefined : i); }
  };
  return (
    <div role="radiogroup" aria-label={t('askMe.yourAnswer')} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
      {options.map((o, i) => {
        const on = pick === i;
        return (
          <div
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            role="radio"
            aria-checked={on}
            // One stop in the tab order: the picked row, else the first.
            tabIndex={on || (pick === undefined && i === 0) ? 0 : -1}
            onClick={(e) => {
              // A link or file chip inside the label does its own thing.
              if ((e.target as HTMLElement).closest('a, button')) return;
              onPick(on ? undefined : i);
            }}
            onKeyDown={(e) => onKey(e, i)}
            className={on ? 'cth-askme-opt is-on' : 'cth-askme-opt'}
          >
            <span className="cth-askme-dot" aria-hidden="true" />
            <span style={numStyle} aria-hidden="true">{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <FileText source={o.label} who={who} />
            </span>
            {o.recommended && <span style={recTag}>{t('askMe.recommended')}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Questions shown at once on a card (owner, 2026-11-19: seven at once was a
 *  lot to face, and one card filled the column). */
export const QUESTIONS_PER_PAGE = 3;

/** Several questions: each with its number, its text, its chips if it has
 *  options (a mixed ask, 8A) and a line to type. Any can be left blank (D1).
 *  Three at a time, with Previous and Next: answers stay as the page turns,
 *  and Reply sends what is filled in on every page. */
export function PartLines({ parts, answers, onChange, onSend, who }: {
  parts: AskPart[];
  answers: (PartAnswer | undefined)[];
  onChange: (answers: (PartAnswer | undefined)[]) => void;
  onSend: () => void;
  who: Who;
}) {
  const { t } = useTranslation();
  const set = (i: number, next: PartAnswer) => {
    const all = parts.map((_, j) => answers[j]);
    all[i] = next;
    onChange(all);
  };
  const pages = Math.max(1, Math.ceil(parts.length / QUESTIONS_PER_PAGE));
  const [page, setPage] = useState(0);
  const at = Math.min(page, pages - 1);
  const from = at * QUESTIONS_PER_PAGE;
  const shown = parts.slice(from, from + QUESTIONS_PER_PAGE);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
      {shown.map((p, k) => {
        const i = from + k;
        const a = answers[i] ?? {};
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '4px 6px' }}>
            <span style={{ ...numStyle, textAlign: 'end', paddingTop: 1 }} aria-hidden="true">{i + 1}</span>
            <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)', minWidth: 0 }}>
              <FileText source={p.q} who={who} />
            </div>
            {p.options && (
              <div role="group" aria-label={`${i + 1}. ${p.q}`} style={{ gridColumn: 2, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {p.options.map((o, k) => {
                  const on = a.chip === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set(i, { ...a, chip: on ? undefined : k })}
                      className={on ? 'cth-askme-chip is-on' : 'cth-askme-chip'}
                    >
                      {o.label}
                      {o.recommended && <span style={{ ...recTag, height: 16, lineHeight: '16px', fontSize: 10, padding: '0 6px', marginInlineStart: 5 }}>{t('askMe.recommended')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Grows with the answer, like the reply box below (owner, 2026-11-11:
                a one line field left no room for more than a line). */}
            <GrowingTextarea
              className="cth-input"
              value={a.text ?? ''}
              onChange={(e) => set(i, { ...a, text: e.target.value })}
              onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend(); } }}
              placeholder={p.options ? t('askMe.partOwn') : t('askMe.partAnswer')}
              aria-label={`${i + 1}. ${p.q}`}
              style={lineStyle}
            />
          </div>
        );
      })}
      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineStart: 26 }}>
          <span aria-live="polite" style={{ flex: 1, fontSize: 12, color: 'var(--cth-ink-3)' }}>
            {t('askMe.questionsShown', { from: from + 1, to: from + shown.length, total: parts.length })}
          </span>
          {at > 0 && <button type="button" onClick={() => setPage(at - 1)} style={pageBtn}>{t('askMe.questionsBack')}</button>}
          {at < pages - 1 && (
            <button type="button" onClick={() => setPage(at + 1)} style={{ ...pageBtn, color: 'var(--cth-ink)', fontWeight: 600 }}>
              {t('askMe.questionsNext', { count: Math.min(QUESTIONS_PER_PAGE, parts.length - from - shown.length) })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const pageBtn: CSSProperties = {
  height: 26, padding: '0 10px', border: 'none', borderRadius: 'var(--cth-r-pill)', background: 'var(--cth-neutral-soft)', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--cth-ink-2)'
};
const numStyle: CSSProperties = { /* style-guard: micro */ fontSize: 11, fontWeight: 600, color: 'var(--cth-ink-3)', lineHeight: '18px', flexShrink: 0 };
const recTag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', flexShrink: 0, height: 18, padding: '0 7px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-green-soft)', color: 'var(--cth-green-text)', fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap'
};
const lineStyle: CSSProperties = {
  gridColumn: 2, minWidth: 0, width: '100%', display: 'block', boxSizing: 'border-box', minHeight: 30, padding: '5px 9px', border: 'none', outline: 'none',
  background: 'var(--cth-card)', fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink)'
};
