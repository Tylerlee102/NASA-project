# Research Results Audit

Scope checked: current GitHub Pages site files, the v30/v19 browser model, and the current dirty-ice v2/v3 result generators under `outputs/dirty_ice_research_simulation_v2` and `outputs/dirty_ice_research_simulation_v3`. Older archived workbook builders and plotting prototypes were not changed unless they fed the current headline path.

## 1. Solver Sanity Checks Were Labeled Like Physics Validation

Severity: Medium

Location:
- `outputs/dirty_ice_research_simulation_v2/paper_calibrated_dirty_ice_v2.py:998`
- `outputs/dirty_ice_research_simulation_v2/paper_calibrated_dirty_ice_v2.py:1372`

Plain-language issue:
The v2 output file was named `physics_validation_checks`, and the HTML report called the section "Physics Validation Checks." One of those checks compared the single-interface solver result against the same Fresnel helper used by the single-interface solver branch. That is useful as an implementation sanity check, but it is not independent physical validation.

Fix applied:
- Added an `evidence_type` column saying these are solver sanity checks, not independent physical validation.
- Added a `limitation` column explaining what each check does and does not prove.
- Changed the report heading to "Solver Sanity Checks, Not Independent Physics Validation."
- Regenerated v2 outputs.

Before/after numbers:
- Numeric values did not change.
- Single-interface check remains `observed = 0.11499787394931256`, `expected = 0.11499787394931256`, `passed = True`.
- No-contrast check remains `observed = 0.0`, `expected = 0.0`, `passed = True`.
- The corrected output now makes clear these are implementation checks, not external evidence.

## 2. V3 Headline Percentages Needed Explicit Conditioning

Severity: Medium

Location:
- `outputs/dirty_ice_research_simulation_v3/paper_calibrated_dirty_ice_v3.py:641`
- `outputs/dirty_ice_research_simulation_v3/paper_calibrated_dirty_ice_v3.py:741`
- `outputs/dirty_ice_research_simulation_v3/README.md:14`

Plain-language issue:
The v3 README reported broad headline percentages "across all point/band cases." That number mixes shell modes, scenarios, along-track positions, and radar bands. It was not mathematically wrong, but it was easy to compare it against band-conditioned numbers as if they had the same denominator.

Fix applied:
- Added `paper_calibrated_v3_headline_conditioning.csv`.
- Added `paper_calibrated_v3_headline_conditioning.json`.
- Updated v3 metadata to include the headline-conditioning records.
- Updated the v3 README to show all-case and band-conditioned headline numbers side by side.
- Regenerated v3 outputs.

Before numbers:
- High-confidence ocean rows across all point/band cases: `27.0%`.
- Ambiguous, false-boundary, or clutter-risk rows across all point/band cases: `44.0%`.
- The README did not show the no-call share or band-conditioned denominator next to those headlines.

After numbers:
- All point/band cases: high-confidence `27.0%`, ambiguous/false/clutter `44.0%`, not-interpretable/no-deep-call `22.1%`.
- HF 9 MHz full-depth only: high-confidence `39.93%`, ambiguous/false/clutter `50.16%`, not-interpretable/no-deep-call `5.06%`.
- VHF 60 MHz full-depth low-DR only: high-confidence `27.17%`, ambiguous/false/clutter `50.99%`, not-interpretable/no-deep-call `21.84%`.
- VHF 60 MHz shallow only: high-confidence `13.82%`, ambiguous/false/clutter `30.75%`, not-interpretable/no-deep-call `39.4%`.

## 3. V30 Website Controls Looked More Authoritative Than They Were

Severity: Medium

Location:
- `docs/index.html:110`
- `docs/index.html:118`
- `docs/model.js:582`
- `docs/model.js:596`
- `docs/model.js:857`
- `README.md:7`

Plain-language issue:
The v30 page described the controls as "v30 dynamic results and graphs" and said graphs were recalculated from editable v30 inputs. The browser formulas are useful for interactive sensitivity testing, but they are not an independent rerun of the Excel workbook or a NASA mission processor. Leaving that unstated could make the interactive numbers look more validated than they are.

Fix applied:
- Renamed the section to "v30 workbook results with live sensitivity controls."
- Changed chart notes to say "Interactive browser sensitivity model; not an independent rerun of the v30 workbook."
- Updated the root README with the same caveat.

Before/after numbers:
- No numeric outputs changed.
- This was a labeling and claim-boundary fix: the same interactive controls remain available, but their evidentiary status is now explicit.

## Verification Run

Commands run:
- bundled Python: `outputs\dirty_ice_research_simulation_v2\paper_calibrated_dirty_ice_v2.py`
- bundled Python: `outputs\dirty_ice_research_simulation_v3\paper_calibrated_dirty_ice_v3.py`
- bundled Node: `--check docs\app.js`
- bundled Node: `--check docs\model.js`

Result:
- v2 regenerated successfully.
- v3 regenerated successfully: `19521` point-confidence rows and `81` summary rows.
- Browser JavaScript syntax checks passed.

## Residual Caveats

- The v30 browser model is still a sensitivity model. Treat it as assumption-testing, not as paper-grade output by itself.
- The dirty-ice models remain first-order sensitivity simulations, not full REASON processing or mission data.
- The audit did not attempt to validate external literature citations because no web verification was requested and the current task focused on local code/result validity.
