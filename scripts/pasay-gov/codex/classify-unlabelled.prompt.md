# Classify the unlabelled BAC documents

You are classifying procurement documents published by the Bids and Awards
Committee (BAC) of the City Government of Pasay on pasay.gov.ph. Each one is a
PDF that the site links without a label. Your job is to say what kind of
document each one is, from what is printed in it.

Work read-only. Do not create, edit or delete any file. Your final message is
the result, in the JSON schema you were given.

## Input

`data/pasay-gov/unlabelled-docs.json` lists 177 documents. For each:

- `file`: the document's path on the site (under /wp-content/uploads/); use it as the document's ID in your answer.
- `texts`: text files to read, in order of preference. `ocr/<name>.txt` is OCR of the scan with the page layout kept, pages split by form feeds (\f). `ocr/<name>.red.txt` is a second OCR reading of a hard-to-read scan. `manual/<name>.txt` is a hand-typed copy; when present, it is the most reliable.
- `pdf`: the PDF itself. Look at the PDF only when the text is too garbled to read the document's title.
- `linked_from_entry`, `entry_series`, `entry_title`: the site entry whose page links the document. **This is not evidence of what the document is.** The city often attached a whole batch of PDFs to the first entry of the batch, so a document can belong to a different bid than the entry linking it. Classify from the document's own text only.

## Types

Every document gets exactly one `type`: the document on its first page. Use only these:

| type | the document's own title or opening |
|---|---|
| `bid-invitation` | "Invitation to Bid" (public bidding; ITB numbers) |
| `request-for-quotation` | "Request for Quotation" (small value procurement, negotiated procurement; SVP or RFQ numbers) |
| `request-for-expression-of-interest` | "Request for Expression of Interest" (consulting services; REI numbers) |
| `bid-bulletin` | "Supplemental / Bid Bulletin", "Addendum" |
| `notice-of-postponement` | "Notice of Postponement", or a notice changing a bidding schedule |
| `bac-resolution` | A BAC resolution ("Resolution No.", "Resolution declaring ...", "recommending award ...") |
| `notice-of-award` | "Notice of Award" |
| `contract-purchase-order` | A contract agreement, or a purchase order |
| `notice-to-proceed` | "Notice to Proceed" |
| `bidding-documents` | "Philippine Bidding Documents" |

Every document is one of these. If the first page is a cover letter, transmittal or
blank, classify by the first document after it, and say so in `note`.

Many files hold several documents one after another (e.g. a notice of award, then a
contract, then a notice to proceed). `type` is the first; list every document in the
file, in order, in `contains`, each with the page it starts on.

## What to report for each document

- `file`: as given.
- `type`: one of the types above.
- `title_line`: the line on the first page that shows the type, copied exactly as it appears in the text you read (OCR errors and all).
- `title_page`: the page that line is on (1 = first page).
- `contains`: every document in the file, in order: `{type, page}`.
- `bid_id`: the procurement number printed in the document (e.g. "ITB26-02-025", "SVP No.: 2026-08-315", "REI26-003"), copied exactly as read; empty string if none is printed.
- `source`: which text file you read (`ocr`, `red`, `manual`) or `pdf` if you had to look at the PDF.
- `note`: empty, or one short sentence of fact (e.g. "page 1 is a transmittal letter"). No opinions about the procurement itself.

Report all 177 documents, in the order of the input file. Do not skip any.
