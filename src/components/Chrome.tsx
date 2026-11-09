import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { shortNameOf } from '../config';
import { usePortal } from '../lib/portal-context';
import { petsa } from '../lib/format';
import { NATIONAL_URL, SOURCE_CODE_URL } from '../lib/links';

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

export function Masthead() {
  const { config } = usePortal();
  const { pathname, hash } = useLocation();
  return (
    <>
    {config.buildYourOwnStrip !== false && (
      // Above the masthead, so it scrolls away; a plain link to the source.
      <a className="build-strip" href={SOURCE_CODE_URL} target="_blank" rel="noopener">
        Gumawa ng ganitong portal para sa inyong lugar: {SOURCE_CODE_URL.replace(/^https:\/\//, '')}
      </a>
    )}
    <header className="masthead">
      <div className="page masthead-main">
        <Link to="/" className="masthead-title">
          {config.logo ? <img src={config.logo} alt="" className="masthead-logo" /> : <span className="masthead-mark" aria-hidden="true" />}
          <span>
            <span className="masthead-name">{shortNameOf(config)}</span>
            <span className="masthead-kicker">Saan napupunta ang pera para sa {config.name}?</span>
          </span>
        </Link>
        <a className="masthead-with" href="https://bettergov.ph" target="_blank" rel="noopener">
          <span className="masthead-with-label">Datos mula sa</span>
          <img src={BETTERGOV_LOGO} alt="BetterGov.ph" width="110" height="24" />
        </a>
      </div>
      <nav className="subnav" aria-label="Mga bahagi ng portal">
        <div className="page subnav-inner">
          {NAV.map((g) => (
            <div key={g.group ?? 'other'} className="subnav-group" role="group" aria-label={g.group ?? undefined}>
              {g.group && <span className="subnav-group-label" aria-hidden="true">{g.group}</span>}
              <span className="subnav-links">
                {g.links.map((n) => {
                  const active = pathname === n.to && (n.hash ? hash === n.hash : hash !== '#offices');
                  return (
                    <Link
                      key={n.label}
                      to={{ pathname: n.to, hash: n.hash }}
                      className={active ? 'active' : undefined}
                      aria-current={active ? 'page' : undefined}
                      // A link to the page already open, from further down it, goes back to the top.
                      onClick={() => !n.hash && pathname === n.to && window.scrollTo(0, 0)}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      </nav>
    </header>
    </>
  );
}

export function Footer() {
  const { config, scope, client } = usePortal();
  const meta = scope.status === 'ready' ? scope.value.meta : null;
  return (
    <footer className="footer">
      <div className="page footer-inner">
        <p className="footer-source">
          Pinagmulan: ang mungkahing badyet ng Pangulo (NEP) para sa 2027 at ang bersyon ng Kamara (House Bill 10858), mula sa
          BetterGov.ph Budget API{meta && <>. Huling na-update ang datos noong {petsa(meta.built_at)}</>}.
        </p>
        {meta && <p className="footer-notice" lang="en">{meta.notice}</p>}
        <ul className="footer-links">
          <li>
            <span className="label">Ang portal na ito</span>
            <span>
              {shortNameOf(config)}, pinapatakbo ng{' '}
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
            <span className="label">Lahat ng proyekto sa buong bansa</span>
            <a href={NATIONAL_URL} target="_blank" rel="noopener">budget.bettergov.ph ↗</a>
          </li>
          <li>
            <span className="label">Para sa mga developer</span>
            <a href={`${client.base}/docs`} target="_blank" rel="noopener">Budget API at MCP ↗</a>
          </li>
          <li>
            <span className="label">Open source</span>
            <a href={SOURCE_CODE_URL} target="_blank" rel="noopener">Gumawa ng portal para sa inyong LGU ↗</a>
          </li>
        </ul>
      </div>
    </footer>
  );
}

/** A page's opening: a short context line, the headline, and the plain-language answer under it. */
export function PageHead({ eyebrow, title, children }: { eyebrow: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <div className="lede">{children}</div>}
    </div>
  );
}
