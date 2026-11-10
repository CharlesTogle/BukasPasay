import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import type { BridgeGroup, DatasetInfo, Disclaimer } from '../api/types';
import { BRIDGE_GROUPS } from '../api/types';
import { shortNameOf, type DatasetKey } from '../config';
import { Await, Disclaimers, Info, ReasonTags, StatusChip } from '../components/Bits';
import { Arrow } from '../components/Chrome';
import Picture from '../components/Picture';
import OfficesSection from '../components/OfficesSection';
import { projectsCsv, downloadText } from '../lib/csv';
import { bilang, count, piso, pisoDelta } from '../lib/format';
import { usePortal } from '../lib/portal-context';
import { DIFF, GROUPS, HOUSE, KAMARA_HELP, NEP } from '../lib/salita';
import { summarise, type ScopedProject, type ScopeResult, type Summary } from '../lib/scope';
import { useTitle } from '../lib/use-title';
import { PHOTOS } from '../lib/photos';

/** The hero enters once a visit, not on every return to this page. */
let entered = false;

const PAGE = 100;

type Sort = 'house' | 'nep' | 'change' | 'title';
const SORTS: Record<Sort, { label: string; cmp: (a: ScopedProject, b: ScopedProject) => number }> = {
  house: { label: 'Halaga sa Kamara', cmp: (a, b) => (b.house_php ?? -1) - (a.house_php ?? -1) },
  nep: { label: 'Halaga sa mungkahi ng Pangulo', cmp: (a, b) => (b.nep_php ?? -1) - (a.nep_php ?? -1) },
  change: { label: 'Laki ng pagbabago', cmp: (a, b) => Math.abs(b.delta_php ?? 0) - Math.abs(a.delta_php ?? 0) },
  title: { label: 'Pangalan', cmp: (a, b) => a.title.localeCompare(b.title) },
};

export default function Home() {
  const { scope, overview, config } = usePortal();
  useTitle(`Mga proyekto sa 2027 · ${shortNameOf(config)}`);
  const datasets = overview.status === 'ready' ? overview.value.data.datasets : [];
  const placeName = config.scope.places?.[0]?.label ?? shortNameOf(config);
  const programName = (k: DatasetKey) => datasets.find((d) => d.key === k)?.short ?? k.toUpperCase();
  const summary = useMemo(() => (scope.status === 'ready' ? summarise(scope.value.projects) : null), [scope]);
  const [enter] = useState(() => !entered);
  useEffect(() => { entered = true; }, []);
  return (
    <main id="nilalaman" className="main main-home">
      <section className="hero" aria-labelledby="how-much-h" data-enter={enter ? '' : undefined}>
        <div className="page hero-grid">
          <div className="hero-text">
            <p className="eyebrow">Pera ng Nasyonal sa {placeName} · Panukalang badyet 2027</p>
            <h1 id="how-much-h" className="hero-h">
              <span className="hero-line"><span className="hero-q">Magkano ang para sa {placeName} sa 2027?</span></span>
              <span className="hero-line">
                <span className="hero-a">
                  {summary ? (
                    <>{piso(summary.house.php)}, para sa {bilang(summary.house.rows, 'proyekto')}.</>
                  ) : scope.status === 'error' ? (
                    'Hindi pa makuha ang sagot.'
                  ) : (
                    <span className="hero-wait">Binibilang pa…</span>
                  )}
                </span>
              </span>
            </h1>
            {summary && <HowMuch summary={summary} programName={programName} />}
            <div className="hero-actions">
              <a className="button button-primary button-lg" href="#mine">Hanapin ang barangay ko <Arrow /></a>
              <a className="button button-lg" href="#projects">Tingnan ang mga proyekto</a>
            </div>
          </div>
          <Picture photo={PHOTOS.roxas} sizes="(max-width: 1023px) 100vw, 46vw" eager className="hero-frame" />
        </div>
      </section>

      <Await state={scope} what="ang mga proyekto">
        {(s) => <Projects scope={s} datasets={datasets} />}
      </Await>
    </main>
  );
}

function Projects({ scope, datasets }: { scope: ScopeResult; datasets: DatasetInfo[] }) {
  const { config, districts } = usePortal();
  const { hash } = useLocation();

  // #offices and #projects links land on their section once it has rendered.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [hash, districts.status]);

  // The disclaimers of every response on this page: the project lists' and the districts'.
  const disclaimers = useMemo(() => {
    const byId = new Map<string, Disclaimer>(scope.disclaimers.map((d) => [d.id, d]));
    if (districts.status === 'ready') for (const env of districts.value) for (const d of env.disclaimers) if (!byId.has(d.id)) byId.set(d.id, d);
    return [...byId.values()];
  }, [scope.disclaimers, districts]);
  const all = scope.projects;
  const summary = useMemo(() => summarise(all), [all]);
  const programName = (k: DatasetKey) => datasets.find((d) => d.key === k)?.short ?? k.toUpperCase();

  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const program = (params.get('program') ?? '') as DatasetKey | '';
  const status = (params.get('status') ?? '') as BridgeGroup | '';
  const why = params.get('why') ?? '';
  const office = params.get('office') ?? '';
  const sort = (params.get('sort') as Sort) in SORTS ? (params.get('sort') as Sort) : 'house';
  const [shown, setShown] = useState(PAGE);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setShown(PAGE);
  };

  // DPWH offices among the rows, largest first, for the Office filter.
  const offices = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of all) if (p.office) n.set(p.office, (n.get(p.office) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { numeric: true }));
  }, [all]);

  const reasons = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of all) for (const r of p.reasons) seen.set(`${r.kind}:${r.label}`, r.kind === 'office' ? `Opisina: ${shortOffice(r.label)}` : `Binabanggit ang ${r.label}`);
    return [...seen.entries()];
  }, [all]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = all.filter((p) => {
      if (program && p.dataset !== program) return false;
      if (status && p.bridge_group !== status) return false;
      if (why && !p.reasons.some((r) => `${r.kind}:${r.label}` === why)) return false;
      if (office && p.office !== office) return false;
      if (words.length) {
        const hay = [p.title, p.program, p.pap, p.office, p.region].join(' ').toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    return rows.sort((a, b) => SORTS[sort].cmp(a, b) || a.title.localeCompare(b.title));
  }, [all, q, program, status, why, office, sort]);
  const filteredSummary = useMemo(() => summarise(filtered), [filtered]);
  const narrowed = filtered.length !== all.length;

  // What the barangay search finds, said under the box as the reader types.
  const asked = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    return all.filter((p) => {
      const hay = [p.title, p.program, p.pap, p.office, p.region].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [all, q]);
  return (
    <>
      <section className="band band-wash" aria-labelledby="groups-h">
        <div className="page">
        <h2 id="groups-h" className="section-h">Ano ang binago ng Kongreso?</h2>
        <p className="section-lede">
          Ikinumpara namin ang mungkahi ng Pangulo sa bersyon ng Kamara. {bilang(summary.groups.house_only.rows, 'proyekto')} ang
          nasa Kamara lang, at {bilang(summary.groups.nep_only.rows, 'proyekto')} ang nasa mungkahi lang ng Pangulo. Kailangan pang
          suriin ang mga ito: hindi pa tiyak na idinagdag o tinanggal. Pindutin ang isa para makita ang mga proyekto nito.
        </p>
        <div className="groups" role="group" aria-label="Salain ayon sa binago">
          {BRIDGE_GROUPS.map((g) => {
            const cell = summary.groups[g];
            const words = GROUPS[g];
            const active = status === g;
            return (
              <button
                key={g}
                type="button"
                className={`group-tile${active ? ' active' : ''}`}
                disabled={!cell.rows}
                aria-pressed={active}
                title={words.help}
                onClick={() => {
                  setParam('status', active ? '' : g);
                  if (!active) document.getElementById('projects')?.scrollIntoView({ block: 'start' });
                }}
              >
                <span className="group-label"><span className={`status-dot g-${g}`} aria-hidden="true" />{words.label}</span>
                <span className="group-sub">{words.sub}</span>
                <span className="group-figs">
                  <span className="group-count num">{bilang(cell.rows, 'proyekto')}</span>
                  <span className="group-php num">{groupAmount(g, cell)}</span>
                </span>
              </button>
            );
          })}
        </div>
        </div>
      </section>

      <section className="band" id="mine" aria-labelledby="mine-h">
        <div className="page split">
          <div className="ask">
            <h2 id="mine-h" className="section-h">Kasama ba ang barangay ko?</h2>
            <label className="ask-field">
              <span className="ask-label">I-type ang barangay, kalye, paaralan, o opisina</span>
              <input type="search" value={q} placeholder="Hal. Barangay 76, EDSA, Libertad" onChange={(e) => setParam('q', e.target.value)} />
            </label>
            <p className="ask-result" role="status">
              {asked == null ? (
                <>Hinahanap namin ang salita sa pangalan ng bawat isa sa {bilang(all.length, 'proyekto')}.</>
              ) : asked.length ? (
                <>
                  <strong>{bilang(asked.length, 'proyekto')}</strong> ang bumabanggit sa “{q.trim()}”.{' '}
                  <a href="#projects">Tingnan sa listahan</a>
                </>
              ) : (
                <>Walang proyektong bumabanggit sa “{q.trim()}”.</>
              )}
            </p>
            <p className="fine">
              Kung walang lumabas, maaaring hindi lang nakasulat ang barangay sa pangalan ng proyekto: subukan ang pangalan ng
              kalye o lugar na malapit.
            </p>
          </div>
          <Picture photo={PHOTOS.rooftops} sizes="(max-width: 1023px) 100vw, 50vw" develop className="split-frame" />
        </div>
      </section>

      <section className="band" id="projects" aria-labelledby="list-h">
        <div className="page">
        <div className="list-head">
          <h2 id="list-h" className="section-h">
            {narrowed ? `${count(filtered.length)} sa ${count(all.length)} na proyekto` : `Ano-ano ang mga proyekto? (${count(all.length)})`}
          </h2>
          <button type="button" className="button button-quiet" onClick={() => downloadText(`${config.id}-fy2027-projects.csv`, projectsCsv(filtered))}>
            I-download ang CSV{narrowed ? ` (${count(filtered.length)})` : ''}
          </button>
        </div>

        <div className="toolbar">
          <label className="field">
            <span className="label">Programa</span>
            <select value={program} onChange={(e) => setParam('program', e.target.value)}>
              <option value="">Lahat ng programa</option>
              {(Object.keys(summary.byDataset) as DatasetKey[]).map((k) => (
                <option key={k} value={k}>{programName(k)} ({count(summary.byDataset[k]!.rows)})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Binago ng Kongreso</span>
            <select value={status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">Kahit ano</option>
              {BRIDGE_GROUPS.filter((g) => summary.groups[g].rows).map((g) => (
                <option key={g} value={g}>{GROUPS[g].label} ({count(summary.groups[g].rows)})</option>
              ))}
            </select>
          </label>
          {offices.length > 1 && (
            <label className="field">
              <span className="label">Opisina ng DPWH</span>
              <select value={office} onChange={(e) => setParam('office', e.target.value)}>
                <option value="">Kahit anong opisina</option>
                {offices.map(([o, n]) => <option key={o} value={o}>{shortOffice(o)} ({count(n)})</option>)}
              </select>
            </label>
          )}
          {reasons.length > 1 && (
            <label className="field">
              <span className="label">Bakit nakalista</span>
              <select value={why} onChange={(e) => setParam('why', e.target.value)}>
                <option value="">Kahit anong dahilan</option>
                {reasons.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span className="label">Ayusin ayon sa</span>
            <select value={sort} onChange={(e) => setParam('sort', e.target.value === 'house' ? '' : e.target.value)}>
              {(Object.keys(SORTS) as Sort[]).map((k) => <option key={k} value={k}>{SORTS[k].label}</option>)}
            </select>
          </label>
        </div>

        {narrowed && (
          <p className="filter-sums">
            Sa {bilang(filtered.length, 'proyektong')} ito: {piso(filteredSummary.house.php)} sa bersyon ng Kamara,{' '}
            {piso(filteredSummary.nep.php)} sa mungkahi ng Pangulo.{' '}
            <button type="button" className="link-button" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setShown(PAGE); }}>
              Alisin ang mga salain
            </button>
          </p>
        )}

        <TableKey groups={BRIDGE_GROUPS.filter((g) => summary.groups[g].rows)} />

        <ProjectTable rows={filtered.slice(0, shown)} programName={programName} />

        {filtered.length === 0 && <p className="state">Walang tumugmang proyekto. Bawasan ang mga salita, o alisin ang mga salain.</p>}
        {filtered.length > shown && (
          <div className="more">
            <span className="muted">Ipinapakita ang {count(shown)} sa {count(filtered.length)}</span>
            <button type="button" className="button" onClick={() => setShown((n) => n + PAGE)}>Magpakita ng {count(Math.min(PAGE, filtered.length - shown))} pa</button>
            <button type="button" className="button button-quiet" onClick={() => setShown(filtered.length)}>Ipakita lahat</button>
          </div>
        )}

        <p className="fine">
          Piso ang mga halaga, ayon sa bawat dokumento. Ang gitling (—) ay nangangahulugang walang ganoong linya sa dokumentong
          iyon. Dalawang bersyon ng iisang badyet ang mungkahi ng Pangulo at ang bersyon ng Kamara: ikinukumpara, hindi
          pinagsasama.
        </p>
        </div>
      </section>

      <OfficesSection photo={PHOTOS.road} />

      <div className="page band-tail">
        <Disclaimers items={disclaimers} compact />
      </div>
    </>
  );
}

/** "Bohol 1st District Engineering Office" → "Bohol 1st DEO", for tight spaces. */
function shortOffice(office: string): string {
  return office.replace(/ District Engineering Office$/, ' DEO');
}

function groupAmount(g: BridgeGroup, c: { nep_php: number; house_php: number; rows: number }): string {
  if (!c.rows) return '—';
  switch (g) {
    case 'nep_only': return piso(c.nep_php);
    case 'increased':
    case 'decreased':
    case 'scope_review': return pisoDelta(c.house_php - c.nep_php);
    default: return piso(c.house_php);
  }
}

/** The opening answer: the House bill's figure first (the later version), the President's beside it. */
function HowMuch({ summary, programName }: { summary: Summary; programName: (k: DatasetKey) => string }) {
  const programs = (Object.entries(summary.byDataset) as [DatasetKey, { rows: number }][])
    .sort((a, b) => b[1].rows - a[1].rows)
    .map(([k, c]) => `${count(c.rows)} sa ${programName(k)}`);
  return (
    <div className="hero-lead">
      <p>
        Iyan ang nasa bersyon ng Kamara (House Bill 10858). Sa mungkahi ng Pangulo (NEP), {piso(summary.nep.php)} para sa{' '}
        {bilang(summary.nep.rows, 'proyekto')}. Dalawang bersyon ito ng iisang badyet, kaya hindi pinagsasama. Panukala pa lang
        ito, hindi pa batas.
      </p>
      {programs.length > 0 && (
        <p className="hero-small">
          Lahat-lahat, {bilang(summary.rows, 'proyekto')} ang nakita namin: {programs.join(', ')}.
        </p>
      )}
    </div>
  );
}

/** What each column of the list means, and each status in "Binago ng Kongreso", in plain words. */
function TableKey({ groups }: { groups: BridgeGroup[] }) {
  return (
    <section className="table-key" aria-labelledby="key-h">
      <h3 id="key-h" className="table-key-h">Paano basahin ang listahan</h3>
      <dl className="table-key-cols">
        <div>
          <dt>{NEP}</dt>
          <dd>Ang halagang hiniling ng Pangulo para sa proyekto (NEP), ang unang bersyon ng badyet.</dd>
        </div>
        <div>
          <dt>{HOUSE}<Info term="Kamara">{KAMARA_HELP}</Info></dt>
          <dd>Ang halaga matapos itong baguhin ng mga kongresista (House Bill 10858). Panukala pa rin, hindi pa batas.</dd>
        </div>
        <div>
          <dt>{DIFF}</dt>
          <dd>Ang bersyon ng Kamara bawas ang mungkahi ng Pangulo: <span className="delta up">+</span> kung dinagdagan, <span className="delta down">−</span> kung binawasan, at “Wala” kung pareho.</dd>
        </div>
      </dl>
      <p className="table-key-sub"><strong>Binago ng Kongreso</strong>: ano ang nangyari sa proyekto mula sa mungkahi ng Pangulo hanggang sa bersyon ng Kamara.</p>
      <dl className="table-key-groups">
        {groups.map((g) => (
          <div key={g}>
            <dt><span className={`status-dot g-${g}`} aria-hidden="true" />{GROUPS[g].label}</dt>
            <dd>{GROUPS[g].help}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProjectTable({ rows, programName }: { rows: ScopedProject[]; programName: (k: DatasetKey) => string }) {
  if (!rows.length) return null;
  return (
    <div className="table" role="table" aria-label="Mga proyekto">
      <div className="tr th" role="row">
        <span role="columnheader">Proyekto</span>
        <span role="columnheader">Binago ng Kongreso</span>
        <span role="columnheader" className="r">{NEP}</span>
        <span role="columnheader" className="r">{HOUSE}<Info term="Kamara" align="end">{KAMARA_HELP}</Info></span>
        <span role="columnheader" className="r">{DIFF}</span>
      </div>
      {rows.map((p) => (
        <div className="tr" role="row" key={p.key}>
          <span role="cell" className="td-project">
            <Link to={`/projects/${p.dataset}/${encodeURIComponent(p.id)}`} className="project-title">{p.title}</Link>
            <span className="project-meta">
              <span className="label">{programName(p.dataset)}</span>
              {p.office && <span>{shortOffice(p.office)}</span>}
              {p.region && <span>{p.region}</span>}
              <ReasonTags reasons={p.reasons} />
            </span>
          </span>
          <span role="cell" className="td-status"><StatusChip group={p.bridge_group} label={p.status_label} held={p.held} /></span>
          <span role="cell" className="r num" data-label={NEP}>{piso(p.nep_php)}</span>
          <span role="cell" className="r num strong" data-label={HOUSE}>{piso(p.house_php)}</span>
          <span role="cell" className={`r num delta ${(p.delta_php ?? 0) > 0 ? 'up' : (p.delta_php ?? 0) < 0 ? 'down' : ''}`} data-label={DIFF}>
            {pisoDelta(p.delta_php)}
          </span>
        </div>
      ))}
    </div>
  );
}
