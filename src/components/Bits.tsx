import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { BridgeGroup, Disclaimer } from '../api/types';
import type { Async } from '../lib/portal-context';
import { usePortal } from '../lib/portal-context';
import { GROUPS } from '../lib/salita';
import type { Reason } from '../lib/scope';

/**
 * A small (i) after a word, opening its definition: on hover or keyboard
 * focus, and on a tap for touch screens. Escape or a tap elsewhere closes it.
 * `align="end"` opens the bubble leftward, for right-aligned columns.
 */
export function Info({ term, children, align }: { term: string; children: ReactNode; align?: 'end' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  return (
    <span ref={ref} className={`info${open ? ' open' : ''}${align === 'end' ? ' info-end' : ''}`}>
      <button type="button" className="info-btn" aria-label={`Ano ang ${term}?`} aria-describedby={id} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">i</span>
      </button>
      <span role="tooltip" id={id} className="info-bubble">{children}</span>
    </span>
  );
}

/** The status in Tagalog, with the group's colour; the API's own wording is the tooltip. */
export function StatusChip({ group, label, held }: { group: BridgeGroup; label: string; held?: boolean }) {
  return (
    <span className="status" title={label}>
      <span className={`status-dot g-${group}`} aria-hidden="true" />
      <span>{GROUPS[group].label}</span>
      {held && (
        <span className="tag tag-warn" title="Hindi pa tiyak kung iisang proyekto ang dalawang linya: malabo o may iba pang kahawig.">
          hindi pa tiyak na pares
        </span>
      )}
    </span>
  );
}

export function ReasonTags({ reasons }: { reasons: Reason[] }) {
  return (
    <span className="reasons">
      {reasons.map((r) => (
        <span
          key={r.kind + r.label}
          className={`tag ${r.kind === 'office' ? 'tag-office' : 'tag-place'}`}
          title={r.kind === 'office' ? `Nakalista sa ilalim ng ${r.label}` : `Binabanggit ng pangalan ang ${r.label}`}
        >
          {r.kind === 'office' ? 'opisina ng DPWH' : `binabanggit ang ${r.label}`}
        </span>
      ))}
    </span>
  );
}

/** The API's disclaimers, verbatim: printed from the response, so the wording cannot drift. They stay in English. */
export function Disclaimers({ items, compact }: { items: Disclaimer[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <aside className={`disclaimers${compact ? ' compact' : ''}`} aria-labelledby="disclaimers-h">
      <p id="disclaimers-h" className="disclaimers-h">Paalala mula sa pinagkunan ng datos (nasa Ingles)</p>
      {items.map((d) => (
        <p key={d.id} lang="en">
          <strong>{d.title}</strong> {d.body}{' '}
          <a href={d.restrictions_url ?? d.url} target="_blank" rel="noopener">
            Read more ↗
          </a>
        </p>
      ))}
    </aside>
  );
}

/** Render `ready`, or a loading line, or the error with a retry. `what` is in Tagalog: "ang mga proyekto". */
export function Await<T>({ state, children, what }: { state: Async<T>; children: (value: T) => ReactNode; what: string }) {
  const { retry } = usePortal();
  if (state.status === 'ready') return <>{children(state.value)}</>;
  if (state.status === 'loading') {
    return (
      <div className="state" role="status">
        <span className="spinner" aria-hidden="true" /> Kinukuha {what}…
      </div>
    );
  }
  return (
    <div className="state state-error" role="alert">
      <p>
        <strong>Hindi makuha {what}.</strong> Baka mabagal o putol ang koneksiyon. <span lang="en">({state.error.message})</span>
      </p>
      <button type="button" className="button" onClick={retry}>
        Subukang muli
      </button>
    </div>
  );
}

export function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener">
      {children}&nbsp;<span aria-hidden="true">↗</span>
    </a>
  );
}
