# Referenceable customers for marketing

Status: all six points decided with the owner (2026-11-06); not built.
Background research: `reports/Customer lists for marketing and sales.md` (superseded where this file differs).

## The owner's model

- Anyone who has ever been a customer and is happy is a candidate, former customers included. How long to keep naming a past customer is the owner's call.
- Customers live in a roster kept by Sales (or the best suited member hired, decision 5), the source of truth. Every newly won customer becomes a candidate.
- Whether explicit consent is needed is the owner's decision. Marketing never drops a customer for lack of consent; with no evidence of consent anywhere, it asks the owner once for that customer.
- Marketing drops a customer on recorded evidence of dissatisfaction, or when the owner says so, and records the reason for every inclusion and exclusion.
- Members ask teammates for facts but never give them work. Evidence one member finds that changes Marketing's list (a complaint to Support, say) goes to Michael, who hands it to Marketing, or takes it to the owner when it is unclear.

## Decision 1: the foundation answer is the rule and where the list is

Decided 2026-11-06.

- Marketing's foundation question becomes "Who are our referenceable customers for marketing content". Its answer is short (under the 300 character cap, not a list question): who counts, whether to ask before naming, and that Marketing keeps the list. Example: "Any happy current or past customer. Ask me before naming one unless they agreed. Marketing keeps the list."
- Why: a list answer caps at 1,000 characters, holds no reason per name, and only the owner can change it once answered. A living list with reasons cannot work inside it.
- The list itself is a file Marketing keeps in its own folder, `Reference customers.csv`. Only Marketing writes it. The owner and Michael can open it; other members ask Marketing (members' folders are private to them).
- One row per customer, the current decision:

| Column | Holds |
|---|---|
| Customer | Company or person, as the roster names them |
| Relationship | Current, or former since a month |
| Status | Usable, Ask owner, or Excluded |
| May be used for | Any of: name, logo, case study, social post, quote |
| Why | One line reason for the status |
| Source | Where the evidence is: a mail subject and date, a teammate and date, a file path, or the owner's answer |
| Decided by | Owner, Michael by the owner's rule, the customer, or Marketing from evidence |
| Decided on | Date |
| Last used | Date and where, blank if never |

- A changed decision never overwrites silently: the old row moves to `Reference customers history.csv` with the date it ended.
- When the owner edits the file directly, Marketing treats the edited rows as the owner's decision.
- Generic for every office: the file is named by the role, not a person; a shop or restaurant lists people who wrote in or left reviews, a services firm lists client companies.

## Decision 2: news flows in through Michael, questions go up at story time

Decided 2026-11-06.

- The roster keeper (Sales when hired, otherwise the best suited member, decision 5) keeps every customer ever closed.
- Marketing does not hold every customer (owner, 2026-11-06): its list holds only customers it may reference, and those it decided not to, with the reason. Generic posts need only the ideal customer, brand voice and the other foundations.
- First runs: when Marketing's list is empty or thin, it asks the roster keeper and the teammates in contact with customers for customers with a positive sentiment ("act": "query"), and starts the list from those.
- After that, news is pushed. When the roster keeper closes a deal, it tells Michael, and Michael hands it to the roster keeper's records only. When any member reports a customer's sentiment (an angry email to Support, praise, a "please don't name us"), Michael hands it to the reference list's keeper, who adds or updates the row; a new customer with no sentiment yet does not go to Marketing. A customer marked Excluded after a complaint goes back to Usable when later evidence shows them happy again; the history file keeps both.
- What a member reports about a customer, so Michael is not flooded (owner, 2026-11-06). A member reports only when one of these is true, judged against what it last reported for that customer, which it keeps in its own memory:
  - a customer it has never seen before, who has bought (not a lead, supplier or stranger);
  - a clear positive or negative sentiment, the first time it sees one for that customer;
  - the sentiment flipped since its last report, negative to positive or positive to negative;
  - the customer left.
  What a customer says about being named is sentiment (owner, 2026-11-06): agreeing to be named or giving a testimonial is positive; "please don't name us" is negative.
  The same sentiment again, in any number of later emails, is not reported, testimonials included (owner, 2026-11-06: messages will never catch them reliably).
  A routine question or request with no clear sentiment is not reported.
- Testimonials are Marketing's own job: it collects and keeps them, and asks teammates to look for them. Before it names a customer in a story, its one teammate check asks for two things: any testimonial or praise in the customer's own words, and anything the customer said about being named. That check also catches a "please don't name us" that a member skipped as same sentiment (a customer already negative after a complaint).
- A "please don't name us" holds until the customer says yes again or the owner decides. Later happy emails do not undo it, so Marketing records it as its own reason ("Excluded: asked not to be named"), separate from "Excluded: complaint".
- Duplicates from two members (Support and the mail reader both see one angry email) cost Marketing one look: the row already matches, so nothing changes.
- Michael routes to whoever the foundation answer names as the list's keeper, not to a title, so it holds when the role is renamed. An office that keeps no list (no keeper hired) drops these hand-offs.
- When Marketing writes a story, it picks customers from the list. When it cannot tell from the list whether a customer may be named, it asks Michael, saying what the row and its teammates show. Michael decides by the owner's foundation rule. When the rule does not settle it, Michael asks the owner. The decision goes on the row (Decided by: Michael or Owner), so the same customer is not asked about again unless new evidence changes the row.
- The owner's rule sets how often the owner is asked: "name any happy customer" lets Michael decide most; "ask me first unless they agreed" sends every customer without evidence to the owner, once.

Agent behavior changes (each listed for the owner at ship):
- The roster keeper: keeps every customer ever closed, and tells Michael about every closed deal. Today nobody keeps a roster.
- Every member: tells Michael about a customer only on the triggers above, and remembers what it last reported for each customer. Today such news stays with whoever received it.
- Michael: hands those to the list's keeper; decides "may we name them" by the owner's rule, and asks the owner only when the rule does not settle it.
- Marketing: keeps the list, starts it from the roster keeper, and checks it before every story.

## Decision 3: a yes names the customer; a quote needs the customer's words

Decided 2026-11-06.

- A yes from the owner, or from Michael by the owner's rule, is recorded as that (Decided by: Owner or Michael), never as the customer's consent. It covers naming the customer, their logo, and a case study written from the office's own records.
- A quote is only ever the customer's own words, copied exactly, with where it was found. Marketing never writes, polishes or paraphrases a quote in a customer's name.
- When Marketing has no quote for a customer it wants to quote, it asks every teammate in direct contact with that customer, by role: whoever reads the owner's mailbox, Sales, Customer Support, and any other role whose work touches customers, in one round. What they send goes into Marketing's testimonials with its source.
- When none has one, the story goes without a quote. (Proposed, not yet decided: Marketing may suggest asking the customer for one; that email goes out like any other, under the office's sending setting.)

## Decision 4: agents judge sentiment, with a few firm rules

Decided 2026-11-06 (owner: "no need to make it super strict").

- Members and Marketing judge whether a message is positive, negative or neither when the signals are not clear. No word lists or scoring.
- Firm rules: a customer with an open issue or an ongoing escalation is negative while it is open. A complaint, a refund or dispute, an angry review, a threat to leave, and "please don't name us" are negative. The customer is Excluded while negative is the latest sentiment, with the reason and source on the row.
- Reporting a return to positive (an issue closed, a thank you) is left to the member's judgment; Marketing's teammate check before a story catches any it skipped.
- Exclusion reasons on the row: complaint or frustration (undone by a later positive sentiment), asked not to be named (undone only by the customer's yes or the owner), and the owner's decision.
- When a member cannot tell whether a message is frustration, or Marketing wants a second opinion on an Excluded customer (a long happy customer with one bug report, say), it asks Michael. Michael decides by the owner's rule, or asks the owner. The answer goes on the row.
- Effect: a customer with an open problem is off the list until it is resolved or a positive sentiment brings them back, so Marketing never features a customer mid problem.

## Decision 5: a standing duty sits with the best suited member, rechecked at every hire

Decided 2026-11-06 (owner: Michael orchestrates and never manages work; no hard coded order; the harness has one generic rule that, at each hire, checks whether the new member suits a duty better than whoever holds it).

- Michael never keeps the roster, the reference list, or any other record, except when he is the only one in the office (foundations-rules-not-records.md, decision 8); he hands each over at the first hire.
- A standing duty is anything a member keeps or does for the office on an ongoing basis: the customer roster, the reference list, testimonials, a recurring report. Each lives as a line in its holder's Work style, so every holder is visible in one place.
- First holder: when a duty has no holder, Michael gives it to the member whose role suits it best, judged from every member's role. With no clear owner, the member with the most contact with that kind of fact takes it (only an Executive Admin reading the mail: that member).
- At every hire, Michael reads the new member's role against every standing duty held by others and moves each duty the new member is clearly better suited for. Example: only an Executive Admin, so it keeps the roster; Finance is hired, the roster moves to Finance; Sales is hired later, it moves to Sales. The same check runs when a holder is archived, to pick the next holder.
- A move: the old holder hands its file over through Michael (Michael hands on an archived holder's file), the duty line leaves one Work style and joins the other, and Michael tells the owner in one report what moved and why.
- A duty that needs a capability the new member does not have yet (new hires start with every capability off) moves only once the owner turns that capability on.
- The hire wizard's distinct job check must not flag "better suited for a duty someone holds" as an overlap that blocks the hire: moving the duty is the plan, not a clash.
- The owner can pin a duty to a member; a pinned duty does not move at a hire.
- Michael moves a duty on his own and reports it to the owner afterwards; he does not ask first (owner, 2026-11-06). The owner can move it back or pin it.
- A new customer someone else sees first (one the owner closed, seen by Finance or Support) is reported to Michael under decision 2, and Michael passes it to the roster keeper as well as the reference list's keeper.
- For a shop or restaurant, the roster holds customers the office knows by name (wrote in, ordered by name, left a review), not every sale.

## Decision 6: retire "Who our customers are today"

Decided 2026-11-06.

- An office that answered it has the answer copied into the roster keeper's file, one row per name, with the source "the owner's foundation answer" and its date. With no roster keeper hired yet, the answer stays until one is, and the copy happens then.
- The question is retired: no longer asked, no 90 day shelf life check, and gone from Marketing's foundation questions.
- Marketing's foundation questions become: ideal customer, voice, brand, offer, competitors, and "Who are our referenceable customers for marketing content" (decision 1).
