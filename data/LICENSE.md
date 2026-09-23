# Dictionary data — CC BY-SA 4.0

The adapted dictionary in `words.csv` and `chunks/*.json` is distributed under
Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0):
https://creativecommons.org/licenses/by-sa/4.0/
Full legal terms: https://creativecommons.org/licenses/by-sa/4.0/legalcode

Attribution: WikDict by Karl Bartel, based on contributions by Wiktionary
contributors, extracted through the DBnary project.

- WikDict: https://www.wikdict.com/
- Data and licensing: https://www.wikdict.com/page/download
- Provenance: https://www.wikdict.com/page/about
- Wiktionary: https://www.wiktionary.org/
- DBnary: https://kaiko.getalp.org/about-dbnary/
- Original snapshot: https://download.wikdict.com/dictionaries/sqlite/2_2026-06/en-ru.sqlite3
- Snapshot: 2026-06; retrieved 2026-09-22.

Vocoby modifications: filtered entries by the upstream is_good flag; excluded
proper nouns, uppercase entries, phrases, long words and unsuitable translations;
removed Russian stress marks, retaining ё and й; selected one translation per
English spelling using upstream scores and deterministic tie-breaking; merged
150 original Vocoby starter entries; assigned imported words to an ungraded
category; converted to CSV and alphabetic JSON chunks of at most 200 words.

The 150 original starter entries in starter.csv were authored for this project
and are also made available under CC BY-SA 4.0 as part of this adapted dictionary.
Their A1–B1 labels are approximate, not certified CEFR classifications.

Source entry links, lexentry identifiers and selected English sense descriptions
are retained in words.csv for WikDict-derived entries. Import counts and SHA-256
checksums are in import-report.json. Automated selection is not editorial review;
translations may be specialized, ambiguous, dated or unsuitable for some contexts.
No endorsement by WikDict, Wiktionary or DBnary is implied.

The repository's root LICENSE applies to software, not to this dictionary data.

## most 1000 collection

The English word selection in `most-1000.csv` comes from Vocabulary.com,
“The Vocabulary.com Top 1000”: https://www.vocabulary.com/lists/52473
(retrieved 2026-09-23). Only the 1,000 headwords are included, without their
definitions or example sentences. No endorsement by Vocabulary.com is implied.
This attribution does not assert that Vocabulary.com's content is CC BY-SA.

Russian translations reuse the attributed Vocoby/WikDict dictionary where
indicated in the CSV, with additional translations and corrections by Vocoby.
Those additional translations are provided under CC BY-SA 4.0. Generated
translation cards are in `most-1000/chunks/`; source attribution is in the CSV.
