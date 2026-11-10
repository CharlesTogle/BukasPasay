/**
 * /gaa — the enacted budgets, 2020–2026, for the portal's area:
 * - each DPWH office's whole budget by year, from its district page, with the
 *   2027 NEP and House bill beside it but apart (they are not law);
 * - every program, activity or project in any department whose name names one
 *   of the portal's places, with its appropriation in each year.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { DistrictCard, DistrictOffice, Envelope } from '../api/types';
import { GAA_YEARS } from '../api/types';
import { shortNameOf } from '../config';
import { Await, Disclaimers, External } from '../components/Bits';
import { downloadText } from '../lib/csv';
import { bilang, count, php, phpFull, piso } from '../lib/format';
import { departmentShort, gaaCsv, gaaYearTotals, hasYear, loadGaa, type GaaResult, type GaaRow } from '../lib/gaa';
import { usePortal, type Async } from '../lib/portal-context';
import { useTitle } from '../lib/use-title';
import { tierText } from '../lib/salita';

const PAGE = 100;
const FIRST = GAA_YEARS[0];
const LAST = GAA_YEARS[GAA_YEARS.length - 1];

export default function Enacted() {
  const { config, client, districts } = usePortal();
  const name = shortNameOf(config);
  useTitle(`Badyet ${FIRST}–${LAST} · ${name}`);
  const places = config.scope.places ?? [];

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [state, setState] = useState<Async<GaaResult>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!places.length) return;
    let live = true;
    loadGaa(client, config, (done, total) => live && setProgress({ done, total })).then(
      (value) => live && setState({ status: 'ready', value }),
      (error) => live && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      live = false;
    };
  }, [client, config, places.length, attempt]);

  // #office-… links from the main page land on the office once it has rendered.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [hash, districts.status]);

  const placeList = places.map((p) => p.label).join(', ');
  return (
    <main id="nilalaman" className="page main">
      <p className="eyebrow">Pera ng Nasyonal sa {placeList || name}</p>
      <section className="answer answer-hero" aria-labelledby="enacted-h">
        <h1 id="enacted-h" className="answer-q">Ano ang inaprubahan para sa {placeList || name} mula {FIRST} hanggang {LAST}?</h1>
        <p className="answer-a">
          {state.status === 'ready'
            ? `${bilang(state.value.rows.length, 'programa at proyekto')} ang bumabanggit sa ${placeList}.`
            : `Ang mga aprubadong badyet ng ${FIRST} hanggang ${LAST}.`}
        </p>
        <p>
          Ang General Appropriations Act (GAA) ang badyet na ipinapasa ng Kongreso at pinipirmahan ng Pangulo bawat taon. Ito ang
          pahintulot na gumastos, hindi ang perang aktwal na nagastos. Panukala pa lang ang badyet ng 2027.
        </p>
      </section>

      <OfficeHistories />

      {places.length === 0 ? (
        <p className="fine section-gap">
          Mga opisina ng DPWH lang ang sinusundan ng portal na ito. Nakalista ang mga proyekto sa aprubadong badyet ayon sa
          pangalan, hindi sa opisina, kaya ang kabuuan lang ng bawat opisina bawat taon ang makikita rito.
        </p>
      ) : state.status === 'loading' ? (
        <div className="state" role="status">
          <span className="spinner" aria-hidden="true" /> Hinahanap ang {placeList} sa mga programa ng bawat departamento
          {progress && progress.total > 0 && <> ({count(progress.done)} sa {count(progress.total)})</>}…
        </div>
      ) : state.status === 'error' ? (
        <div className="state state-error" role="alert">
          <p><strong>Hindi makuha ang mga aprubadong badyet.</strong> Baka mabagal o putol ang koneksiyon. <span lang="en">({state.error.message})</span></p>
          <button type="button" className="button" onClick={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1); }}>Subukang muli</button>
        </div>
      ) : (
        <Programs result={state.value} placeList={placeList} />
      )}

      <section className="section" aria-labelledby="gaa-notes-h">
        <h2 id="gaa-notes-h" className="section-h">Paano basahin ang mga numerong ito</h2>
        <ul className="plain-list fine-list">
          <li>Ang mga halaga ay ang inaprubahan sa GAA ng bawat taon, sa piso. Nasa libo-libo ang pagkakasulat nito sa GAA.</li>
          {places.length > 0 && (
            <>
              <li>Nakalista ang isang programa kapag nasa pangalan nito ang {placeList}. Pangalan ang tinitingnan, hindi ang aktwal na lugar: kung hindi sinasabi ng pangalan kung nasaan ang proyekto, wala ito rito.</li>
              <li>Ang isang hilera ay isang pangalan sa isang ahensya sa lahat ng taon. Kapag pinalitan ang pangalan o saklaw, lalabas itong bagong hilera. Ang gitling (—) ay nangangahulugang walang pondo sa pangalang iyon sa taong iyon.</li>
            </>
          )}
          <li>Ang halaga ng isang opisina ng DPWH bawat taon ay ang buong badyet nito ayon sa GAA. Kapag maraming distrito ang pinaglilingkuran ng opisina, buo itong ipinapakita at hindi hinahati.</li>
          <li>Ang mga halaga para sa 2027 ay ang mungkahi ng Pangulo at ang bersyon ng Kamara, na hindi pa batas. Katabi lang sila ng mga naaprubahang taon, hindi idinadagdag.</li>
        </ul>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// DPWH offices, year by year
// ---------------------------------------------------------------------------

function OfficeHistories() {
  const { districts, config } = usePortal();
  if (!config.scope.offices?.length && !config.scope.districts?.length) return null;
  return (
    <Await state={districts} what="ang badyet ng mga opisina ng DPWH">
      {(list) => <OfficeHistoryList list={list} />}
    </Await>
  );
}

function OfficeHistoryList({ list }: { list: Envelope<DistrictCard>[] }) {
  const offices = useMemo(() => {
    const byId = new Map<string, DistrictOffice>();
    for (const env of list) for (const o of env.data.offices) if (!byId.has(o.id)) byId.set(o.id, o);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }, [list]);
  const officeDisclaimer = list.flatMap((e) => e.disclaimers).filter((d) => d.id === 'disclaimer-offices').slice(0, 1);
  if (!offices.length) return null;
  return (
    <section className="section" aria-labelledby="office-years-h">
      <h2 id="office-years-h" className="section-h">
        Magkano ang badyet ng DPWH dito bawat taon?
      </h2>
      <p className="legend">
        <span><i className="sw sw-gaa" /> Aprubadong badyet (GAA), buong opisina</span>
        <span><i className="sw sw-nep" /> Mungkahi ng Pangulo para sa 2027, buong opisina</span>
        <span><i className="sw sw-house" /> Bersyon ng Kamara para sa 2027, mga proyektong may pangalan lang</span>
      </p>
      <div className="hgrid">
        {offices.map((o) => <OfficeHistory key={o.id} office={o} />)}
      </div>
      <Disclaimers items={officeDisclaimer} compact />
    </section>
  );
}

/** Three bars each: 2020–22, 2023–25, and 2026 with the two 2027 versions. */
const CONGRESSES = [{ label: 'Ika-18 Kongreso' }, { label: 'Ika-19 Kongreso' }, { label: 'Ika-20 Kongreso' }];

function OfficeHistory({ office }: { office: DistrictOffice }) {
  const years = office.years ?? [];
  const slot = (fy: number, stage: string) => years.find((y) => y.fy === fy && y.stage === stage);
  const bars = [
    ...GAA_YEARS.map((fy) => ({ key: `${fy}`, label: String(fy), kind: 'gaa', v: slot(fy, 'gaa') })),
    { key: '2027-nep', label: 'Pangulo', kind: 'nep', v: slot(2027, 'nep') },
    { key: '2027-house', label: 'Kamara', kind: 'house', v: slot(2027, 'hgab3') },
  ];
  const max = Math.max(1, ...bars.map((b) => b.v?.php ?? 0));
  return (
    <article className="hcard" id={office.id}>
      <header>
        <h3>DPWH {office.name}</h3>
        <span className={`tag tier tier-${office.tier}`} title={office.tier_text}>{tierText(office)}</span>
      </header>
      <div className="bars" role="img" aria-label={`Badyet bawat taon: ${bars.map((b) => `${b.label} ${b.v?.php != null ? phpFull(b.v.php) : 'wala'}`).join('; ')}`}>
        {bars.map((b) => (
          <div key={b.key} className={`bar-col k-${b.kind}`} title={b.v?.php != null ? `${b.v.stage_label} ${b.key.slice(0, 4)}: ${phpFull(b.v.php)} (${b.v.scope})` : 'Hindi nakita ang opisina sa taong iyon'}>
            <span className="bar-v num">{b.v?.php != null ? php(b.v.php).replace('₱', '') : '—'}</span>
            <span className="bar-track"><span className="bar-fill" style={{ height: `${((b.v?.php ?? 0) / max) * 100}%` }} /></span>
            <span className="bar-x">{b.label}</span>
          </div>
        ))}
      </div>
      <div className="congresses" aria-hidden="true">
        {CONGRESSES.map((c) => <span key={c.label}>{c.label}</span>)}
      </div>
      {office.co_served_districts.length > 0 && (
        <p className="fine">Buong opisina, kahati ang {office.co_served_districts.map((d) => d.label).join('; ')}; hindi hinahati.</p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Programs and projects that name the place
// ---------------------------------------------------------------------------

function Programs({ result, placeList }: { result: GaaResult; placeList: string }) {
  const { config } = usePortal();
  const all = result.rows;
  const totals = useMemo(() => gaaYearTotals(all), [all]);
  const maxTotal = Math.max(1, ...totals.map((t) => t.amount));

  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const dept = params.get('dept') ?? '';
  const yearParam = Number(params.get('year'));
  const year = (GAA_YEARS as readonly number[]).includes(yearParam) ? yearParam : null;
  const [shown, setShown] = useState(PAGE);
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setShown(PAGE);
  };

  const departments = useMemo(() => {
    const n = new Map<string, { label: string; rows: number }>();
    for (const r of all) {
      const d = n.get(r.department_id) ?? { label: departmentShort(r.department), rows: 0 };
      d.rows++;
      n.set(r.department_id, d);
    }
    return [...n.entries()].sort((a, b) => b[1].rows - a[1].rows);
  }, [all]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const y = year ? String(year) : null;
    const rows = all.filter((r) => {
      if (dept && r.department_id !== dept) return false;
      if (y && !hasYear(r, y)) return false;
      if (words.length) {
        const hay = `${r.name} ${r.department}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    return y ? [...rows].sort((a, b) => (b.years[y]?.amount ?? 0) - (a.years[y]?.amount ?? 0)) : rows;
  }, [all, q, dept, year]);
  const narrowed = filtered.length !== all.length;

  return (
    <>
      <section className="section" aria-labelledby="gaa-years-h">
        <h2 id="gaa-years-h" className="section-h">Magkano bawat taon ang mga programang bumabanggit sa {placeList}?</h2>
        <p className="section-lede">Pindutin ang isang taon para makita ang mga programa nito, mula pinakamalaki.</p>
        <div className="ystrip" role="group" aria-label="Pumili ng taon">
          {totals.map((t) => (
            <button
              key={t.year}
              type="button"
              className={`ycell${year === t.year ? ' active' : ''}`}
              aria-pressed={year === t.year}
              onClick={() => setParam('year', year === t.year ? '' : String(t.year))}
            >
              <span className="label">{t.year}</span>
              <span className="ybar"><span style={{ height: `${(t.amount / maxTotal) * 100}%` }} /></span>
              <span className="yv num">{piso(t.amount)}</span>
              <span className="ysub">{bilang(t.programs, 'programa')}</span>
            </button>
          ))}
        </div>
        <p className="fine">Ang kabuuan ng bawat taon ay para lang sa mga programang bumabanggit sa {placeList} sa taong iyon. Magkatabi ang mga taon; hindi pinagsasama.</p>
      </section>

      <section className="section" id="programs" aria-labelledby="gaa-list-h">
        <div className="list-head">
          <h2 id="gaa-list-h" className="section-h">
            {narrowed ? `${count(filtered.length)} sa ${count(all.length)} na programa` : `Ano-ano ang mga programa at proyekto? (${count(all.length)})`}
          </h2>
          <button type="button" className="button button-quiet" onClick={() => downloadText(`${config.id}-gaa-${FIRST}-${LAST}.csv`, gaaCsv(filtered))}>
            I-download ang CSV{narrowed ? ` (${count(filtered.length)})` : ''}
          </button>
        </div>
        <div className="toolbar">
          <label className="field field-grow">
            <span className="label">Hanapin</span>
            <input type="search" value={q} placeholder="Kalsada, paaralan, barangay, ahensya…" onChange={(e) => setParam('q', e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Departamento</span>
            <select value={dept} onChange={(e) => setParam('dept', e.target.value)}>
              <option value="">Lahat ng departamento</option>
              {departments.map(([id, d]) => <option key={id} value={id}>{d.label} ({count(d.rows)})</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">Taon</span>
            <select value={year ?? ''} onChange={(e) => setParam('year', e.target.value)}>
              <option value="">Lahat ng taon</option>
              {totals.map((t) => <option key={t.year} value={t.year}>{t.year} ({count(t.programs)})</option>)}
            </select>
          </label>
        </div>
        {narrowed && (
          <p className="filter-sums">
            {year ? <>Sa {year}: {piso(filtered.reduce((a, r) => a + (r.years[String(year)]?.amount ?? 0), 0))} sa {bilang(filtered.length, 'programang')} ito.</> : <>{bilang(filtered.length, 'programa')} ang ipinapakita.</>}{' '}
            <button type="button" className="link-button" onClick={() => { setParams(new URLSearchParams(), { replace: true }); setShown(PAGE); }}>Alisin ang mga salain</button>
          </p>
        )}

        {filtered.length > 0 && (
          <div className="table gtable" role="table" aria-label="Mga programa at proyekto, bawat taon">
            <div className="tr th" role="row">
              <span role="columnheader">Programa o proyekto</span>
              {GAA_YEARS.map((y) => <span role="columnheader" key={y} className={`r${year === y ? ' ycol' : ''}`}>{y}</span>)}
            </div>
            {filtered.slice(0, shown).map((r) => <ProgramRow key={r.key} r={r} year={year} many={(config.scope.places?.length ?? 0) > 1} />)}
          </div>
        )}
        {filtered.length === 0 && <p className="state">Walang tumugmang programa. Bawasan ang mga salita, o alisin ang mga salain.</p>}
        {filtered.length > shown && (
          <div className="more">
            <span className="muted">Ipinapakita ang {count(shown)} sa {count(filtered.length)}</span>
            <button type="button" className="button" onClick={() => setShown((n) => n + PAGE)}>Magpakita ng {count(Math.min(PAGE, filtered.length - shown))} pa</button>
            <button type="button" className="button button-quiet" onClick={() => setShown(filtered.length)}>Ipakita lahat</button>
          </div>
        )}
        {result.queries.some((x) => x.truncated) && (
          <p className="fine">May mga paghahanap na mas marami ang tumugma kaysa kayang kunin ng pahinang ito; tingnan ang Tungkol sa datos.</p>
        )}
      </section>
    </>
  );
}

function ProgramRow({ r, year, many }: { r: GaaRow; year: number | null; many: boolean }) {
  return (
    <div className="tr" role="row">
      <span role="cell" className="td-project">
        <span className="gname">{r.name}</span>
        <span className="project-meta">
          <span className="label">{departmentShort(r.department)}</span>
          <External href={`https://budget.bettergov.ph/d/${r.department_id}`}>departamento</External>
          {many && r.reasons.map((p) => <span key={p} className="tag tag-place">binabanggit ang {p}</span>)}
        </span>
      </span>
      {GAA_YEARS.map((y) => {
        const has = hasYear(r, y);
        const amount = r.years[String(y)]?.amount ?? 0;
        return (
          <span role="cell" key={y} data-label={String(y)} className={`r num gcell${has ? '' : ' none'}${year === y ? ' ycol' : ''}`} title={has ? phpFull(amount) : `Walang pondo sa pangalang ito noong ${y}`}>
            {has ? piso(amount) : '—'}
          </span>
        );
      })}
    </div>
  );
}
