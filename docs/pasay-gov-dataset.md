# The pasay.gov.ph transparency dataset

How the City of Pasay's own transparency documents were collected, read and
turned into data for **Bukas Pasay**, in the order the work was done: what was
done, how, and why.

Bukas Pasay is a fork of bettergovph/transparency-portal (React 19, TypeScript,
Vite), configured for Pasay City (`portal.config.ts`: id `bukas-pasay`, site
https://bukas-pasay.6digits.dev). The portal shows the FY2027 national budget
lines that name Pasay. This dataset adds the city's own documents from
https://pasay.gov.ph/transparency/.

Code is in `scripts/pasay-gov/`, data in `data/pasay-gov/`. Steps 1–15 were
made on the branch `data/pasay-gov-reports` and merged into `main`. Steps
16–22 are committed straight to `main` for now.

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

## What was not checked

Everything here comes from pasay.gov.ph: the current site, the old site's
file links, and the Wayback Machine's copies of both. These have **not** been
checked:

- DBM's Full Disclosure Policy portal
- COA annual audit reports
- PhilGEPS
- Pasay City Hall: no visit or in-person request was made

So "missing" in this document means missing from pasay.gov.ph and its web
archives. A document may still exist in one of these places. The same list is
in `findings.json` under `not_checked`.

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
  matching. Its unused prompt and schema were later deleted.
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

### 16. Group the dataset by year and month (`by-month.ts`)

**What:** every catalog entry and every legacy-2022 record grouped by year,
then by month. `pnpm run data:pasay-gov:by-month` writes `by-month.json`.
Each year and month carries counts (entries, entries with files, legacy
records, entries per collection), and each month lists its items: date, type,
series, title, link and document URLs. The legacy records are in a separate
list, so the two sources stay apart.

**Which date:** the posting date, the date the city put the record online.
- Catalog entries use the listed "Posting Date" (the same rule as
  `summary.json`), else the WordPress posted time. 59 entries have no listed
  date. `date_source` records which one was used.
- Legacy records use the date part of their stored timestamp. Most are 07:00
  or 08:00 UTC, i.e. midnight on the old server's clock.
- The period a report covers is not its posting date (the September 30 FRO
  was posted in October). That period stays in the item's fields as printed.
- The 132 media-library PDFs attached to no entry have no posting date and
  are not grouped.

**Result:**

| Year | Entries | With files | Legacy 2022 |
|---|---|---|---|
| 2020 | 14 | 0 | 23 |
| 2021 | 510 | 0 | 757 |
| 2022 | 741 | 0 | 487 |
| 2023 | 1,038 | 0 | 0 |
| 2024 | 1,090 | 2 | 0 |
| 2025 | 1,040 | 89 | 0 |
| 2026 (to Nov) | 699 | 688 | 0 |

### 17. Budget, bid and contract amounts per bid (`extract/amounts.ts`, `procurement-amounts.ts`)

**What:** for each bid, the amounts printed in the city's own documents, side
by side. `pnpm run data:pasay-gov:procurement-amounts` writes
`procurement-amounts.csv` (one row per bid) and `procurement-amounts.json`
(every reading with its file, page and raw text).

| Column | Read from | Printed as |
|---|---|---|
| `abc` (the budget) | invitation to bid | "intends to apply the sum of … (Php X)" |
| `bac_resolution_abc` | BAC resolution | the "ABC Php X" line |
| `award_bac_resolution` (the winning bid) | BAC resolution | "Awarding the contract to … in the amount of …", or "To award the contract in favor of … in the total amount of …" |
| `award_notice` | notice of award | "in favor of … in the amount of …" |
| `contract` (the actual amount) | contract | "PROJECT COST", "contract price", "undertakes to pay", "sum of" or "in the amount of" |
| `purchase_order` (the actual amount) | purchase order | the total beside "(Total Amount in Words)" on the last page |
| `notice_to_proceed` | notice to proceed | "in the amount of Php X", where printed |

The difference columns are `abc_minus_award_bac_resolution`,
`abc_minus_award_notice`, `award_minus_contract`,
`award_minus_purchase_order` and `award_minus_notice_to_proceed`. They are plain subtraction, filled only
when both sides have a value.

**How:**
- A file can hold several documents, so it is split where the page title
  changes (`doc-type.ts`).
- Documents are joined by the bid ID printed in them: series, year and
  sequence (`ITB26-02-025` → `ITB26-025`), with the OCR misreads `1TB`, `ITH`
  and `IT8` read as ITB.
- A BAC resolution number (`PB26-009`) counts as the ITB with the same year
  and sequence, and only when no other ID is printed.
- Contracts and many notices to proceed print the city's own numbers
  ("Contract Infra 26-021", "NTP 25-021"), not the bid ID. These are joined by
  the ID in the file's name, and `ids_from_filename` counts them.
- A value column is filled only when all its readings agree. Otherwise it is
  empty and every reading goes in `differing_readings`.
- **Purchase-order subtotals are running balances.** On ITB26-053, page 1
  shows 10,847,400.00 and page 5 shows 21,859,600.00. The total on page 6 is
  22,238,900.00, the award. So only that printed total is compared. The page
  subtotals are kept in the JSON as evidence. OCR also reads the total's
  commas as apostrophes (`P22’238’900'00`), and every PO amount carries
  centavos, so the last two digits are read as centavos.
- OCR reads a zero after a digit as the letter O (`66,044,034.O0`). The fix is
  one character for one, so positions don't move.

**Result** (after the review and fixes in steps 18–21): 1,475 files read.
The 132 media-library PDFs attached to no entry were never downloaded.
432 bids found.

| Has | Bids |
|---|---|
| ABC (invitation or RFQ) | 386 |
| ABC in the BAC resolution | 215 |
| amended ABC | 1 |
| award in the BAC resolution | 185 |
| award in the notice of award | 157 |
| contract amount | 114 |
| purchase-order total | 35 |
| notice-to-proceed amount | 120 |
| an ABC, an award, and a contract or PO amount | 131 |

7 documents have amounts but no bid ID, printed or in the filename. They are
listed under `no_bid_id`.

**Cross-checks on the first run**, before the review (two documents that
should print the same amount):

| Compared | Bids with both | Differ |
|---|---|---|
| ABC: invitation vs BAC resolution | 187 | 4 |
| award: BAC resolution vs notice of award | 131 | 4 |
| award vs contract | 73 | 4 |
| award vs purchase-order total | 18 | 4 |
| award vs notice to proceed | 69 | 5 |

Most of the differences looked like OCR digit errors, e.g. 9,990.00 against
9,990,000.00, or 924,000.00 against 92,400,000.00. The review in step 20
settled every one of them; step 21 has the current comparisons.

**Limits:**
- "Actual amount" means the contract or PO amount. What was actually paid
  (disbursement vouchers) is not published.
- The purchase-order total is found on 25 bids only. On the others, the last
  page's total is garbled or missing from the OCR text.
- The office that asked for a purchase is not printed as a field. It appears
  only in project titles and signature blocks, so bids are not joined to FRO
  offices.

### 18. IQR spread of the procurement ratios (`procurement-iqr.ts`)

**What:** the interquartile-range method run on step 17's amounts.
`pnpm run data:pasay-gov:procurement-iqr` writes `procurement-iqr.json` (the
quartiles and fences of each ratio) and `procurement-iqr.csv` (every bid
outside the fences, with its raw readings, file and page).

**How:**
- It uses ratios, not pesos, so project size doesn't decide what stands out.
  The ratios are award ÷ ABC (from the BAC resolution, and from the notice of
  award), contract ÷ award, and PO total ÷ award.
- Quartiles use linear interpolation (Excel's QUARTILE.INC, R's default).
  Fences are Q1 − 1.5 × IQR and Q3 + 1.5 × IQR.
- `iqrs_beyond_fence` is (ratio − fence) ÷ IQR. It is left empty when the IQR
  is 0.
- Only values whose readings all agree are used.
- In keeping with the ground rules, the output is numbers only, not
  "anomaly" labels.

**Result:**

| Ratio | Bids | Q1 | Median | Q3 | Lower fence | Upper fence | Below | Above |
|---|---|---|---|---|---|---|---|---|
| award (BAC resolution) ÷ ABC | 179 | 0.9956 | 0.9990 | 0.9996 | 0.9896 | 1.0056 | 23 | 0 |
| award (notice) ÷ ABC | 139 | 0.9970 | 0.9992 | 0.9996 | 0.9929 | 1.0037 | 15 | 0 |
| contract ÷ award | 73 | 1 | 1 | 1 | 1 | 1 | 2 | 2 |
| PO total ÷ award | 17 | 1 | 1 | 1 | 1 | 1 | 2 | 1 |

In total, 45 rows are outside the fences, from 33 bids. Another 5 bids have a
malformed figure (see below), so 38 bids are to be checked against their scans.

- **The fences are narrow because half of all awards are within about 0.1% of
  the ABC.** So the lower fence is about 99%, and any award more than about 1%
  under the budget falls outside it.
- **Contract and PO amounts equal the award in nearly every bid.** The IQR is
  0, so any value other than 1 is outside the fences.
- **Some rows outside the fences come from a figure printed wrong in the
  document itself, not from OCR.** ITB26-059 (checked against the scan): the
  BAC resolution (page 4) prints the award as `(PHP31,545,00.00)`, with a
  digit missing. The parser reads that as 3,154,500.00. The notice of award
  prints the same figure, with a handwritten "0" added above it and
  initialled. Every other figure for this bid reads 31,545,000.00: the bid as
  read, the calculated bid, the amount in words ("THIRTY-ONE MILLION FIVE
  HUNDRED FORTY FIVE THOUSAND PESOS"), the notice to proceed and the PO.
- **Malformed figures are now flagged for review.** A figure where a comma is
  not followed by exactly three digits (`31,545,00.00`, or `PHP19,602,1`,
  where OCR cut the figure) cannot be a well-formed amount. Since this
  change, the reading keeps its raw text but its value is not used.
  `procurement-amounts.csv` lists it in `needs_review` with its file and page.
  5 bids have one: ITB25-060, ITB26-042, ITB26-059, ITB26-061 and ITB26-089.
- **A person's reading of the scan goes in `checked-readings.json`.** Each
  entry has the bid, column, file, page, the text as copied, the value and a
  note. It replaces that reading's value, the OCR text stays beside it, and
  the CSV lists it in `checked_against_scan`. Only
  readings by a person are accepted (`read_by: "person"`); the script stops
  on any other. A model's reading of a page is not a check. An entry that matches no reading
  stops the script. Checked on 2026-11-10:
  - ITB26-059: printing error. Value taken from the amount in words.
  - ITB26-120 (contract): printing error, `(PHP 14, 992M 745.57)`. Value
    taken from the amount in words.
  - ITB26-061, ITB26-042, ITB26-089, EPA26-019, ITB26-151, SVP26-182: printed
    correctly, but the OCR cut or split the figure.
  - ITB26-025 (contract), ITB26-144 (PO), SVP26-190 (notice to proceed):
    printed correctly. OCR misread one digit.
  - ITB25-258 (ABC 3,326,800.00) and EPA26-012 (ABC 15,383,990.00), both
    medical oxygen: printed as read. The awards (1,230,300.00 and
    6,322,500.00) read the same in two documents each.
  - ITB26-182: the award is 33,099,716.80. The OCR misread the resolution's
    award line as 098.
  - ITB25-060: read from the "sum of" paragraph.
  - ITB26-049 (contract 1,497,977.49): printed as read. The notice of award
    states 4,497,800.02.
  - ITB25-186, ITB26-045, ITB26-035: printed correctly. These were parser
    errors, now fixed (see below).
- **Parser fixes found by the review:**
  - Contracts restate the ABC ("intends to apply the sum of PHP 615,000"), so
    "as proposed and awarded shall be" is now tried before "sum of". This
    also found 21 more contract amounts.
  - A PO "total" with running subtotals on later pages is a balance whose
    SUB-TOTAL label OCR lost, and is dropped.
  - The "(Total Amount in" label can wrap onto two lines.
  - When a contract gives a monthly amount and then "or a total of" (EPA26-010),
    the total is taken.
- **Requests for quotation (RFQ)** are read for their ABC. The amount comes
  right before "being the Approved Budget for the Contract", so the last
  peso amount before that phrase is taken. The `RFQ` series is now
  recognised in printed IDs and file names.
  - 47 bids gained an ABC: 25 in the RFQ26 series, 21 SVP and 1 NPCS.
  - None of them has an award on the site yet. The posted RFQs (SVP26-197
    to 318, RFQ26-001 to 025) and the awarded SVPs (SVP26-137 to 190, 327,
    341, 368) don't overlap. The awarded SVPs' ABC is printed only in their
    BAC resolutions.
- **A person can exclude a document from a bid.** An entry in
  `checked-readings.json` with `"excluded": true` takes the reading off the
  bid and keeps it under the bid's `excluded` list, with the reason.
  ITB26-129's "contract" is another project's (Contract Goods (Services)
  26-076A, PTPMO S-TEAC snacks and tarpaulin, ₱390,900.00), uploaded under
  the ITB26-129 file name. Titles are not compared automatically, because
  that would be a guessed join. A misfiled document shows up as a non-zero
  difference instead.
- **`award_minus_contract`, `award_minus_purchase_order` and
  `award_minus_notice_to_proceed`** use the notice of award's amount, else
  the BAC resolution's. The two agree wherever both are read.
  - When the peso sign is garbled (`o 4,480,000.00`, `B 2.396.690.00`), the
    last figure grouped in threes with two-digit centavos is taken.
- **Ratios of exactly 1000 or 0.001** (ITB26-151, SVP26-182, ITB26-120) have
  not yet been checked against their scans.
- **Others read the same in more than one file.** For example, EPA26-012
  (medical oxygen): award 6,322,500.00 against ABC 15,383,990.00, read the
  same in two files.
- Telling these two kinds apart is the review step's job.

### 19. Candidates for human review (`procurement-review.ts`)

**What:** every OCR reading in `procurement-amounts.json` that a person
should check against the scan. `pnpm run data:pasay-gov:procurement-review`
writes `procurement-review.csv`, one row per reading. Each row has the reason,
the value read, the raw text, the file to open and the page. Beside the award
and the contract, PO and notice-to-proceed columns, it also shows the award
and value − award, so a reading that already agrees with the other documents
is easy to spot.

**Reasons:**

| Reason | Catches | Example |
|---|---|---|
| malformed | a comma not followed by three digits, or no centavos (these documents print every amount with centavos) | `31,545,00.00`, `P9,065`, `Php150` |
| digits with spaces | a space between two digits, where OCR split a figure | `7,986,3 13.57`, `200, 090 00` |
| notice to proceed ≠ award | the NTP amount differs from the award | |
| amended ABC | an amended ABC, which decides what the award is compared with | ITB26-031 |
| ABC ≠ BAC resolution ABC | the invitation's (or RFQ's) ABC and the resolution's differ | ITB26-025 (OCR), ITB26-136 (bulletin) |

- The city's spaced style (`PHP 1, 497, 977.49`) puts the space after a
  comma, so it is not flagged.
- OCR's letter O for a zero (`.O0`) is read as 0 before checking, as the
  parser does.
- PO totals follow the PO rule (`8,099,53725` is 8,099,537.25).
- Readings a person already checked, and documents a person excluded, are not
  listed. Once a reading is recorded in `checked-readings.json`, it drops off
  the list.

**Result (first run):** 4 readings were flagged. 10 more were already checked
and were not listed. The person then checked all 4 (2026-11-10): each is
printed correctly, and the OCR had split, repeated or cut the figure.
SVP26-177's notice to proceed is 150,480.00. The list is now empty.

| Bid | Column | Raw | Read as | Award | Open |
|---|---|---|---|---|---|
| SVP26-177 | notice to proceed | `Php150` (OCR line: `Php150 480.00`) | 150.00 | none read; BAC resolution ABC 150,480.00 | `2026/07/svp26-177-ntp_0001.pdf` p1 |
| ITB26-031 | PO total | `P 31 ,044,6141 7` | 31,044,614.17 | 31,044,614.17 | `2026/06/itb26-031-po.pdf` p10 |
| EPA26-023 | PO total | `P 31,812,127.50 50` | 31,812,127.50 | 31,812,127.50 | `2026/06/epa26-023-po.pdf` p2 |
| ITB26-143 | PO total | `P 153,951,487.60 60` | 153,951,487.60 | 153,951,487.60 | `2026/10/ITB26-143-po-2_0001.pdf` p5 |

### 20. Human review of the scans (`checked-readings.json`)

**What:** a person (the maintainer) opened each flagged PDF with `xdg-open`
and read the figure on the scan. Each reading is recorded in
`data/pasay-gov/checked-readings.json` with:
- the bid, column, file and page;
- the text as the person copied it (`printed`) and the value;
- a note on what was found;
- the date, and `read_by`.

`procurement-amounts.ts` then puts that value in place of the OCR value,
keeps the OCR text beside it, and lists it in the CSV's `checked_against_scan`.

**Rules:**
- **Only a person's reading counts.** `read_by` must be `"person"`, or the
  script stops. On 2026-11-10, Claude rendered one page (ITB26-182's award
  line) and recorded its own reading. The maintainer rejected that ("checked
  by claude = bad"), read the line themselves, and the rule was added.
  Claude may still look at a page to work out what to ask, but never records
  what it sees.
- An entry that matches no reading stops the script, so a typo cannot pass
  silently.
- `"excluded": true` takes a document off a bid when the person finds it
  belongs to another project. The document is kept under the bid's
  `excluded` list with the reason.
- When a typed figure matched neither document (ITB26-031's "31,068,603",
  ITB26-136's "37,080,855"), nothing was recorded until the person
  confirmed the figure on the scan.
- A reading recorded from the wrong place on the page is corrected, not
  deleted. ITB26-031's resolution ABC was first recorded as 31,086,603.00
  from the WHEREAS paragraph. The table's ABC row prints 31,075,603.00, and
  the note records the correction.

**Result:** 38 readings across 29 bids, all read by the person.

| Outcome | Readings |
|---|---|
| OCR misread (cut, split or a wrong digit), printed correctly | 16 |
| printed as read: OCR was right, now confirmed | 15 |
| parser error, fixed in the code | 4 |
| printing error in the document itself | 2 |
| excluded: another project's document filed under this bid | 1 |

The two printing errors:
- ITB26-059: the award is printed `(PHP31,545,00.00)` in the BAC resolution.
  The notice of award prints the same, with a handwritten "0" added and
  initialled.
- ITB26-120: the contract price is printed `(PHP 14, 992M 745.57)`.

For both, the value is the amount in words beside the figure.

| Bid | Column | Value | Outcome | Where |
|---|---|---|---|---|
| EPA26-010 | contract | 1,498,942.20 | parser error, fixed | `2026/06/epa26-010-contract_0001.pdf` p1 |
| EPA26-012 | ABC (invitation/RFQ) | 15,383,990.00 | printed as read | `2026/05/INVITE-EPA26-012.pdf` p1 |
| EPA26-019 | award (NOA) | 9,065,854.50 | OCR misread | `2026/06/epa26-019-noa_0001.pdf` p1 |
| EPA26-023 | PO total | 31,812,127.50 | OCR misread | `2026/06/epa26-023-po.pdf` p2 |
| ITB25-060 | ABC (BAC resolution) | 924,000.00 | OCR misread | `2026/07/itb25-060-bacreso_0001.pdf` p1 |
| ITB25-186 | contract | 594,500.00 | parser error, fixed | `2026/10/itb25-186-contract.pdf` p1 |
| ITB25-258 | ABC (invitation/RFQ) | 3,326,800.00 | printed as read | `2025/09/ITB2025-09-258.pdf` p1 |
| ITB26-025 | ABC (invitation/RFQ) | 79,475,948.00 | printed as read | `2026/05/ITB26-025.pdf` p1 |
| ITB26-025 | ABC (BAC resolution) | 79,475,948.00 | OCR misread | `2026/06/itb26-025-bacreso_0001.pdf` p1 |
| ITB26-025 | contract | 79,455,948.00 | OCR misread | `2026/06/itb26-025-contract_0001.pdf` p3 |
| ITB26-031 | ABC (invitation/RFQ) | 31,086,603.00 | printed as read | `2026/06/ITB26-03-031.pdf` p1 |
| ITB26-031 | amended ABC | 31,075,603.00 | printed as read | `2026/06/itb26-031-bacreso_0001.pdf` p1 |
| ITB26-031 | award (BAC resolution) | 31,044,614.17 | printed as read | `2026/06/itb26-031-bacreso_0001.pdf` p3 |
| ITB26-031 | ABC (BAC resolution) | 31,075,603.00 | printed as read | `2026/06/itb26-031-bacreso_0001.pdf` p1 |
| ITB26-031 | PO total | 31,044,614.17 | OCR misread | `2026/06/itb26-031-po.pdf` p10 |
| ITB26-035 | PO total | 39,945,940.88 | parser error, fixed | `2026/06/itb26-035-po_0001.pdf` p7 |
| ITB26-042 | NTP | 3,225,600.00 | OCR misread | `2026/06/itb26-042-ntp_0001.pdf` p1 |
| ITB26-045 | PO total | 4,480,000.00 | parser error, fixed | `2026/06/itb26-045-po_0001.pdf` p9 |
| ITB26-049 | contract | 1,497,977.49 | printed as read | `2026/06/itb26-049-contract_0001.pdf` p1 |
| ITB26-059 | award (BAC resolution) | 31,545,000.00 | printing error in the document | `2026/06/itb26-059-bacreso.pdf` p4 |
| ITB26-061 | award (NOA) | 19,602,152.00 | OCR misread | `2026/06/itb26-061-noa.pdf` p1 |
| ITB26-089 | award (BAC resolution) | 7,986,313.57 | OCR misread | `2026/09/BACRESO-ITB26-089-2-4.pdf` p3 |
| ITB26-120 | contract | 14,992,745.57 | printing error in the document | `2026/07/itb26-120-contract-2_0001.pdf` p1 |
| ITB26-129 | contract | — | excluded: another project | `2026/10/ITB26-129-contract-2_0001.pdf` p1 |
| ITB26-136 | ABC (invitation/RFQ) | 37,080,885.00 | printed as read | `2026/06/ITB26-05-136.pdf` p1 |
| ITB26-136 | ABC (BAC resolution) | 37,078,385.00 | printed as read | `2026/10/ITB26-136-bacreso-2.pdf` p1 |
| ITB26-143 | PO total | 153,951,487.60 | OCR misread | `2026/10/ITB26-143-po-2_0001.pdf` p5 |
| ITB26-144 | PO total | 95,096,316.57 | OCR misread | `2026/09/ITb26-144-po-2_0001.pdf` p3 |
| ITB26-151 | award (NOA) | 9,990,000.00 | OCR misread | `2026/10/ITb26-151-noa-2_0001.pdf` p1 |
| ITB26-182 | award (BAC resolution) | 33,099,716.80 | OCR misread | `2026/10/ITB26-182-bacreso-2_0001.pdf` p2 |
| ITB26-182 | award (NOA) | 33,099,716.80 | printed as read | `2026/10/ITB26-182-noa-2_0001.pdf` p1 |
| ITB26-182 | ABC (BAC resolution) | 33,299,850.00 | printed as read | `2026/10/ITB26-182-bacreso-2_0001.pdf` p1 |
| NPCS26-001 | ABC (invitation/RFQ) | 1,800,000.00 | printed as read | `2026/07/NPCS26-001.pdf` p1 |
| RFQ26-004 | ABC (invitation/RFQ) | 1,000,000.00 | printed as read | `2026/06/RFQ26-02-004.pdf` p1 |
| RFQ26-021 | ABC (invitation/RFQ) | 240,000.00 | printed as read | `2026/07/RFQ26-021.pdf` p1 |
| SVP26-177 | NTP | 150,480.00 | OCR misread | `2026/07/svp26-177-ntp_0001.pdf` p1 |
| SVP26-182 | award (NOA) | 368,000.00 | OCR misread | `2026/07/svp26-182-noa_0001.pdf` p1 |
| SVP26-190 | NTP | 200,000.00 | OCR misread | `2026/07/svp26-190-ntp_0001.pdf` p1 |

### 21. ABC at award, and award vs procurement

**ABC at award.** `abc_at_award` is the ABC that applied when the contract
was awarded. It is taken in this order:
1. `abc_amended`: the amended ABC, where a BAC resolution prints one ("amended
   Approved Budget for the Contract (ABC) equivalent to Php X").
2. The BAC resolution's ABC. The resolution comes after any bid bulletin.
3. The invitation's or RFQ's ABC.

`abc_at_award_source` names which was used, and `abc_at_award_minus_award`
is the difference.

All 211 bids with an award have one: 200 from the BAC resolution, 10 from
the invitation or RFQ, and 1 amended. Using the resolution's ABC, 18 awards
equal their ABC, against 8 using the invitation's. The 10 extra are bids with
no invitation or RFQ on the site (ITB25-192 and nine SVPs), where the
resolution's ABC equals the award.

**Amended ABCs (bid bulletins).** Two bids print different ABCs in the
invitation and the BAC resolution. In both, the resolution says a bid
bulletin amended the ABC by cancelling items.

| Bid | Invitation ABC | Amended ABC | Bulletin |
|---|---|---|---|
| ITB26-031 | 31,086,603.00 | 31,075,603.00 | printed "Addendum No. 23-03-002"; file `Addendum-No.-26-002-itb26-031.pdf`, "cancellation of two (2) items" |
| ITB26-136 | 37,080,885.00 | 37,078,385.00 | Addendum No. 26-06-012, 08 June 2026; file `SUPPLEMENTAL-NO.26-06-012.pdf` |

- ITB26-031's resolution, page 1, tells one story: the table's ABC row is the
  amended 31,075,603.00, the first WHEREAS paragraph restates the original,
  and a later paragraph states the amendment. All three were read by the
  person.
- ITB26-136's bulletin (OCR) shows ABC as posted 37,080,885.00, amended
  37,078,385.00, and total amount for cancellation 2,500.00. That is
  consistent: 37,080,885.00 − 2,500.00 = 37,078,385.00.
- **Not yet done:** a person reading either bulletin's table. Only that
  confirms these are amendments and not discrepancies. Until then, both ABCs
  stay side by side in the data.

**ABC vs award** (211 bids, using `abc_at_award`):

| Award under the ABC by | Bids |
|---|---|
| 0 (equal) | 18 |
| more than 0% up to 0.1% | 101 |
| 0.1–1% | 64 |
| 1–5% | 19 |
| 5–20% | 7 |
| more than 20% | 2 (ITB25-258 and EPA26-012, medical oxygen; both ABCs and awards read by the person) |

- No award is above its ABC.
- Total ABC at award: 3,899,494,569.94. Total awards: 3,858,176,136.75.
- The median award is 0.099% under its ABC.
- The award is the notice of award's, else the BAC resolution's. The two
  agree everywhere both are read.

**Award vs procurement.** "Procurement" here means the signed contract or
purchase order. What was paid (disbursement vouchers) is not published. The
notice to proceed restates the contract or PO amount, so it is a second-hand
source and is counted separately.

| Compared with the award | Bids | Differ |
|---|---|---|
| contract | 101 | 1: ITB26-049 (contract 1,497,977.49, award 4,497,800.02; the person confirmed both as printed) |
| PO total | 30 | 0 |
| notice to proceed | 102 | 0 |

- 131 of the 211 awarded bids have a contract or PO amount.
- 54 have only a notice-to-proceed amount.
- 26 have nothing to compare: 19 of them have a contract or PO file whose
  amount was not read, and 7 have no such file on the site.

**Requests for quotation.** RFQs are read for their ABC (step 17). 47 bids
gained an ABC: 25 in the RFQ26 series, 21 SVP and 1 NPCS. None of them has
an award on the site yet, because the posted RFQs and the awarded SVPs don't
overlap. The person confirmed three RFQ ABCs (NPCS26-001, RFQ26-021,
RFQ26-004), including one with an item breakdown, where the total was read.

### 22. Documents that gave no amount

Of the 1,525 linked PDFs, 1,111 gave at least one amount to
`procurement-amounts.json`. 414 gave none.

| Group | Files | Notes |
|---|---|---|
| not expected to hold a procurement amount | 57 | bid bulletins 32, requests for expression of interest 9, notices of postponement 8, terms of reference and untitled 8 |
| read elsewhere or not parsed yet | 52 | budget reports 30 (FRO, SAAOB, SARO, ordinances); PMRs and APPs 13; Full Disclosure Policy "Bid Results" 6; a downloadable form 1 |
| should give an amount but didn't | about 300 | notices to proceed 123 (many print no amount, e.g. infrastructure NTPs give only the duration); notices of award 72; requests for quotation 53 (counted before the RFQ reader was added); contracts and POs 55; invitations and resolutions 6 |

PMRs and Bid Results reports list each project's ABC and contract amount, so
they could later serve as an independent second source.

---

## Still to do

1. Settle rows 5 and 54 of `fro-offices.json`.
2. Run the document-type and printed-ID check on the labelled BAC documents (1,221 never appear unlabelled).
3. Add a Q1 2026 entry to `findings.json`: no FRO or SAAOB for January–March
   2026 is posted; recovery by FOI request to the City Budget Office or the DBM
   Full Disclosure Policy portal.
4. Procurement parsers. Done: ABC, amended ABC, fund, award, winner, and
   contract and PO amounts (steps 17, 21). Still to do:
   - BAC resolution: every bidder and bid, not just the winner
   - notice of award: the amount in words, as a second reading (needs a words-to-number converter)
   - contract/PO and notice to proceed: dates
   - the 19 awarded bids whose contract or PO amount wasn't read, and the
     notices of award that gave no amount (step 22)
5. One `extracted/<path>.json` per PDF (value, page, source text, which text
   file), then combined `budget-2026.csv/.json` and `procurements.csv/.json`.
6. Comparison script. Done per bid for procurement (steps 17, 21). Budget
   (FRO vs SAAOB) is still to do.
7. Review. The flagged readings are done (step 20, 38 readings) and the review
   list is empty. Still to do:
   - a person reading the tables of the two bid bulletins (ITB26-031,
     ITB26-136);
   - about 30 random values checked against the scans;
   - the IQR list (step 18), which still uses the invitation's ABC and should
     move to `abc_at_award`.
8. Stacked PRs: scraper and catalog → legacy and findings → OCR → parsers.
   For now, the work is committed straight to `main`.
9. Show ABC vs award per bid on the site, from `procurement-amounts.csv`:
   `abc_at_award`, the award, the difference, links to the source PDFs, and
   which values were checked against the scan. Numbers only, no labels.
10. Decide whether the generated files (`procurement-*.json/.csv`,
    `by-month.json`) stay in git or are rebuilt from the scripts.
