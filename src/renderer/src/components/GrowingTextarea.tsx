import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * A textarea that grows with what is typed, from one line up to `maxHeight`,
 * then scrolls (owner, 2026-10-01: the Ask me reply box stayed small, so a
 * longer answer was hard to write). It re-measures when its width changes,
 * since the right column can be resized.
 *
 * While empty it grows to its placeholder too (owner, 2026-11-05: a two line
 * hint was cut off with no way to read it; docs/designs/ask-me-answer-box.md).
 * The placeholder is measured on a hidden copy of the box at the same width,
 * never by writing into the box's own value.
 */
export const GrowingTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeight?: number }>(
  function GrowingTextarea({ maxHeight = 160, value, style, ...rest }, outer) {
    const ref = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(outer, () => ref.current as HTMLTextAreaElement);

    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const fit = () => {
        el.style.height = 'auto';
        let full = el.scrollHeight;
        if (!el.value && el.placeholder && el.parentNode) {
          const probe = el.cloneNode(false) as HTMLTextAreaElement;
          probe.removeAttribute('id');
          probe.removeAttribute('name');
          probe.setAttribute('aria-hidden', 'true');
          probe.tabIndex = -1;
          probe.value = el.placeholder;
          Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', top: '0', left: '-10000px', height: 'auto', width: `${el.offsetWidth}px` });
          el.parentNode.appendChild(probe);
          full = Math.max(full, probe.scrollHeight);
          probe.remove();
        }
        el.style.height = `${Math.min(full, maxHeight)}px`;
        el.style.overflowY = full > maxHeight ? 'auto' : 'hidden';
      };
      fit();
      let width = el.clientWidth;
      const ro = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
      ro.observe(el);
      return () => ro.disconnect();
    }, [value, maxHeight, rest.placeholder]);

    return <textarea ref={ref} rows={1} value={value} style={{ resize: 'none', ...style }} {...rest} />;
  }
);
