/**
 * The exact text a draft is meant to post or send, as a box with its own Copy
 * (owner, 2026-11-10: Copy took the whole draft, notes and all, when only the
 * post was to go on LinkedIn). A member writes it as a fenced block tagged
 * `post`; it shows here in the page's own type, not code, and its Copy puts
 * that text on the clipboard exactly as written. The file tab's header Copy
 * takes this box when a page has exactly one (data-post-text).
 *
 * The button is the app's own control, so the page's Copy never pastes it
 * (fileTabCopy drops every button).
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { postCopy, postParagraphs } from '@/components/fileTabCopy';

export function PostBox({ text }: { text: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (): Promise<void> => {
    if (state === 'busy') return;
    setState('busy');
    let ok = false;
    try { ok = !!(await window.cth.copyRich(postCopy(text)))?.ok; } catch { ok = false; }
    setState(ok ? 'done' : 'error');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const words = [t('fileTab.copy'), t('fileTab.copied'), t('fileTab.copyFailed')];
  const shown = state === 'done' ? 1 : state === 'error' ? 2 : 0;
  return (
    <div className="cth-md-post" data-post-text={text}>
      <div className="cth-md-post-bar">
        <button type="button" className="cth-md-post-copy" onClick={() => void copy()} disabled={state === 'busy'} aria-label={t('markdown.copyPost')}>
          {/* All three words share one cell, so the button keeps the widest one's width. */}
          <span style={{ display: 'inline-grid' }}>
            {words.map((w, i) => <span key={i} style={{ gridArea: '1 / 1', visibility: i === shown ? 'visible' : 'hidden' }}>{w}</span>)}
          </span>
        </button>
        <span className="cth-sr-only" aria-live="polite">{state === 'done' ? words[1] : state === 'error' ? words[2] : ''}</span>
      </div>
      {postParagraphs(text).map((lines, i) => (
        <p key={i}>{lines.map((line, j) => <Fragment key={j}>{j > 0 && <br />}{line}</Fragment>)}</p>
      ))}
    </div>
  );
}
