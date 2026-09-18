# docs/ entry point

This directory holds the project knowledge base for pokebuddy. This file is the map. Read it before you write or change any file in `docs/`.

## Document map

| File | Holds |
| --- | --- |
| [`design.md`](design.md) | Accepted architecture and design decisions. One row per decision. |
| [`progress.md`](progress.md) | Current stage, next action, and validation status. |
| [`plan-<stage>.md`](plan-s5.md) | Plan and design for one stage or one focused task. |
| [`review-<stage>.md`](review-s5.md) | Review findings, evidence, and fixes for one stage or task. |
| [`history.md`](history.md) | Dated record of completed work cycles. |
| [`terms.md`](terms.md) | Canonical name and meaning for each user-facing term. |
| [`guide.md`](guide.md) | Install steps, commands, settings, and how the app works. |
| [`roles/`](roles/design.md) | Instructions for each step of the work cycle: design, work, review, feedback, revision. |

Root [`README.md`](../README.md) and [`vscode-extension/README.md`](../vscode-extension/README.md) are user-facing product pages. They keep their own voice. The rules on this page apply to the files listed in the table above.

## Evidence priority

When two documents disagree, trust them in this order:

1. Source code and configuration in `src/`, `data/`, `lib/`.
2. Data files and generated schemas (for example `data/natures.json`, `data/species.defaults.json`).
3. Self-tests and check scripts (`npm run check`, `npm run selftest`).
4. Reviewed documents (`review-<stage>.md`).
5. Unreviewed notes and plans.

Update the losing document instead of deleting the disagreement. See "Keep corrections as new records" below.

## Marking unconfirmed or planned items

Do not add a new label set for this. Use the bracket tags from the user's global writing rules, for example `[스펙 미확정]`, `[임시]`, `[백엔드 API 연동 대기]`, `[권한 기반 작업 예정]`, `[성능 개선 여지]`, `[리팩토링 대상]`. Put the tag next to the sentence it qualifies. A decision without a tag is treated as final.

## ASD-STE100 writing rules

These rules apply to the sentences and table cells inside the documents in the map above. They do not require English text — write Korean content in Korean. They do not forbid tables; a table is often clearer than prose for this kind of record, so keep the table and apply the rules inside each cell.

- Write one fact or one instruction per sentence. Split a cell into a short list when it holds more than one fact.
- Use the exact name for a path, command, API, table, or field. Do not paraphrase an identifier.
- Use the same term for the same concept everywhere. `terms.md` is the source for user-facing terms; internal identifiers keep their code name.
- State the condition before the action when the condition changes the result (for example: "칸이 비어 있으면 해금한 종을 얻는다").
- Avoid vague words, idioms, and marketing language in these documents (root and extension README pages are exempt; see above).
- Keep fact, decision, assumption, and open question separate. Do not fold an assumption into a statement of fact.
- Keep corrections as new, dated records. Do not erase or silently rewrite past history entries.
- Write dates as `YYYY-MM-DD`.

Korean prose cannot claim full formal ASD-STE100 compliance, because the standard defines an approved English vocabulary. Apply the principles above to Korean text for clarity, not as a compliance claim.
