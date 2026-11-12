import { useEffect, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { OfficeDepartment } from '@shared/officeRoles';
import { family } from '@/scene/studio/theme';

/**
 * The Ask me board's department row (docs/designs/ask-me-department-colors.md;
 * DESIGN.md 7.8): one chip per department with a card on the board, in the
 * order the departments first appear. A chip shows only that department's
 * cards; the line under the row says how many cards are shown while one is
 * picked. The row sticks to the top of the board and, since the column has no
 * ground of its own (DESIGN.md 7.6), sits on its own card surface.
 *
 * Chips are the Tasks view's count chip (7.20) at the desktop 28 px target:
 * the department wash, a 6 px key in its accent, the name and a mono count;
 * picked is the department `m` fill, a 2 px accent ring and weight 600. A dot
 * marks a department whose card arrived while another was picked.
 */
export function AskMeDepartmentRow({ departments, counts, picked, fresh, shown, total, dark, onPick, onShowAll, onHeight }: {
  departments: readonly OfficeDepartment[];
  counts: Partial<Record<OfficeDepartment, number>>;
  picked: OfficeDepartment | null;
  fresh: ReadonlySet<OfficeDepartment>;
  shown: number;
  total: number;
  dark: boolean;
  onPick: (dept: OfficeDepartment) => void;
  onShowAll: () => void;
  /** The row's height as drawn, so the board can keep focused cards clear of it. */
  onHeight: (px: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onHeight(el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => { ro.disconnect(); onHeight(0); };
  }, [onHeight]);
  return (
    <div ref={ref} data-askme-department-row style={row}>
      <div role="group" aria-label={t('askMe.deptFilter')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {departments.map((d) => {
          const fam = family(d, dark);
          const on = picked === d;
          const name = t(`studio.dept.${d}`);
          const isNew = fresh.has(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={isNew ? `${t('askMe.deptNew', { dept: name })}, ${counts[d] ?? 0}` : undefined}
              onClick={() => onPick(d)}
              style={{
                ...chip,
                background: on ? fam.m : fam.wash,
                boxShadow: on ? `inset 0 0 0 2px ${fam.acc}` : 'inset 0 0 0 1px var(--cth-line)',
                fontWeight: on ? 600 : 500,
                color: on ? 'var(--cth-ink)' : 'var(--cth-ink-2)'
              }}
            >
              <i style={{ width: 6, height: 6, borderRadius: 2, background: fam.acc, display: 'block' }} />
              {name}
              <b style={{ fontFamily: 'var(--cth-font-mono)', fontWeight: 600 }}>{counts[d] ?? 0}</b>
              {isNew && <span aria-hidden="true" style={{ ...dot, background: fam.acc }} />}
            </button>
          );
        })}
      </div>
      {picked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-3)' }}>
          <span>{t('askMe.showing', { shown, total })}</span>
          <button type="button" onClick={onShowAll} style={showAll}>{t('askMe.showAll')}</button>
        </div>
      )}
    </div>
  );
}

const row: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 2, flexShrink: 0,
  padding: '8px 10px', borderRadius: 'var(--cth-r-xl)', background: 'var(--cth-card)',
  boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-sm)'
};
const chip: CSSProperties = {
  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px',
  borderRadius: 'var(--cth-r-pill)', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 11.5
};
const dot: CSSProperties = {
  position: 'absolute', top: 2, insetInlineEnd: 3, width: 7, height: 7, borderRadius: '50%',
  boxShadow: '0 0 0 1.5px var(--cth-card)'
};
const showAll: CSSProperties = {
  padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-indigo-text)'
};
