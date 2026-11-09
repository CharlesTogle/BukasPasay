/**
 * /lungsod: the city government's own budget. Its data (the reports the city
 * publishes as PDFs) is still being prepared, so for now this page says what
 * is coming and points to the originals.
 */
import { PageHead } from '../components/Chrome';
import { External } from '../components/Bits';
import { useTitle } from '../lib/use-title';
import { usePortal } from '../lib/portal-context';
import { shortNameOf } from '../config';

const REPORTS_URL = 'https://pasay.gov.ph/transparency/reports/';

const KINDS: { name: string; official: string; what: string }[] = [
  {
    name: 'Mga ordinansa sa badyet',
    official: 'City Ordinance',
    what: 'Mga batas ng Sangguniang Panlungsod na nagdadagdag o naglilipat ng pondo, gaya ng supplemental budget.',
  },
  {
    name: 'Nasaan na ang pondo',
    official: 'Statement of Appropriations, Allotments, Obligations and Balances (SAAOB)',
    what: 'Magkano ang inaprubahan, magkano ang inilabas sa mga opisina, magkano na ang nagamit, at magkano ang natitira.',
  },
  {
    name: 'Kita at gastos ng lungsod',
    official: 'Financial Report of Operations (FRO)',
    what: 'Ulat ng kinita at ginastos ng lungsod hanggang sa isang petsa.',
  },
  {
    name: 'Mga inilabas na pondo',
    official: 'Summary of Allotment Release Orders (SARO)',
    what: 'Listahan ng mga pondong inilabas sa mga opisina ng lungsod sa loob ng isang panahon.',
  },
  {
    name: '20% para sa kaunlaran',
    official: '20% Development Fund Utilization',
    what: 'Paano ginamit ang 20% ng bahagi ng lungsod sa kita ng bansa, na nakalaan sa mga proyektong pangkaunlaran.',
  },
  {
    name: 'Mga nanalo sa bidding',
    official: 'Bid Results',
    what: 'Sino ang nakakuha ng kontrata sa mga gawaing sibil, consulting, at mga gamit at serbisyo, at sa anong halaga.',
  },
  {
    name: 'Mga balak at nagawang pagbili',
    official: 'Annual Procurement Plan (APP) at Procurement Monitoring Report (PMR)',
    what: 'Ano ang balak bilhin ng lungsod sa taon, at nasaan na ang bawat pagbili.',
  },
];

export default function City() {
  const { config } = usePortal();
  useTitle(`Badyet ng Lungsod · ${shortNameOf(config)}`);
  return (
    <main className="page main">
      <PageHead eyebrow="Pera ng Lungsod" title={`Ang sariling badyet ng ${config.name}`}>
        <p>
          Iba ito sa mga proyekto ng nasyonal na pamahalaan sa ibang bahagi ng portal. Ito ang perang kinokolekta at ginagastos
          mismo ng Pamahalaang Lungsod: mula sa buwis at bayarin sa lungsod, at sa bahagi nito sa kita ng bansa.
        </p>
      </PageHead>

      <section className="answer answer-soon" aria-labelledby="soon-h">
        <h2 id="soon-h" className="answer-q">Kailan ito makikita dito?</h2>
        <p className="answer-a">Inihahanda pa namin ito.</p>
        <p>
          Binabasa namin ang mga PDF na inilalathala ng lungsod para maging madaling basahin at hanapin dito. Habang wala pa,
          nasa website ng lungsod ang mga orihinal: <External href={REPORTS_URL}>pasay.gov.ph/transparency/reports</External>
        </p>
      </section>

      <section className="section" aria-labelledby="kinds-h">
        <h2 id="kinds-h" className="section-h">Ano ang laman ng mga ulat na ito?</h2>
        <dl className="kinds">
          {KINDS.map((k) => (
            <div key={k.official}>
              <dt>{k.name}</dt>
              <dd>
                {k.what}
                <span className="kinds-official" lang="en">{k.official}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
