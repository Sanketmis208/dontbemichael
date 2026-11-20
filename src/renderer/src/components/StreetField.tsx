import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompanyAddress } from '@shared/companyProfile';
import { MIN_ADDRESS_QUERY, type AddressSuggestion } from '@shared/photon';

/**
 * The company's street, with address suggestions as it is typed
 * (src/shared/photon.ts: OpenStreetMap through Photon, free, no key). Picking
 * one fills the street, city, region, postal code and country; every field
 * stays editable. With no answer (offline, a slow or busy service) it is a
 * plain text field, as before.
 *
 * An ARIA combobox: arrow keys move through the list, Enter picks, Esc closes.
 */
export function StreetField({ value, onType, onPick, placeholder, invalid, className, style }: {
  value: string;
  onType: (v: string) => void;
  onPick: (address: CompanyAddress) => void;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const { t, i18n } = useTranslation();
  const listId = useId();
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const focused = useRef(false);
  const latest = useRef(value);
  latest.current = value;

  // Ask a moment after typing stops, and only while the field is in use; an
  // answer for text that has changed since is dropped.
  useEffect(() => {
    const q = value.trim();
    if (!focused.current || q.length < MIN_ADDRESS_QUERY) { setOptions([]); return; }
    const timer = setTimeout(() => {
      void window.cth.suggestAddress?.(q, i18n.language)
        .then((res) => {
          if (latest.current.trim() !== q || !focused.current) return;
          const list = res.ok ? res.suggestions ?? [] : [];
          setOptions(list);
          setActive(-1);
          setOpen(list.length > 0);
        })
        .catch(() => { /* no suggestions this time */ });
    }, 350);
    return () => clearTimeout(timer);
  }, [value, i18n.language]);

  const pick = (s: AddressSuggestion): void => {
    onPick(s.address);
    setOpen(false);
    setOptions([]);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? options.length - 1 : a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  const shown = open && options.length > 0;
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; setTimeout(() => setOpen(false), 120); }}
        onKeyDown={onKey}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-required
        aria-invalid={invalid}
        autoComplete="off"
        className={className}
        style={style}
      />
      {shown && (
        <div style={listBox}>
          <ul id={listId} role="listbox" aria-label={t('companyProfile.suggestions')} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {options.map((s, i) => (
              <li
                key={s.label}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Picked on mouse down, before the field's blur closes the list.
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActive(i)}
                style={{ ...optionStyle, background: i === active ? 'var(--cth-neutral-soft)' : 'transparent' }}
              >
                {s.label}
              </li>
            ))}
          </ul>
          {/* OpenStreetMap's data is under the ODbL: say where suggestions come from. */}
          <div style={{ padding: '4px 10px 2px', fontSize: 11, color: 'var(--cth-ink-3)' }}>{t('companyProfile.fromOsm')}</div>
        </div>
      )}
    </div>
  );
}

const listBox: CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 50, padding: 4,
  background: 'var(--cth-card)', borderRadius: 'var(--cth-r-md)', boxShadow: 'inset 0 0 0 1px var(--cth-line), var(--cth-shadow-lg)'
};
const optionStyle: CSSProperties = {
  padding: '7px 10px', borderRadius: 'var(--cth-r-sm)', cursor: 'pointer', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink)'
};
