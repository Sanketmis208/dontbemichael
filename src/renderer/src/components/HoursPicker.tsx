import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { EVERY_DAY_9_TO_5, NOT_SET, WEEKDAYS_9_TO_5, formatHours, guessHours, parseHours, type WeekHours } from '@shared/businessHours';

/**
 * Business hours, set by day (owner, 2026-11-19: typing them freely was hard).
 * Two presets, then each day open or closed with the system's own time pickers.
 * It saves the one line every agent reads (shared/businessHours.ts). Hours in
 * any other form, typed by hand or written by an agent, show as text and are
 * kept until the owner changes a day; "Type them instead" is there for hours a
 * week cannot say.
 *
 * Hours not set show every day closed and "Not set yet", never a preset: a
 * week shown but not saved read as set, in setup and in Settings, while agents
 * read nothing and asked for the hours (owner, 2026-11-20).
 */
export function HoursPicker({ value, onChange, inputClassName, inputStyle }: {
  value: string | undefined;
  onChange: (hours: string | undefined) => void;
  inputClassName?: string;
  inputStyle?: CSSProperties;
}) {
  const { t, i18n } = useTranslation();
  const parsed = useMemo(() => parseHours(value), [value]);
  const [mode, setMode] = useState<'week' | 'text'>(() => (!value?.trim() || parsed ? 'week' : 'text'));
  // Starts from the saved hours, or a best guess at typed ones (never saved by
  // itself), else no day open: what is shown is what is saved.
  const [week, setWeek] = useState<WeekHours>(() => parsed ?? guessHours(value) ?? NOT_SET);

  // Hours saved from elsewhere (a foundation answer) come in as they are.
  useEffect(() => {
    if (parsed && formatHours(week) !== value) setWeek(parsed);
    else if (!value?.trim() && formatHours(week)) setWeek(NOT_SET);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Day names in the app's language, Monday first.
  const dayNames = useMemo(() => {
    try {
      const f = new Intl.DateTimeFormat(i18n.language, { weekday: 'long' });
      return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 10, 16 + i)));
    } catch {
      return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    }
  }, [i18n.language]);

  const save = (next: WeekHours): void => { setWeek(next); onChange(formatHours(next)); };
  const setDay = (i: number, d: WeekHours[number]): void => save(week.map((x, j) => (j === i ? d : x)));

  if (mode === 'text') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : undefined)}
          placeholder={t('companyProfile.hoursPlaceholder')}
          aria-label={t('companyProfile.hours')}
          className={inputClassName}
          style={inputStyle}
        />
        <button type="button" onClick={() => { setWeek(parsed ?? guessHours(value) ?? NOT_SET); setMode('week'); }} style={linkButton}>{t('companyProfile.hoursByDay')}</button>
      </div>
    );
  }

  const chip = (label: string, preset: WeekHours) => {
    const on = formatHours(preset) === formatHours(week) && formatHours(week) === value;
    return (
      <button type="button" aria-pressed={on} onClick={() => save(preset.map((d) => (d ? { ...d } : null)))}
        style={{ ...chipStyle, boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${on ? 'var(--cth-ink)' : 'var(--cth-line-2)'}`, fontWeight: on ? 600 : 500 }}>
        {label}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {chip(t('companyProfile.hoursWeekdays'), WEEKDAYS_9_TO_5)}
        {chip(t('companyProfile.hoursEveryDay'), EVERY_DAY_9_TO_5)}
      </div>
      <div role="group" aria-label={t('companyProfile.hours')} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {week.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34 }}>
            <span style={{ width: 96, flexShrink: 0, fontSize: 13, color: 'var(--cth-ink)' }}>{dayNames[i]}</span>
            <button
              type="button"
              aria-pressed={!!d}
              aria-label={t(d ? 'companyProfile.hoursOpenAria' : 'companyProfile.hoursClosedAria', { day: dayNames[i] })}
              onClick={() => setDay(i, d ? null : (week.find((x) => x) ?? { open: '09:00', close: '17:00' }))}
              style={{ ...toggle, background: d ? 'var(--cth-green-soft)' : 'var(--cth-neutral-soft)', color: d ? 'var(--cth-green-text)' : 'var(--cth-ink-3)' }}
            >
              {d ? t('companyProfile.hoursOpen') : t('companyProfile.hoursClosed')}
            </button>
            {d && (
              <>
                <input type="time" step={900} value={d.open} onChange={(e) => e.target.value && setDay(i, { ...d, open: e.target.value })}
                  aria-label={t('companyProfile.hoursFrom', { day: dayNames[i] })} className={inputClassName} style={{ ...inputStyle, width: 140 }} />
                <span style={{ fontSize: 12.5, color: 'var(--cth-ink-3)' }}>{t('companyProfile.hoursTo')}</span>
                <input type="time" step={900} value={d.close} onChange={(e) => e.target.value && setDay(i, { ...d, close: e.target.value })}
                  aria-label={t('companyProfile.hoursUntil', { day: dayNames[i] })} className={inputClassName} style={{ ...inputStyle, width: 140 }} />
              </>
            )}
          </div>
        ))}
      </div>
      {!value?.trim() && <span style={{ fontSize: 12, color: 'var(--cth-ink-3)' }}>{t('companyProfile.hoursNotSet')}</span>}
      {value && !parsed && (
        // Typed or written elsewhere: kept until a day here is changed.
        <span style={{ fontSize: 12, color: 'var(--cth-ink-3)' }}>{t('companyProfile.hoursKept', { hours: value })}</span>
      )}
      <button type="button" onClick={() => setMode('text')} style={linkButton}>{t('companyProfile.hoursTypeInstead')}</button>
    </div>
  );
}

const chipStyle: CSSProperties = {
  height: 28, padding: '0 12px', border: 'none', borderRadius: 'var(--cth-r-pill)', background: 'var(--cth-card)', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, color: 'var(--cth-ink)'
};
const toggle: CSSProperties = {
  width: 72, height: 26, flexShrink: 0, border: 'none', borderRadius: 'var(--cth-r-pill)', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600
};
const linkButton: CSSProperties = {
  alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, color: 'var(--cth-ink-3)', textDecoration: 'underline'
};
