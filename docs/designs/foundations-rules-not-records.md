# Foundations hold rules, not records

Status: all eight decisions taken with the owner (2026-11-06); not built.
Research: `reports/Foundations versus systems of record.md`. Related decided design: `docs/designs/referenceable-customers.md`.

Owner's thesis: a foundation question matters only when (1) a fact is so specific and key that keeping it in one text saves expensive calls to another system, or (2) no system manages the area and an agent keeps the record. A foundation never copies a connected system's records.

## Decision 1: four kinds of question, five rewordings

Decided 2026-11-06.

- Every foundation question is one of four kinds. The kinds are internal: the owner never sees them; they decide who fills an answer and when a question stops asking the owner.

| Kind | Holds | Examples |
|---|---|---|
| Always a foundation | A rule or map no system holds | ideal customer, voice, brand, competitors, policies, hours, who handles what, our systems |
| Foundation only while no system covers it | A short answer until a system is connected | common customer questions |
| Where it lives | One line naming the system or the member who keeps the record | deals, who owes whom, bookings, stock |
| Copied from a system | A small fact copied from the books, with its date | accounting method, financial year |

- Rewordings:

| Question today | Reworded |
|---|---|
| Prices and terms | Pricing rules and payment terms, and where the price list is kept |
| Statements, budgets or targets | Our targets or budget, and where statements are kept |
| Suppliers and how we order | How we order from suppliers, and where the supplier list is kept |
| Who owes whom | Where we keep who owes us and whom we owe |
| Common customer questions | Common customer questions and their answers, or where they are kept |

- No version bump for prices, results, suppliers and common questions: an existing answer still fits, it only says more.
- "Who owes whom" stops being a list question and an existing answer no longer fits, so it ships together with decision 6 (its list copied into Finance's invoices and bills record first).

## Decision 2: a "where it lives" answer switches only after the member checks the system holds the record

Decided 2026-11-06.

- When a member is given access to a system, it checks each "where it lives" or "copied from a system" question its job touches: does the system actually hold that kind of record, with recent entries (deals in the CRM, bills in the books, bookings in the calendar)?
- If it does, the member fills the answer with the system, the keeper's own file is frozen as history, and Michael's report says so. An answer the owner wrote is replaced only after one confirm card.
- If it does not, nothing changes, and Michael's report says the system is connected but the record is still kept by the member.
- Which questions a system could hold is the member's judgment, not a fixed table of systems, so it works for any system an office connects.
- This checks only that the system holds that kind of record. It never compares the system's records with a list (the comparison the owner dropped on 2026-11-03, D10).

## Decision 3: what a read only system is missing goes on one open card for the owner

Decided 2026-11-06.

- No agent keeps a side list of what a connected system is missing; that would be the stale second copy this design avoids.
- A keeper allowed to change the system adds the item, under the office's normal approvals.
- When no member can change it, the member that saw the gap tells Michael, as members already report. Michael folds each item into one open card for that system (such as "Add to HubSpot"), with what was seen and where, under his existing rule of one card per matter. The owner clears the card once added; the next item starts a new card. No new schedule.
- Until the owner adds an item, agents reading the system do not see it. Where that gap matters, the fix is change access for the keeper, not a side list.

## Decision 4: on disconnect, Michael asks the owner once whether the office still uses the system

Decided 2026-11-06.

- When a system is disconnected, or the member that read it loses access, Michael raises one card: is that system still where the office keeps this record (such as "Is HubSpot still where you keep deals?")?
- Yes: the "where it lives" answer stays, marked that no teammate can read it, and no agent keeps a copy. Facts copied from the system are marked "last known" with their date.
- No: the keeper takes the record back, starting from its frozen file marked "as of" the date it froze.
- A lapsed login is not a disconnect: the owner gets a reconnect card, and nothing else changes.

## Decision 5: a connected system is an answer source, accepted without Michael checking it

Decided 2026-11-06.

- New source for a member's foundation answer: a connected system, naming the system and the date read.
- The app accepts it only from a member that has access to that system (the app checks the grant itself), and only for "where it lives" and "copied from a system" questions. A rule question can never come from a system.
- Michael does not check it: the member's check in decision 2 is the one check (owner's one check rule, 2026-11-06).
- It never replaces an answer the owner wrote without the confirm card from decision 2.

## Decision 6: retire the who owes whom and supplier name lists

Decided 2026-11-06.

- An office that answered either list: when no system holds that record, the list is copied into its keeper's file, one row per name, with the source "the owner's foundation answer" and its date (who owes whom into Finance's invoices and bills record; suppliers into the supplier list). Keepers follow the standing duty rule (referenceable-customers decision 5).
- When a connected system holds the record (bills and vendors in the books), nothing is copied: the answer points to the system and the old list is kept as a dated note.
- Agent behavior change: members stop sending seen items for these two lists. A new supplier or debt a member sees goes to Michael, who hands it to the keeper, as customers already do.
- Where money moves, who handles what, and our systems stay list questions: short maps the owner owns.

## Decision 7: nine records kept by the team first

Decided 2026-11-06.

- First: customer roster, reference list and testimonials, deal pipeline, support log, project tracker (with the new question "Where client work and projects are tracked"), invoices and bills, supplier list, stock record, bookings list.
- Later: access register, content log.
- Each record is a file in its keeper's folder plus one line in the keeper's Work style; keepers follow the standing duty rule. The shared app work is the duty check at every hire and archive and the foundations changes, so a record added later is mostly text.
- Where a connected system holds a record (decision 2), the answer points to it and no file is kept, so most offices keep fewer than nine files: a calendar usually holds bookings, a shop or till system usually holds stock.

## Decision 8: Michael keeps a record only when there is nobody else

Decided 2026-11-06 (owner: "imagine a one person office where boss becomes employee if there is no one to delegate to").

- When no member could keep a record, the record goes to Michael only when he is the only one in the office: no team members at all. Research does not count, because it saves nothing about the business.
- Any other time, Michael orchestrates and keeps nothing.
- At the first hire, the hire check moves each record Michael kept to the best suited member, and Michael hands the file over, as any keeper does.
