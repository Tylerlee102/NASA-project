from __future__ import annotations

import argparse
import json
from pathlib import Path

from reason_common import cfg_get, load_config, output_dir, write_json


RESULT_FILES = [
    "test1_cluttergram_result.json",
    "test2_interferometry_result.json",
    "test3_crossover_result.json",
    "test4_blind_zone_result.json",
    "test5_bias_table_result.json",
]


def run(config_path: Path) -> dict:
    config, resolved_config = load_config(config_path)
    out = output_dir(config, resolved_config)
    results = []
    missing = []
    for name in RESULT_FILES:
        path = out / name
        if not path.exists():
            missing.append(name)
            continue
        results.append(json.loads(path.read_text(encoding="utf-8")))

    counts = {
        "clutter": sum(1 for item in results if item.get("result") == "clutter"),
        "subsurface": sum(1 for item in results if item.get("result") == "subsurface"),
        "ambiguous": sum(1 for item in results if item.get("result") == "ambiguous"),
        "missing": len(missing),
    }
    required = int(cfg_get(config, "verdict.required_votes", 3))
    if counts["clutter"] >= required:
        verdict = "probable clutter"
        rationale = "At least three independent tests support off-nadir surface geometry."
    elif counts["subsurface"] >= required:
        verdict = "probable subsurface reflector"
        rationale = "At least three independent tests support a nadir subsurface reflector."
    else:
        verdict = "ambiguous"
        rationale = "The decision matrix is split or incomplete."

    payload = {
        "verdict": verdict,
        "rationale": rationale,
        "vote_counts": counts,
        "missing_result_files": missing,
        "tests": results,
    }
    write_json(out / "verdict_report.json", payload)

    lines = [
        f"Verdict: {verdict}",
        f"Rationale: {rationale}",
        f"Votes: clutter={counts['clutter']}, subsurface={counts['subsurface']}, ambiguous={counts['ambiguous']}, missing={counts['missing']}",
        "",
        "Test results:",
    ]
    for item in results:
        lines.append(f"- {item['test']}: {item['result']} ({item['rationale']})")
    if missing:
        lines.append("")
        lines.append("Missing result files:")
        lines.extend(f"- {name}" for name in missing)
    (out / "verdict_report.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply the integrated REASON clutter/subsurface decision matrix.")
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    args = parser.parse_args()
    payload = run(args.config)
    print(f"Verdict: {payload['verdict']} - {payload['rationale']}")


if __name__ == "__main__":
    main()
