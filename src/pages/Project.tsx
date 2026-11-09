import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Envelope, ProjectDetail, Version } from '../api/types';
import { DATASET_KEYS, shortNameOf, type DatasetKey } from '../config';
import { Await, Disclaimers, External, ReasonTags, StatusChip } from '../components/Bits';
import { phpFull, pisoDelta } from '../lib/format';
import { usePortal, type Async } from '../lib/portal-context';
import { projectKey } from '../lib/scope';
import { reportHref } from '../lib/report';
import { useTitle } from '../lib/use-title';
import { GROUPS } from '../lib/salita';

const VERSIONS: Version[] = ['nep', 'hgab2', 'hgab3', 'api'];
/** Each version in Tagalog; the API's own label is the tooltip. */
const VERSION_LABELS: Record<Version, string> = {
  nep: 'Mungkahi ng Pangulo (NEP)',
  hgab2: 'Bersyon ng Kamara, ikalawang pagbasa',
  hgab3: 'Bersyon ng Kamara, ikatlong pagbasa',
  api: 'Nakalista sa transparency website ng DPWH',
};

export default function Project() {
  const { dataset = '', id = '' } = useParams();
  const { client } = usePortal();
  const valid = (DATASET_KEYS as readonly string[]).includes(dataset);
  const [state, setState] = useState<{ key: string; value: Async<Envelope<ProjectDetail>> } | null>(null);
  const key = `${dataset}/${id}`;

  useEffect(() => {
    if (!valid) return;
    let live = true;
    client.project(dataset as DatasetKey, id).then(
      (value) => live && setState({ key, value: { status: 'ready', value } }),
      (error) => live && setState({ key, value: { status: 'error', error: error instanceof Error ? error : new Error(String(error)) } }),
    );
    return () => {
      live = false;
    };
  }, [client, dataset, id, key, valid]);

  if (!valid) {
    return (
      <main className="page main">
        <p className="state">Walang programang “{dataset}”. <Link to="/">Bumalik sa lahat ng proyekto</Link></p>
      </main>
    );
  }
  const current: Async<Envelope<ProjectDetail>> = state?.key === key ? state.value : { status: 'loading' };
  return (
    <main className="page main">
      <p className="crumbs"><Link to="/">← Lahat ng proyekto</Link></p>
      <Await state={current} what="ang proyekto">
        {(env) => <ProjectView env={env} />}
      </Await>
    </main>
  );
}

function ProjectView({ env }: { env: Envelope<ProjectDetail> }) {
  const { config, overview, scope, client } = usePortal();
  const location = useLocation();
  const p = env.data;
  useTitle(`${p.title} · ${shortNameOf(config)}`);

  const ov = overview.status === 'ready' ? overview.value.data : null;
  const program = ov?.datasets.find((d) => d.key === p.dataset);
  const apiVersionLabel = (v: Version) => ov?.record_versions.find((r) => r.key === v)?.label;
  const inScope = scope.status === 'ready' ? scope.value.projects.find((x) => x.key === projectKey(p.dataset, p.id)) : undefined;
  const versions = VERSIONS.filter((v) => v !== 'api' || p.dataset === 'dpwh');
  const report = reportHref(config, p, window.location.origin + location.pathname);

  const details: [string, string | null][] = [
    ['Programa', program?.label ?? p.dataset.toUpperCase()],
    ['Linya ng programa', p.program],
    ['Kategorya', p.pap],
    ['Opisina ng DPWH', p.office],
    ['Rehiyon', p.region],
    ['Paano pinagtapat ang dalawang bersyon', p.labels.match?.label ?? null],
    ['Sa pagitan ng mga pagbasa sa Kamara', p.labels.reading?.label ?? null],
    ['Transparency website ng DPWH', p.labels.dpwh_site?.label ?? null],
    ['Haba', p.length_m != null ? `${Math.round(p.length_m).toLocaleString('en-US')} metro` : null],
  ];

  return (
    <article className="project">
      <p className="eyebrow">
        Proyekto sa 2027, {program?.short ?? p.dataset.toUpperCase()}{p.office && <>, {p.office}</>}
      </p>
      <h1 className="project-h">{p.title}</h1>
      <div className="project-status">
        <StatusChip group={p.bridge_group} label={p.status_label} held={p.held} />
        <p className="muted" title={p.labels.status.help || undefined}>{GROUPS[p.bridge_group].help}</p>
      </div>

      <div className="project-grid">
        <section aria-labelledby="amounts-h">
          <h2 id="amounts-h" className="section-h">Magkano sa bawat bersyon?</h2>
          <p className="section-lede">Kasama ang pahina sa dokumento, para masuri mo mismo.</p>
          <table className="amounts">
            <tbody>
              {versions.map((v) => {
                const amount = p[`${v}_php` as const];
                const pdf = p.pdf_url[v];
                const page = v === 'api' ? null : p[`${v}_page` as const];
                return (
                  <tr key={v}>
                    <th scope="row" title={apiVersionLabel(v)}>{VERSION_LABELS[v]}</th>
                    <td className="num r" title={phpFull(amount)}>{amount == null ? <span className="muted">wala</span> : phpFull(amount)}</td>
                    <td className="r">
                      {pdf ? <External href={pdf}>{page ? `Pahina ${page}` : 'Buksan ang dokumento'}</External> : <span className="muted">—</span>}
                    </td>
                  </tr>
                );
              })}
              <tr className="amounts-total">
                <th scope="row">Pagbabago, Kamara laban sa mungkahi ng Pangulo</th>
                <td className="num r">{pisoDelta(p.delta_php)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="fine">
            Dalawang bersyon ng iisang badyet ang mungkahi ng Pangulo at ang bersyon ng Kamara, kaya ikinukumpara ang halaga,
            hindi pinagsasama. Buksan ang pahina para tingnan ang numero sa mismong dokumento.
          </p>

          {p.labels.flags.length > 0 && (
            <>
              <h3 className="sub-h">Mga tala sa linyang ito</h3>
              <ul className="flags" lang="en">
                {p.labels.flags.map((f) => <li key={f.code}>{f.label}{f.help ? <span className="muted"> {f.help}</span> : null}</li>)}
              </ul>
            </>
          )}
        </section>

        <aside className="project-side">
          <dl className="details">
            {details.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <dt className="label">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            {p.lat != null && p.lon != null && (
              <div>
                <dt className="label">Lokasyon ayon sa dokumento</dt>
                <dd>
                  <External href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=15/${p.lat}/${p.lon}`}>
                    Tingnan sa mapa ({p.lat.toFixed(5)}, {p.lon.toFixed(5)})
                  </External>
                </dd>
              </div>
            )}
            <div>
              <dt className="label">Bakit ito nasa portal na ito</dt>
              <dd>
                {inScope ? (
                  <ReasonTags reasons={inScope.reasons} />
                ) : (
                  <span className="muted">Hindi ito kasama sa mga proyekto ng portal; ipinapakita ito dahil may link kang sinundan.</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="report">
            <p className="label">Nakita mo na ba ang proyektong ito?</p>
            {report ? (
              <a className="button button-primary" href={report}>Mag-ulat tungkol dito ↗</a>
            ) : (
              <p className="small">
                Mapupunta sa iisang lugar, ang budget.bettergov.ph, ang mga ulat ng mamamayan mula sa bawat portal. Hindi pa ito
                bukas.
              </p>
            )}
          </div>

          <p className="small links">
            <External href={p.url}>Ang proyektong ito sa budget.bettergov.ph</External>
            <br />
            <External href={client.href(p.api_url)}>Ang record sa API (JSON)</External>
          </p>
        </aside>
      </div>

      <Disclaimers items={env.disclaimers} />
    </article>
  );
}
