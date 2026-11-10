/**
 * `pnpm run data:pasay-gov:legacy` — recovers the old pasay.gov.ph bulletin
 * (the ASP.NET site replaced by WordPress in late 2025) from the Wayback
 * Machine into data/pasay-gov/legacy-2022/.
 *
 * The old Bulletin page filled its table from JSON endpoints
 * (/GeneralInfo/GetListOf<Category>) and opened each row's PDF from
 * /GeneralInfo/Get<Category>Images?imgId=<Id>. The archive captured the
 * lists (June 2022), not the files, so what this recovers is the index: each
 * record's original Id, title, description and date. The Ids are what a
 * records request to the city can cite.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HEADERS } from './wp.ts';

const OUT = resolve(import.meta.dirname, '../../data/pasay-gov/legacy-2022');
const WAYBACK = 'https://web.archive.org';

/**
 * List endpoint → [the label the old Bulletin dropdown gave it, the endpoint that served a row's file].
 * Both from the old site's Scripts/userdefine/jsMainMenu_2.js. Ordinances and resolutions showed text only.
 */
const ENDPOINTS: Record<string, [category: string, files: string | null]> = {
  GetListOfAnR: ['Bids and Awards', 'GetAnRImages'],
  GetListOfProcMonRep: ['Procurement Monitoring Report', 'GetProcMonRepImages'],
  GetListOfABC: ['ABC', 'GetABCImages'],
  GetListOfBidRes: ['Bid Result', 'GetBidResImages'],
  GetListOfBidNotAb: ['Bid Notice Abstract', 'GetBidNotAbsImages'],
  GetListOfAwaNotAb: ['Award Notice Abstract', 'GetAwardNotAbsImages'],
  GetListOfNOANTPRESOPOCA: ['NOA, NTP, RESO, PO/CA', 'GetNOANTPRESOPOCAImages'],
  GetListOfRequestForQoutation: ['Request for Quotation', 'GetRequestForQoutationImages'],
  GetListOfAPP: ['APP', 'GetAPPImages'],
  GetListOfCashFlow: ['Cash Flow', 'GetCashFlowImages'],
  GetListOfBudget: ['Budget', 'GetBudgetImages'],
  GetListOfDebtService: ['Debt Service', 'GetDebtServiceImages'],
  GetListOfVacPositions: ['Vacant Positions', 'GetVacPositionsImages'],
  GetListOfCityOrd: ['City Ordinances', null],
  GetListOfResol: ['Resolutions', null],
};

interface OldRow { Id: number; Title: string; Description: string; Datetime: string }

/** The archive answers "Temporarily Offline" with HTTP 200 at times, so a response counts only if it parses. */
async function fetchJson<T>(url: string, tries = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // network error or non-JSON body: retry below
    }
    if (attempt >= tries) throw new Error(`no JSON after ${tries} tries: ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

/** The latest HTTP 200 capture of an endpoint: [timestamp, original URL], or null. */
async function latestCapture(endpoint: string): Promise<[string, string] | null> {
  const q = new URLSearchParams({ url: `pasay.gov.ph/GeneralInfo/${endpoint}`, filter: 'statuscode:200', output: 'json', fl: 'timestamp,original' });
  const rows = await fetchJson<string[][]>(`${WAYBACK}/cdx/search/cdx?${q}`);
  const last = rows.slice(1).at(-1);
  return last ? [last[0], last[1]] : null;
}

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
/** "/Date(1652742840000)/" → ISO 8601. */
const isoDate = (d: string) => new Date(Number(/\d+/.exec(d)?.[0] ?? NaN)).toISOString();

async function main() {
  await mkdir(OUT, { recursive: true });
  const index: { endpoint: string; category: string; archived_at: string | null; rows: number }[] = [];
  for (const [endpoint, [category, files]] of Object.entries(ENDPOINTS)) {
    const capture = await latestCapture(endpoint);
    if (!capture) {
      console.log(`  ${endpoint}: not archived`);
      index.push({ endpoint, category, archived_at: null, rows: 0 });
      continue;
    }
    const [timestamp, original] = capture;
    const source = `${WAYBACK}/web/${timestamp}id_/${original}`;
    const { data } = await fetchJson<{ data: OldRow[] }>(source);
    const rows = data.map((r) => ({
      id: r.Id,
      title: plain(r.Title),
      description: plain(r.Description),
      posted: isoDate(r.Datetime),
      file_endpoint: files ? `${original.replace(endpoint, files)}?imgId=${r.Id}` : null,
    }));
    const archived_at = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
    await writeFile(`${OUT}/${endpoint}.json`, JSON.stringify({ category, endpoint: original, archived_at, source, rows }, null, 1) + '\n');
    index.push({ endpoint, category, archived_at, rows: rows.length });
    console.log(`  ${endpoint}: ${rows.length} rows (archived ${archived_at})`);
  }
  await writeFile(`${OUT}/index.json`, JSON.stringify(index, null, 2) + '\n');
  console.log(`${index.reduce((n, i) => n + i.rows, 0)} rows → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
