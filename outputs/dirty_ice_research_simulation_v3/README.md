# Paper-Calibrated Dirty-Ice Radar Simulation v3

V3 is the interpretation layer on top of the v2 paper-calibrated signal simulation.

It does not claim to be a NASA mission processor. It turns the v2 echo outputs into a transparent confidence score so the workbook can answer: if REASON saw this bright echo, how confident should we be that it is actually the ocean?

Main outputs:

- `paper_calibrated_v3_point_confidence.csv`: one row per v2 radar point with confidence score, risk components, and interpretation label.
- `paper_calibrated_v3_confidence_summary.csv`: scenario x band summary for dashboard use.
- `paper_calibrated_v3_uncertainty_ranges.csv`: optimistic, nominal, and pessimistic interpretation cases.
- `paper_calibrated_v3_cross_instrument_evidence.csv`: how other Europa Clipper measurements could support or weaken a radar interpretation.
- `paper_calibrated_v3_false_ocean_case_studies.csv`: real example points from the simulation, including false-boundary and clutter cases.
- `paper_calibrated_v3_headline_conditioning.csv`: headline percentages with their denominator and conditioning stated explicitly.

Headline checks from this run:

- High-confidence ocean candidate rows across all point/band cases: 27.0%.
- Ambiguous, false-boundary, or clutter-risk rows across all point/band cases: 44.0%.
- Not-interpretable or no-deep-call rows across all point/band cases: 22.1%.
- Summary rows generated: 81.

Band-conditioned headline checks:

| conditioning | rows | high_confidence_ocean_pct | moderate_or_high_ocean_pct | ambiguous_false_or_clutter_pct | not_interpretable_or_no_deep_call_pct |
| --- | --- | --- | --- | --- | --- |
| band_HF_9MHz_full_depth | 6507 | 39.93 | 44.78 | 50.16 | 5.06 |
| band_VHF_60MHz_full_depth_lowDR | 6507 | 27.17 | 27.17 | 50.99 | 21.84 |
| band_VHF_60MHz_shallow | 6507 | 13.82 | 15.21 | 30.75 | 39.4 |

Scoring caveat: the confidence score is a decision aid for a sensitivity simulation. It is not a probability from real REASON Europa data.
