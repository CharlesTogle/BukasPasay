# The pasay.gov.ph transparency dataset

How the City of Pasay's own transparency documents were collected, read and
turned into data for **Bukas Pasay**, in the order the work was done: what was
done, how, and why.

Bukas Pasay is a fork of bettergovph/transparency-portal (React 19, TypeScript,
Vite), configured for Pasay City (`portal.config.ts`: id `bukas-pasay`, site
https://bukas-pasay.6digits.dev). The portal shows the FY2027 national budget
lines that name Pasay. This dataset adds the city's own documents from
https://pasay.gov.ph/transparency/.

Code is in `scripts/pasay-gov/`, data in `data/pasay-gov/`. Work is on the
branch `data/pasay-gov-reports`.

---

## Ground rules

These shaped every step below.

- **Numbers, not judgements.** Outputs show each source's numbers side by side,
  plus plain arithmetic difference columns (e.g. `abc_minus_award`). They never
  carry labels such as anomaly, mismatch, status, OK or red flag. Readers draw
  their own conclusions.
- **Missing stays missing.** A value that could not be read is empty, never 0.
- **Join only on real keys** (bid ID, office, fund), never on guesses.
- **Deterministic scripts.** Extraction and comparison are code that gives the
  same result every run, not AI judgement.
- **Keep the evidence.** Every extracted value keeps the raw text it came from
  and its page, so anyone can check it against the scan.
- **Tooling.** Use `pnpm`. Run Python only in the repo venv `.venv/`. Run
  TypeScript with `./node_modules/.bin/tsx`, because pnpm v10's pre-run check
  stops on the blocked esbuild/workerd build scripts.

---

## Part 1: Before the handoff

### 1. Catalogue everything the site publishes (`catalog.ts`)

**What:** a list of every transparency entry on pasay.gov.ph and every document
attached to it. `pnpm run data:pasay-gov [-- --concurrency=N]` writes
`catalog.json` and `summary.json`.

**How:** the site is WordPress with JetEngine listings. Three sources are joined
by WordPress post ID:
1. the REST API (`/wp-json/wp/v2/<collection>`), for every post and its taxonomy terms;
2. the listing pages, which show fields and documents the API hides (parsed by `listings.ts`);
3. the media library, for PDFs attached to a post or to none.

`wp.ts` handles HTTP with retries and a concurrency pool.

**Why:** to start from a complete inventory. An entry with no document is kept
and counted rather than dropped, because a gap is something to report.

**Result:** 5,132 entries.

| Collection | Entries |
|---|---|
| reports-budget | 28 |
| reports-fdpentry | 7 |
| reports-procurements | 13 |
| bac-entries | 657 |
| bulletin-entries | 4,418 |
| downloadable-forms | 9 |

The downloadable-forms listing page (/serbisyo/downloadable-forms/) could not
be fully parsed and is a known gap.

### 2. Recover the old site's lists (`legacy.ts`)

**What:** 1,267 records from the old ASP.NET site's June 2022 JSON lists,
retrieved through the Wayback Machine and saved to `legacy-2022/`.

**Why:** most bulletin entries on the new site have no file (see step 3). The old
lists prove those documents existed and give their old record IDs, which can be
cited in a Freedom of Information request. The files themselves were never
archived.

### 3. Explain the missing files (`findings.json`)

**What:** a written record of why the 2020–2025 bulletin files are missing,
with the evidence:
- The 2026 migration imported the entries as text only.
- The media library holds no file uploaded before 2026.
- The old file endpoints now redirect to the new site.

It also lists recovery routes:
- an FOI request citing the old record IDs
- DBM's Full Disclosure Policy portal
- COA audit reports
- the Wayback Machine, for about 100 PDFs from 2011–2017

**Why:** so the gap is documented with evidence rather than assumed. The
findings are merged into `summary.json`.

### 4. Download every linked PDF (`download.ts`)

**What:** all 1,525 linked PDFs (2.36 GB) saved to `files/`, keeping the site's
paths. The folder is git-ignored.

**How:** each download is checked against a HEAD request.

**Why:** the documents are the source. Working from local copies means the
analysis doesn't depend on the site staying up or unchanged.

### 5. Classify each PDF as text or scan (`inspect.ts`)

**What:** for each page, whether it has a text layer, a page-sized image, or
both. Results go to `pdf-types.json`.

**How:** poppler (`pdftotext`, `pdfimages -list`).
- A page with 40 or more characters of text and no page-sized image (about 800,000 pixels or more) is `text`.
- An image with no text is `scan`.
- Both together is `scan+ocr`.
- A document is `mixed` when its pages differ.

**Why:** to know how much of the archive needs OCR. Before the handoff this was
run on part of the set only, where about 89% of files were scans (EPSON Scan).

### 6. OCR everything (`ocr.ts`)

**What:** a searchable PDF and a `.txt` file (page layout kept, pages split by form
feeds) for every file, in `ocr/` (git-ignored). All 1,525 files were done with 0
failures, in about 1 hour 40 minutes.

**How:** ocrmypdf 17.14 in the venv (`scripts/pasay-gov/requirements.txt`), with
`--skip-text --rotate-pages --deskew`, one file per core. Then
`pdftotext -layout` for the text.

There is a second pass for files averaging under 100 characters a page. Each
page is re-read from its red channel at 300 dpi, which drops the city's green
watermark. That text goes to `<name>.red.txt`. Only one file qualified,
`2026/03/itb26-025-ntp_0001`, a phone photo. A hand-typed copy of it, made from
Chromium's OCR, is in `manual/2026/03/itb26-025-ntp_0001.txt`.

**Why:** almost everything is a scan, and the text layout must be kept because
the parsers read columns by character position.

### 7. Read peso amounts exactly (`extract/money.ts`)

**What:** peso amounts as integer centavos, with the raw text kept beside each value.

**How:** commas are ignored and the last `.` is the decimal point. It handles:
- misplaced commas
- a space before the decimals (`5,423,094 .41`)
- the city's spaced style (`PHP 79, 455, 948.00`)
- trailing dots

In FROs and SAAOBs, every amount is printed with centavos, so
`centavosAlways=true` reads a token with no decimal point as having lost it
(`6,520,00000` → 6,520,000.00). Elsewhere such a token is whole pesos.

**Why:** integer centavos avoid floating-point rounding, so arithmetic between
columns is exact.

### 8. First FRO parser (`extract/fro.ts`)

**What:** rows of the Financial Report of Operations (LBAc Form No. 2).

**How:** a line with 8 or more amounts is a row. Each amount is placed in the
column whose right edge it is nearest. The edges come from that page's rows that
have all 12 amounts, so a blank cell doesn't shift the others. Text left of the
amount columns is the row's label.

**Result:** tested on the September 30, 2026 FRO, 141 of 147 rows were complete.
The General Fund final appropriation (₱10,297,165,005.00) and the GPSS total
match the SAAOB.

### Facts established before the handoff

- **Bid IDs.** The canonical ID is the website's series field (e.g.
  `ITB26-02-025`). Filenames shorten it, and OCR garbles it (`1TB26-02.025`),
  so IDs are matched on year plus sequence number.
- **Linking award documents to bids.** Award documents link to their bid
  through the catalog's `documents[].label`: BAC-RESO, Notice of Awards,
  Contracts / Purchase Order, Notice to Proceed. Step 15 found that an entry
  page can link documents of other bids, so the bid ID printed in a document
  is the join key; the entry that links it is not.

---

## Part 2: After the handoff

### 9. Re-classify all 1,525 PDFs

**What:** `inspect.ts` run on the whole set (it had covered only part).

| Kind | Files | Pages |
|---|---|---|
| scan | 1,412 | 4,434 |
| scan+ocr | 85 | 229 |
| mixed | 18 | 147 |
| text | 10 | 100 |

**Why:** the OCR accuracy test (next step) needs every page with real digital
text as its answer key.

### 10. Measure OCR accuracy (`ocr-accuracy.ts`)

**What:** how well the OCR reads these documents. Results are in `ocr-accuracy.json`.

**How:** each page of the 10 digital-text PDFs is rendered as a grayscale image
at 150, 200 and 300 dpi, the resolutions the city's scans use. The image goes
through the same ocrmypdf command as `ocr.ts`, and the OCR text is compared
with the page's own text. Three measures are used:
- character error rate: edit distance ÷ characters
- digit error rate: the same, on digits only
- peso amounts read exactly to the centavo

One page was skipped: page 90 of the 90-page Christmas-package bidding document,
which holds only its page number and a small image. 99 pages were measured.

| dpi | Character errors | Digit errors | Amounts exact |
|---|---|---|---|
| 150 | 4.9% | 8.2% | 80 / 80 |
| 200 | 4.7% | 4.2% | 80 / 80 |
| 300 | 4.8% | 4.1% | 80 / 80 |

**Why:** to know how much the OCR text can be trusted before building on it.

**Limits:**
- A clean rendered page has no skew, smudges or watermark, so these rates are a best case.
- None of the test pages is an FRO or SAAOB table.
- The comparison is in reading order, so text that OCR reads in a different order (tables, two columns) counts as errors.

### 11. Run the FRO parser on every monthly FRO

**What:** the parser run on all FROs on the site, all for budget year 2026.

| FRO as of | File | Rows | Complete rows | Rows with unplaced amounts |
|---|---|---|---|---|
| April 30, 2026 | `2026/06/FRO-MAY-31.pdf` (the filename says May; the report says April 30) | 134 | 130 | 1 |
| May 31, 2026 | `2026/06/FRO-MAY-31-2026.pdf` (the `-1` copy is byte-identical) | 139 | 134 | 1 |
| June 30, 2026 | `2026/07/FRO-AS-OF-JUN-30.pdf` | 142 | 118 | 14 |
| July 31, 2026 | `2026/09/FRO-july-31-aug-12.pdf` | 143 | 136 | 1 |
| September 30, 2026 | `2026/10/FRO-OCT-12.pdf` | 147 | 141 | 1 |

"Complete" means all 12 columns have a value. The June 30 rows that still have
unplaced amounts carry digit-level misreads (`6,067660.00`, `4,924 84175`) or
sit on the SEF continuing-appropriations page. They keep their raw line for the
review step; the parser does not tune itself to them.

No FRO is posted for January–March 2026 or for August 2026.

**Fixes made for the June scan:**
- **Misread commas.** OCR read some thousands commas as `;` `:` `/` `!` or a
  bracket (`124,635/654.29`, `28,624)075.77`). The mark is put back as a comma
  when it sits between a digit and exactly three digits. It is a one-for-one
  character swap, so column positions don't move. This cut the rows with
  amounts that couldn't be placed from 63 to 14.
- **Rows split across two lines.** OCR split two rows over two lines (Building
  Official, BJMP), so neither line reached 8 amounts. Two adjacent short lines
  are joined when their amounts continue left to right and together reach 8.
  The row's `line` keeps both.

**Shared code:** the column-placement code moved to `extract/columns.ts`, which
the FRO and SAAOB parsers both use.

### 12. SAAOB parser (`extract/saaob.ts`)

**What:** the Statement of Appropriations, Allotments, Obligations and Balances,
for May 31, June 30 and September 30, 2026. It has five columns:
appropriations, allotments, obligations, unreleased appropriations, and
unobligated allotments.

**How:** the same column placement as the FRO, with these additions:
- Each row has its page header (section, fund, as-of date), the heading printed above its group, and an expense class: PS, MOOE, CO or FINEX. OCR variants such as `Cco` and `CcOo` are normalised by keeping letters only and collapsing repeats.
- A line labelled with an expense class but with too few amounts (wrapped by OCR) is kept as a row with no values and its raw amounts listed. It is not guessed.
- The field is named `heading`, not `sector`, because a subtotal printed under "CDF" is really the Other Services group total. The field records only where text is printed, not a reading of what it belongs to.

**Result:** rows with at least one non-zero value:

| SAAOB as of | File | Rows | Complete rows | Rows with unplaced amounts |
|---|---|---|---|---|
| May 31, 2026 | `2026/06/SAAOB-MAY-31.pdf` | 39 | 38 | 3 |
| June 30, 2026 | `2026/07/SARO-AS-OF-JUNE-30.pdf` | 40 | 39 | 3 |
| September 30, 2026 | `2026/10/SARO-OCT-12.pdf` | 38 | 38 | 3 |

The unplaced amounts are fragments of garbled subtotal lines
(`4,587,1 37!374.28`) and the wrapped CDF line, which is kept as a row with no
values.

**Check:** the September 30 General Fund total (₱10,297,165,005.00) matches the
FRO's final appropriation.

### 13. Match FRO rows to offices (`fro-offices.json`, `extract/fro-offices.ts`)

**What:** which office each FRO row is, with its ID in the city's WordPress
`departments` list.

**Why the printed row numbers can't be the key:**
- OCR garbles them (`80 81` for 60 61, `3|` for 31).
- The city printed **33 twice**, for the Urban Development and Housing Office
  and for the BFP. There are 42 GPSS office rows, numbered up to 41.
- Fuzzy matching of OCR'd office names would mean guessed joins.

**How:**
- **The mapping.** `fro-offices.json` lists the 72 current-year General Fund
  office rows, typed from the September 30, 2026 scan in printed order, by
  sector: GPSS 42, SSS 16, ESS 9, OSS 5. Each entry has the printed number,
  implementing unit, MFO/PPA, and `department_id` where the same office is in
  `/wp-json/wp/v2/departments`, empty otherwise. Supplemental-budget rows,
  totals, continuing appropriations and the SEF page are not office rows.
- **Matching.** A row is matched by its position within its sector, from the
  sector heading to its TOTAL line. If a sector's count differs from the file,
  that sector's rows get no office and the counts are reported.
- **Fixes along the way:**
  - The end-of-section check accepts `CONTI INUING`, the spelling the April and June OCR produced.
  - A sector's first row ignores text printed above the heading. In the July 31 FRO, "SUBTOTAL SWD" sat above the ESS heading.

**Result:** all 72 office rows match in all five FROs.

**Independent check:** an office's current appropriation (its enacted budget)
should read the same in every month's FRO. Of the 72 offices × 5 FROs = 360
values:
- 57 offices read the same in all five FROs.
- 13 offices have values that differ from the other months by misread digits:
  12 of them in one month (e.g. `44,075,196.84` against `44,975,196.84`), and
  Derham Park and Sports Complex (GPSS row 26) in two (`15,693,977.72` in May,
  `15,593,877.72` in September, `15,593,977.72` in the other three). That is 14
  values.
- 2 offices are missing one month's value (Sangguniang Panglungsod in July, Pasay
  City Police in May).

Where values differ, the majority across months is the same office's budget,
so no row is matched to the wrong office. It also shows that about 4% of OCR'd
values (14 of 360) carry a misread digit, which the review step has to catch.

**Left for the user to decide:**
- Row 5, "Secretary to the Sangguniang Panglungsod": does it map to Office of the City Secretariat (13692)?
- Row 54, "Pasay City Employment Center": does it map to Public Employment Service Office (13688)?

### 14. What the dataset holds

**Rows of numbers:** only 2026. Of the 1,525 PDFs, 1,507 were uploaded in 2026
and 18 between November 2024 and December 2025.

**Earlier years:** listings only. 4,344 bulletin entries and the 1,267 legacy
records have no files.

| Collection | Entries | With files | PDFs | Pages | Parsed |
|---|---|---|---|---|---|
| bac-entries | 657 | 657 | 1,398 | 3,692 | not yet |
| reports-budget | 28 | 28 | 30 | 159 | FRO, SAAOB |
| reports-procurements | 13 | 13 | 13 | 699 | not yet |
| reports-fdpentry | 7 | 6 | 6 | 42 | not yet |
| bulletin-entries | 4,418 | 74 | 77 | 316 | not yet |
| downloadable-forms | 9 | 1 | 1 | 2 | not data |
| legacy-2022 (Wayback) | 1,267 | 0 | 0 | — | metadata only |

Q1 2026 is partly covered: the April 30 FRO's "previous quarter" columns should
hold each office's totals through March 31, 2026.

### 15. Type the unlabelled BAC documents (`extract/doc-type.ts`, `doc-types.ts`)

**What:** a document type for each of the 177 BAC documents the site links
without a label. `unlabelled-docs.json` is the input and
`unlabelled-doc-types.json` the output.

**Why it matters:** opening 10 of them showed they are ordinary procurement
documents, but **135 of the 177 carry a different bid ID than the entry that
links them**. When the city posted a batch of bids, it often attached the whole
batch's PDFs to the first entry. For example, the OSCA-booklets entry
SVP26-08-313 links SVP26-08-315, which is a request for quotation for Kasalang
Bayan meals and has its own entry. So documents must be joined to bids by the
ID printed in them, never by the page that links them.

**How:** string matching, not AI.
- **Codex trial, stopped.** A Codex agent (`gpt-6.1-terra`, read-only) was
  briefly set up. It was stopped before producing anything, in favour of string
  matching. Its prompt and schema are still in `scripts/pasay-gov/codex/`.
- **Title search.** For each page, the top 25 lines are searched for title
  phrases ("INVITATION TO BID", "NOTICE OF AWARD", "KNOW ALL MEN BY", …). The
  earliest match gives the page's type, and the matching line is kept exactly as
  read. A page with no title continues the document before it.
- **What counts as a title.** A phrase counts only if it starts within the
  first 20 characters of its line, and a numbered list item (`3. Issuing the
  corresponding Notice of Award…`) never counts. Without this rule, body text
  matched in two files.
- **Text source.** The hand-typed copy is used when there is one, then the OCR
  text, then the red-channel reading.
- **Every document gets a type.** That led to two additions:
  - "Negotiated Procurement - Two Failed Biddings" (which requests quotations) counts as `request-for-quotation`.
  - A new type, `terms-of-reference`, was added for the Christmas-package Terms of Reference.

**Result:**

| Type | Documents |
|---|---|
| bid-invitation | 116 |
| request-for-quotation | 17 |
| notice-to-proceed | 10 |
| contract-purchase-order | 8 |
| bac-resolution | 8 |
| notice-of-award | 6 |
| bid-bulletin | 6 |
| notice-of-postponement | 3 |
| request-for-expression-of-interest | 2 |
| terms-of-reference | 1 |

**Checked by hand:** every matched title line except the 116 bid invitations,
all of which read "INVITATION TO BID". Also the three files whose title isn't on
page 1:

| File | Page 1 | Title found |
|---|---|---|
| `2026/07/RFQ26-025.pdf` | a Barangay Bureau letter | page 7, "REQUEST FOR QUOTATION" |
| `2026/10/itb25-320-bacreso_0001.pdf` | the middle of the resolution (pages out of order in the scan) | page 3, "RESOLUTION DECLARING…" |
| `2026/10/BACRESO-ITB26-160.pdf` | a BAC Secretariat routing slip | page 2, "Resolution PB26-160" |

**Bid IDs:** the pattern found no printed bid ID in 36 of the 177: 18 bid
invitations, 9 notices to proceed, 6 contracts or purchase orders, 2 bid
bulletins and the terms of reference. For these the ID has to be read from the
scan, with the ID in the filename as a second reading. Matching by project name
would be a guess and is not used.

**Cross-check against the site's labels:** 126 of the 177 PDFs are also linked,
with a label, from another entry (usually their own bid's). For those, the
string match and the site's label compare as follows:

| Site label | String match | Documents |
|---|---|---|
| View Document | bid-invitation | 109 |
| View Document | bid-bulletin | 4 |
| View Document | notice-of-postponement | 3 |
| View Document | request-for-quotation | 3 |
| BAC-RESO | bac-resolution | 2 |
| Notice to Proceed | notice-to-proceed | 2 |
| Notice of Awards | notice-of-award | 1 |
| Contracts / Purchase Order | contract-purchase-order | 1 |
| Philippine Bidding Document | bid-bulletin | 1 |

"View Document" is the site's generic label. Every specific label agrees with
the string match, except one: `2026/02/Addendum-No.-26-001-itb26-015-017.pdf`,
which the site labels "Philippine Bidding Document" and which is printed as
"SUPPLEMENTAL / BID BULLETIN, ADDENDUM NO. 26-02-001" (one page, correcting
project titles). The output keeps the type from the printed title.

**Not yet done:** 1,347 distinct BAC PDFs carry a site label somewhere; 1,221
of them never appear unlabelled. These have not been checked the same way.
Since an entry page can link another bid's documents, the same title and ID
check should run on them before they are joined.

---

## Still to do

1. Settle rows 5 and 54 of `fro-offices.json`.
2. Run the document-type and printed-ID check on the labelled BAC documents (1,221 never appear unlabelled).
3. Decide whether to keep or delete the unused Codex prompt and schema in
   `scripts/pasay-gov/codex/`.
4. Add a Q1 2026 entry to `findings.json`: no FRO or SAAOB for January–March
   2026 is posted; recovery by FOI request to the City Budget Office or the DBM
   Full Disclosure Policy portal.
5. Procurement parsers:
   - invitation to bid: project, ABC, fund, office
   - BAC resolution: bidders and bids
   - notice of award: winner, and the amount in words and in figures (needs a words-to-number converter)
   - contract/PO and notice to proceed: dates
   - join each document by its printed bid ID
6. One `extracted/<path>.json` per PDF (value, page, source text, which text
   file), then combined `budget-2026.csv/.json` and `procurements.csv/.json`.
7. Comparison script: numbers side by side plus difference columns, no labels.
8. Review: rows with non-zero differences, shown with crops of the scan, for a
   person to confirm (Chromium's copy-text is a free second reading). Then
   check about 30 random values.
9. Stacked PRs: scraper and catalog → legacy and findings → OCR → parsers.
