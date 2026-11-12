import type { CSSProperties, ReactNode } from 'react';

/**
 * Folding for the Ask me cards that are not questions: mail approvals,
 * schedule changes and Work style updates (owner, 2026-11-05). They join the
 * board's one open card rule (DESIGN.md 7.8): folded, a card shows its title
 * and a line or two; open, everything. The board owns which card is open; a
 * card only reports clicks, and focus inside its body pins it open, so a newer
 * card arriving never folds it mid edit.
 *
 * A folded card hides its body instead of dropping it, so typed edits and a
 * running review survive folding.
 */
export interface FoldControl {
  open: boolean;
  /** Open it, or fold it when it is open. */
  toggle: () => void;
  /** Keep it open: focus went into its body. */
  pin: () => void;
}

/** The card frame: the plain card, `line-2` ring and `shadow-md` when open. */
export function foldCardStyle(open: boolean, hide: boolean): CSSProperties {
  return {
    position: 'relative', flexShrink: 0, padding: '12px 14px', borderRadius: 'var(--cth-r-xl)',
    background: 'var(--cth-card)',
    boxShadow: open ? 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-md)' : 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)',
    display: hide ? 'none' : 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--cth-font-ui)'
  };
}

/** The class the board's hover and focus rules read. */
export function foldCardClass(open: boolean): string {
  return open ? 'cth-askme-card is-open' : 'cth-askme-card';
}

/** The header that folds and opens the card: the title row, the summary while
 *  folded, and the chevron. Enter and Space work like a click. */
export function FoldHeader({ open, toggle, title, summary }: { open: boolean; toggle: () => void; title: ReactNode; summary: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        className="cth-askme-head"
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        {title}
        {!open && (
          <div dir="auto" style={{
            marginTop: 7, fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)', overflowWrap: 'anywhere',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
          }}>{summary}</div>
        )}
      </div>
      <span
        aria-hidden="true"
        onClick={toggle}
        className="cth-askme-chevron"
        style={{ flexShrink: 0, marginTop: -3, marginInlineEnd: -5, width: 24, height: 24, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', color: 'var(--cth-ink-3)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 160ms var(--cth-ease)' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}

/** The body: shown while open, hidden (still mounted) while folded. Focus in it
 *  pins the card open. */
export function FoldBody({ open, pin, children }: { open: boolean; pin: () => void; children: ReactNode }) {
  return (
    <div onFocusCapture={pin} style={{ display: open ? 'flex' : 'none', flexDirection: 'column', gap: 8 }}>
      {children}
    </div>
  );
}

/** Without a board to fold it (no `fold` given), a card stays open. */
export const ALWAYS_OPEN: FoldControl = { open: true, toggle: () => {}, pin: () => {} };
