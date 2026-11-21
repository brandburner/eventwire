# Pilot drafting brief

Audience: a person trying to use GOV.UK guidance, with a content designer reviewing the proposed change.

Use complete captured content, a capture date and content hash, provision-level evidence, commencement and transition evidence. Start each batch from the latest available Eventwire page-to-legislation matches and review signals as well as the original audit. Record the feed generation time, exact matched page URL and legal-source links. Follow the matched sources to verify operative rules; a signal is an investigation lead and an absent match does not clear a page. Check whether the captured page already addresses the finding before drafting. A no-change decision is valid.

Write the smallest sufficient change. Use plain English, short sentences, descriptive headings, active voice and the reader's task. Preserve links, headings and unaffected content. Distinguish a qualifying period from a claim deadline. Preserve geographic scope, exceptions and adjacent rules. Six months is not a Day-1 right. An internal target is not a commencement date. Never infer that every protection applies automatically.

For each proposed edit return: exact original passage, replacement HTML, chapter slug, rationale, cited source identifiers, publication timing, territorial scope, adjacent rules preserved, and unresolved policy questions. The original passage must match the pinned source exactly. Do not invent links, policy details, dates or evidence. If evidence conflicts, report the conflict and withhold the affected edit.

Separate necessary policy changes from optional content improvements. Do not take a whole-page rewrite mandate from a keyword hit. Do not silently change unrelated thresholds, claim deadlines or protections. Keep uncertainty in reviewer metadata rather than public copy.

## GOV.UK writing standards and optional corrections

Read the pinned [GOV.UK writing standards](writing-standards.html), included as a reference page in this prototype. Apply them to newly drafted policy wording. Existing wording may receive small, separately proposed corrections under the limits below.

- Use plain English, descriptive headings and the reader's task. Prefer simpler common words where meaning is unchanged.
- Propose local corrections to negative or complex contractions, eg/ie, unnecessary “please” wording or stray punctuation where the standards support them. Split sentences only when every condition remains unambiguous.
- Preserve qualifiers, exceptions, dates, numbers, links, titles and page structure. Preserve quotations and names verbatim.
- Do not turn “may be able to” into “can”, change must/need/can, invent actors for passive sentences, replace legal terms, expand incomplete lists or simplify eligibility. Flag anything needing policy interpretation.
- Propose at most four isolated corrections per page in this pilot. There is no minimum quota and no broad style cleanup.
- For each correction, record its type (tone, plain-English wording, contractions, structure, titles and summaries, links, or A to Z style), cite the standards section and explain the reason. Keep detected concerns, optional proposals and findings needing judgment distinct. Record review coverage; no findings does not mean every standard was checked. Supply exact, unique, non-overlapping original/replacement HTML anchors. Each patch must work independently.

Preserve the policy baseline independently. Optional corrections are applied only to a reviewer's selected composition and must remain separately visible and removable. A writing correction never clears a policy blocker or approves a whole page.

Agent workflow: one page and one tightly scoped measure per job, with connected pages escalated together when necessary. Fetcher saves complete Content API content plus evidence and hashes. Drafter receives that packet with no publishing credentials. Validator checks exact anchors, unchanged regions, links, numerical claims and evidence coverage. Human policy and content owners approve publication. Batches 3 and 4 used delegated Sol agents; their cost telemetry was unavailable. No paid external model API calls were made by the prototype.

## Publication-day model

Draft the content that will be current on the intended go-live date. Use present tense and replace superseded rules; do not append an advance announcement or describe forthcoming changes from the capture date’s viewpoint. Keep the intended publication date in reviewer metadata. Include earlier rules in public copy only when readers still need them to determine the rules applying to their case. A dated cohort distinction is user guidance, not a change announcement. Preserve unrelated rules and make scope limitations visible to reviewers. The dismissal drafts are intended for 1 January 2027; whistleblowing has no proposed change or scheduled publication.
