import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { shortNameOf } from '../config';
import { usePortal } from '../lib/portal-context';
import { petsa } from '../lib/format';
import { NATIONAL_URL, SOURCE_CODE_URL } from '../lib/links';
import { ALL_PHOTOS, type Photo } from '../lib/photos';
import Picture from './Picture';

const BETTERGOV_LOGO = '/brand/bettergov-horizontal-primary.png';

/**
 * Two kinds of money, kept apart: the city government's own budget, and the
 * national budget's lines for Pasay. "About" stands outside both.
 */
const NAV: { group: string | null; links: { to: string; hash: string; label: string }[] }[] = [
  { group: 'Pera ng Lungsod', links: [{ to: '/lungsod', hash: '', label: 'Badyet ng Lungsod' }] },
  {
    group: 'Pera ng Nasyonal sa Pasay',
    links: [
      { to: '/', hash: '', label: 'Proyekto sa 2027' },
      { to: '/', hash: '#offices', label: 'DPWH sa Pasay' },
      { to: '/gaa', hash: '', label: 'Badyet 2020–2026' },
    ],
  },
  { group: null, links: [{ to: '/about', hash: '', label: 'Tungkol sa datos' }] },
];

function NavLinks({ onGo }: { onGo?: () => void }) {
  const { pathname, hash } = useLocation();
  return (
    <>
      {NAV.map((g) => (
        <div key={g.group ?? 'other'} className="nav-group" role="group" aria-label={g.group ?? undefined}>
          {g.group && <span className="nav-group-label" aria-hidden="true">{g.group}</span>}
          <span className="nav-links">
            {g.links.map((n) => {
              const active = pathname === n.to && (n.hash ? hash === n.hash : hash !== '#offices');
              return (
                <Link
                  key={n.label}
                  to={{ pathname: n.to, hash: n.hash }}
                  className="nav-link"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    // A link to the page already open, from further down it, goes back to the top.
                    if (!n.hash && pathname === n.to) window.scrollTo(0, 0);
                    onGo?.();
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </span>
        </div>
      ))}
    </>
  );
}

export function Masthead() {
  const { config } = usePortal();
  const { pathname, hash } = useLocation();
  // The menu belongs to the page it was opened on, so a new page closes it.
  const here = pathname + hash;
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === here;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((typeof next === 'function' ? next(open) : next) ? here : null);

  // An open menu holds the page still and closes on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null);
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('menu-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('menu-open');
    };
  }, [open]);

  return (
    <header className="nav">
      <div className="page nav-inner">
        <a className="skip-link" href="#nilalaman">Lumaktaw sa nilalaman</a>
        <Link to="/" className="brand" onClick={() => pathname === '/' && window.scrollTo(0, 0)}>
          {config.logo ? <img src={config.logo} alt="" className="brand-logo" /> : <span className="brand-mark" aria-hidden="true" />}
          <span className="brand-name">{shortNameOf(config)}</span>
        </Link>
        <nav className="nav-main" aria-label="Mga bahagi ng portal">
          <NavLinks />
        </nav>
        <a className="nav-with" href="https://bettergov.ph" target="_blank" rel="noopener">
          <span className="nav-with-label">Datos mula sa</span>
          <img src={BETTERGOV_LOGO} alt="BetterGov.ph" width="110" height="24" />
        </a>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="nav-sheet"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="nav-toggle-bars" aria-hidden="true" />
          {open ? 'Isara' : 'Menu'}
        </button>
      </div>
      <div id="nav-sheet" className="nav-sheet" hidden={!open}>
        <nav className="page" aria-label="Mga bahagi ng portal (menu)">
          <NavLinks onGo={() => setOpen(false)} />
          <a className="nav-sheet-with" href="https://bettergov.ph" target="_blank" rel="noopener">
            <span>Datos mula sa</span>
            <img src={BETTERGOV_LOGO} alt="BetterGov.ph" width="110" height="24" />
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  const { config, scope, client } = usePortal();
  const meta = scope.status === 'ready' ? scope.value.meta : null;
  const name = shortNameOf(config);
  return (
    <footer className="footer">
      <div className="page">
        {config.buildYourOwnStrip !== false && (
          <div className="footer-close">
            <h2 className="footer-close-h">
              Gumawa ng ganitong portal para sa inyong lugar. <span>Libre at bukas ang code.</span>
            </h2>
            <a className="button button-primary button-lg" href={SOURCE_CODE_URL} target="_blank" rel="noopener">
              Kunin ang code sa GitHub <Arrow />
            </a>
          </div>
        )}

        <div className="footer-dir">
          <div className="footer-about">
            <Link to="/" className="brand brand-footer">
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-name">{name}</span>
            </Link>
            <p className="footer-source">
              Pinagmulan: ang mungkahing badyet ng Pangulo (NEP) para sa 2027 at ang bersyon ng Kamara (House Bill 10858), mula
              sa BetterGov.ph Budget API{meta && <>. Huling na-update ang datos noong {petsa(meta.built_at)}</>}.
            </p>
          </div>
          <ul className="footer-links">
            <li>
              <h3 className="footer-h">Ang portal na ito</h3>
              <span>
                {name}, pinapatakbo ng{' '}
                {config.operator.url ? (
                  <a href={config.operator.url} target="_blank" rel="noopener">{config.operator.name}</a>
                ) : (
                  config.operator.name
                )}
                {config.operator.email && (
                  <>. <a href={`mailto:${config.operator.email}`}>{config.operator.email}</a></>
                )}
              </span>
            </li>
            <li>
              <h3 className="footer-h">Buong bansa</h3>
              <a href={NATIONAL_URL} target="_blank" rel="noopener">budget.bettergov.ph ↗</a>
            </li>
            <li>
              <h3 className="footer-h">Para sa mga developer</h3>
              <a href={`${client.base}/docs`} target="_blank" rel="noopener">Budget API at MCP ↗</a>
            </li>
            <li>
              <h3 className="footer-h">Open source</h3>
              <a href={SOURCE_CODE_URL} target="_blank" rel="noopener">Ang code ng portal ↗</a>
            </li>
          </ul>
        </div>

        <div className="footer-legal">
          {meta && <p className="footer-notice" lang="en">{meta.notice}</p>}
          <Credits photos={ALL_PHOTOS} />
        </div>
      </div>
    </footer>
  );
}

/** The one credits line for the photographs, opening to each one's maker and licence. */
function Credits({ photos }: { photos: Photo[] }) {
  return (
    <details className="credits">
      <summary>Mga larawan mula sa Wikimedia Commons, sa ilalim ng kani-kanilang lisensiya</summary>
      <ul>
        {photos.map((p) => (
          <li key={p.src}>
            <a href={p.page} target="_blank" rel="noopener">{p.alt}</a>, kuha ni {p.by} ({p.licence})
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Arrow() {
  return (
    <svg className="arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A page's opening: a short context line, the headline, the plain-language answer under it, and the place it is about. */
export function PageHead({
  eyebrow,
  title,
  children,
  photo,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  photo?: Photo;
}) {
  return (
    <div className={`page-head${photo ? ' page-head-photo' : ''}`} data-enter>
      <div className="page-head-text">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <div className="lede">{children}</div>}
      </div>
      {photo && <Picture photo={photo} sizes="(max-width: 1023px) 100vw, 40vw" eager className="page-head-frame" />}
    </div>
  );
}
