import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Disclaimer, Overview } from '../api/types';
import { shortNameOf } from '../config';
import { Await, Disclaimers, External } from '../components/Bits';
import { PageHead } from '../components/Chrome';
import { bilang, count, petsa } from '../lib/format';
import { SOURCE_CODE_URL } from '../lib/links';
import { usePortal } from '../lib/portal-context';
import type { ScopeResult } from '../lib/scope';
import { departmentShort, loadGaa, type GaaResult } from '../lib/gaa';
import type { Async } from '../lib/portal-context';
import { useTitle } from '../lib/use-title';

/** The API's `rules`, in words for readers rather than developers. */
const READING_RULES = [
  'Mga halaga ito sa mga dokumento ng badyet, hindi ang perang aktwal na nagastos.',
  'Piso ang mga halaga, ayon sa bawat dokumento. Ang gitling (—) ay nangangahulugang walang ganoong linya sa dokumentong iyon; hindi ito nangangahulugang zero.',
  'Dalawang bersyon ng iisang badyet ang mungkahi ng Pangulo (NEP) at ang bersyon ng Kamara (House bill). Ikumpara ang dalawa; huwag pagsamahin.',
  'Ang “Nasa Kamara lang” at “Nasa Pangulo lang” ay mga posibilidad pa lang: dapat suriin, hindi pa tiyak na idinagdag o tinanggal. May mga linyang pinalitan lang ang pangalan o saklaw.',
  'Ang “hindi pa tiyak na pares” ay pagtatapat na batay sa magkahawig na pangalan, hindi sa eksaktong pangalan.',
  'Ang opisina ng DPWH na naglilingkod sa ilang distrito ay ipinapakita nang buo; hindi hinahati ang pera nito. Ang perang nasa Central Office o regional office ng DPWH ay wala sa alinmang distrito.',
];

export default function About() {
  const { scope, overview, config } = usePortal();
  useTitle(`Tungkol sa datos · ${shortNameOf(config)}`);
  return (
    <main className="page main">
      <Await state={scope} what="ang mga tanong ng portal">
        {(s) => (
          <Await state={overview} what="ang mga tala sa datos">
            {(ov) => <AboutView scope={s} overview={ov.data} />}
          </Await>
        )}
      </Await>
    </main>
  );
}

function AboutView({ scope, overview }: { scope: ScopeResult; overview: Overview }) {
  const { config, districts } = usePortal();
  const label = (k: string) => overview.datasets.find((d) => d.key === k)?.short ?? k.toUpperCase();
  const disclaimers = new Map<string, Disclaimer>();
  for (const d of scope.disclaimers) disclaimers.set(d.id, d);
  if (districts.status === 'ready') for (const env of districts.value) for (const d of env.disclaimers) disclaimers.set(d.id, d);
  const meta = scope.meta;

  return (
    <>
      <PageHead eyebrow="Tungkol sa datos" title={`Saan galing ang ${bilang(scope.projects.length, 'proyektong')} ito?`}>
        <p>
          Galing ang bawat numero sa BetterGov.ph Budget API, na nagkukumpara ng bersyon ng Kamara at mungkahi ng Pangulo,
          proyekto sa proyekto. Itinatanong ng {shortNameOf(config)} sa API ang mga tanong sa ibaba, at ipinapakita ang bawat
          linyang ibinabalik nito.
        </p>
      </PageHead>

      <section className="section" aria-labelledby="q-h">
        <h2 id="q-h" className="section-h">Ano ang itinatanong ng portal na ito?</h2>
        <div className="table queries" role="table" aria-label="Mga tanong">
          <div className="tr th" role="row">
            <span role="columnheader">Mga linyang…</span>
            <span role="columnheader">Programa</span>
            <span role="columnheader" className="r">Nakita</span>
            <span role="columnheader" className="r">Isinama</span>
            <span role="columnheader" className="r">Suriin</span>
          </div>
          {scope.queries.map((q, i) => (
            <div className="tr" role="row" key={i}>
              <span role="cell">
                {q.kind === 'office' ? <>nakalista sa ilalim ng <strong>{q.label}</strong></> : <>may pangalang bumabanggit sa <strong>{String(q.params.q)}</strong></>}
                {q.region && <span className="muted small">, sa rehiyong {q.region} lang o walang nakasaad na rehiyon</span>}
              </span>
              <span role="cell">{label(q.dataset)}</span>
              <span role="cell" className="r num">{count(q.total)}</span>
              <span role="cell" className="r num">{count(q.kept)}</span>
              <span role="cell" className="r"><External href={q.api}>API</External></span>
            </div>
          ))}
        </div>
        <p className="fine">
          Isang beses lang ipinapakita ang linyang nakita ng higit sa isang tanong, kasama ang lahat ng dahilan. Ang paghahanap
          ayon sa pangalan ay nakakakita lang ng mga proyektong binabanggit ang lugar; ang hindi bumabanggit ay makikita lang sa
          pamamagitan ng opisina nito sa DPWH.
        </p>
      </section>

      <GaaQuestions />

      <section className="section" aria-labelledby="x-h">
        <h2 id="x-h" className="section-h">May inalis ba kami? ({count(scope.excluded.length)})</h2>
        {scope.excluded.length === 0 ? (
          <p>Wala. Ipinapakita ang bawat linyang ibinalik ng mga tanong para sa 2027.</p>
        ) : (
          <ul className="plain-list">
            {scope.excluded.map(({ exclusion, project }) => (
              <li key={exclusion.key}>
                {project ? (
                  <External href={project.url}>{project.title}</External>
                ) : (
                  <code>{exclusion.key}</code>
                )}
                <span className="muted"> — {exclusion.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section two-col" aria-labelledby="r-h">
        <div>
          <h2 id="r-h" className="section-h">Paano basahin ang mga numero</h2>
          <ul className="plain-list">
            {READING_RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="section-h">Mga salitang ginamit (mula sa API, nasa Ingles)</h2>
          <dl className="terms" lang="en">
            {Object.entries(overview.terms).map(([k, t]) => (
              <div key={k}>
                <dt>{t.term}</dt>
                <dd>{t.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="d-h">
        <h2 id="d-h" className="section-h">Ang mga dokumento</h2>
        <ul className="docs">
          {overview.documents.map((d) => (
            <li key={d.key}>
              <External href={d.pdf_url}>{d.title}</External>
              {d.source_url && <span className="muted small"> (<a href={d.source_url} target="_blank" rel="noopener">kung saan ito inilathala</a>)</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="n-h">
        <h2 id="n-h" className="section-h">Mga paalala</h2>
        <Disclaimers items={[...disclaimers.values()]} />
        <p className="fine">
          Bersyon ng datos: paghahambing <a href={`${meta.source_repo}/tree/${meta.source_commit}`} target="_blank" rel="noopener">{meta.source_commit.slice(0, 7)}</a>,
          ginawa noong {petsa(meta.built_at)}. Lahat ng proyekto sa buong bansa: <External href={overview.url}>budget.bettergov.ph</External>.
        </p>
      </section>

      <section className="section build-own" aria-labelledby="b-h">
        <h2 id="b-h" className="section-h">Gusto mo ba ng ganitong portal para sa inyong LGU?</h2>
        <p>
          Open source ang portal na ito. I-fork ito, patakbuhin ang <code>npm run setup</code> para piliin ang inyong lalawigan,
          lungsod, bayan, o district engineering office, at i-deploy sa Cloudflare, Vercel, o Netlify. Hindi ito kailangan ng
          database: galing sa parehong API ang datos. <External href={SOURCE_CODE_URL}>Source code</External>.{' '}
          <Link to="/">Bumalik sa mga proyekto</Link>
        </p>
      </section>
    </>
  );
}

/** The 2020–2026 searches, published like the 2027 ones: every department with a match, and how to check it. */
function GaaQuestions() {
  const { client, config } = usePortal();
  const places = config.scope.places ?? [];
  const [state, setState] = useState<Async<GaaResult>>({ status: 'loading' });
  useEffect(() => {
    if (!places.length) return;
    let live = true;
    loadGaa(client, config).then(
      (value) => live && setState({ status: 'ready', value }),
      (error) => live && setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      live = false;
    };
  }, [client, config, places.length]);

  return (
    <section className="section" aria-labelledby="g-h">
      <h2 id="g-h" className="section-h">Ano ang hinanap sa mga badyet ng 2020–2026?</h2>
      {!places.length ? (
        <p>Wala: walang lugar na binabanggit ang portal na ito, at nakalista ang mga proyekto sa aprubadong badyet ayon sa pangalan, hindi sa opisina.</p>
      ) : state.status === 'loading' ? (
        <p className="state" role="status"><span className="spinner" aria-hidden="true" /> Kinukuha ang mga paghahanap…</p>
      ) : state.status === 'error' ? (
        <p className="state state-error">Hindi makuha ang mga paghahanap. <span lang="en">({state.error.message})</span></p>
      ) : (
        <>
          <div className="table queries" role="table" aria-label="Mga paghahanap sa aprubadong badyet">
            <div className="tr th" role="row">
              <span role="columnheader">Mga programang may pangalang…</span>
              <span role="columnheader">Departamento</span>
              <span role="columnheader" className="r">Nakita</span>
              <span role="columnheader" className="r">Nakuha</span>
              <span role="columnheader" className="r">Suriin</span>
            </div>
            {state.value.queries.map((q) => (
              <div className="tr" role="row" key={q.place + q.department_id}>
                <span role="cell"><strong>{q.q}</strong></span>
                <span role="cell">{departmentShort(q.department)}</span>
                <span role="cell" className="r num">{count(q.matched)}</span>
                <span role="cell" className="r num">{count(q.fetched)}</span>
                <span role="cell" className="r"><External href={q.api}>API</External></span>
              </div>
            ))}
          </div>
          <p className="fine">
            Hinanap ang bawat lugar sa lahat ng {count(state.value.searched)} na departamento sa GAA; walang tumugma sa mga hindi
            nakalista. Isang beses lang ipinapakita ang programang nakita ng dalawang lugar.
            {state.value.excluded.length > 0 ? ` ${bilang(state.value.excluded.length, 'programa')} ang inalis namin:` : ' Wala kaming inalis.'}
          </p>
          {state.value.excluded.length > 0 && (
            <ul className="plain-list">
              {state.value.excluded.map(({ exclusion, row }) => (
                <li key={exclusion.key}>
                  {row ? row.name : <code>{exclusion.key}</code>}
                  <span className="muted"> — {exclusion.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
