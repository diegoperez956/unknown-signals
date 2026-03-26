#!/usr/bin/env python3

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def build_output(template_path: Path, project_name: str) -> str:
    template = template_path.read_text(encoding="utf-8")
    timestamp = datetime.now(ZoneInfo("America/Chicago")).strftime("%Y-%m-%d %H:%M %Z")
    return (
        template.replace("{{generated_at}}", timestamp)
        .replace("{{project_name}}", project_name)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a Markdown handoff scaffold.")
    parser.add_argument("output", nargs="?", default="HANDOFF.md", help="Output Markdown path")
    parser.add_argument("--project", help="Project name override")
    parser.add_argument("--force", action="store_true", help="Overwrite existing output")
    args = parser.parse_args()

    output_path = Path(args.output).expanduser()
    if output_path.exists() and not args.force:
        parser.error(f"{output_path} already exists; use --force to overwrite")

    project_name = args.project or Path.cwd().name
    skill_root = Path(__file__).resolve().parents[1]
    template_path = skill_root / "assets" / "HANDOFF.template.md"
    content = build_output(template_path, project_name)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
