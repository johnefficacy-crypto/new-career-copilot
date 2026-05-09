from __future__ import annotations

import csv
import re
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()

CANDIDATE_ROOTS = [
    SCRIPT_PATH.parents[1],
    SCRIPT_PATH.parents[2] if len(SCRIPT_PATH.parents) > 2 else SCRIPT_PATH.parents[1],
]

SCHEMA_RELATIVE_PATHS = [
    Path("docs") / "supabase(Govt Exam copilot)-Schema.md",
    Path("app") / "docs" / "supabase(Govt Exam copilot)-Schema.md",
]

ROOT = None
SCHEMA_FILE = None

for root in CANDIDATE_ROOTS:
    for rel in SCHEMA_RELATIVE_PATHS:
        candidate = root / rel
        if candidate.exists():
            ROOT = root
            SCHEMA_FILE = candidate
            break
    if ROOT and SCHEMA_FILE:
        break

if ROOT is None or SCHEMA_FILE is None:
    raise FileNotFoundError("Could not find app/docs/supabase(Govt Exam copilot)-Schema.md")

CODE_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".sql", ".md"}

IGNORE_DIRS = {
    ".git", ".next", "node_modules", ".venv", "venv", "__pycache__",
    "dist", "build", ".turbo", "schema_audit",
}

RUNTIME_PREFIXES = (
    "app/backend/",
    "app/frontend/",
    "backend/",
    "frontend/",
    "server.py",
)

MIGRATION_MARKERS = (
    "app/supabase/migrations/",
    "supabase/migrations/",
)

DOC_PREFIXES = (
    "app/docs/",
    "docs/",
    "memory/",
    "app/reference/",
    "docs/migration-reference/",
)

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")

def iter_files(root: Path):
    for path in root.rglob("*"):
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.is_file() and path.suffix in CODE_EXTS:
            yield path

def classify_file(rel: str) -> str:
    rel = rel.replace("\\", "/")
    if any(marker in rel for marker in MIGRATION_MARKERS):
        return "migration"
    if rel == str(SCHEMA_FILE.relative_to(ROOT)).replace("\\", "/"):
        return "schema_doc"
    if any(rel.startswith(prefix) for prefix in DOC_PREFIXES):
        return "documentation"
    if any(rel.startswith(prefix) for prefix in RUNTIME_PREFIXES):
        return "runtime"
    return "other"

schema_text = read_text(SCHEMA_FILE)

tables = sorted(set(re.findall(
    r"CREATE\s+TABLE\s+public\.([a-zA-Z0-9_]+)",
    schema_text,
    re.IGNORECASE,
)))

views = sorted(set(re.findall(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+public\.([a-zA-Z0-9_]+)",
    schema_text,
    re.IGNORECASE,
)))

functions = sorted(set(re.findall(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z0-9_]+)",
    schema_text,
    re.IGNORECASE,
)))

objects = sorted(set(tables + views + functions))

if not objects:
    raise RuntimeError(f"No schema objects found in {SCHEMA_FILE}")

usage = {}

for obj in objects:
    usage[obj] = {
        "object": obj,
        "type": "table" if obj in tables else "view" if obj in views else "function",
        "runtime_files": set(),
        "migration_files": set(),
        "documentation_files": set(),
        "schema_doc_files": set(),
        "other_files": set(),
        "direct_patterns": set(),
        "likely_columns": set(),
    }

direct_patterns = {
    "py_table": r'\.table\(\s*[\'"]{obj}[\'"]\s*\)',
    "js_from": r'\.from\(\s*[\'"]{obj}[\'"]\s*\)',
    "rpc": r'\.rpc\(\s*[\'"]{obj}[\'"]\s*[,)]',
    "sql_public": r'public\.{obj}\b',
}

def extract_select_columns(text: str, obj: str) -> set[str]:
    cols = set()

    # Handles chained calls like:
    # supabase.table("profiles").select("id, full_name")
    chained = re.finditer(
        rf'\.table\(\s*[\'"]{re.escape(obj)}[\'"]\s*\).*?\.select\(\s*[\'"]([^\'"]+)[\'"]',
        text,
        re.DOTALL,
    )
    for m in chained:
        raw = m.group(1)
        for token in re.split(r",", raw):
            token = token.strip()
            if not token or token == "*":
                continue
            token = token.split()[0].strip()
            token = token.split("(")[0].strip()
            token = token.strip('"')
            if re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", token):
                cols.add(token)

    return cols

for file in iter_files(ROOT):
    text = read_text(file)
    rel = str(file.relative_to(ROOT)).replace("\\", "/")
    bucket = classify_file(rel)

    for obj in objects:
        direct_hit = False

        for name, pattern in direct_patterns.items():
            if re.search(pattern.format(obj=re.escape(obj)), text):
                direct_hit = True
                usage[obj]["direct_patterns"].add(name)

        if direct_hit:
            if bucket == "runtime":
                usage[obj]["runtime_files"].add(rel)
                usage[obj]["likely_columns"].update(extract_select_columns(text, obj))
            elif bucket == "migration":
                usage[obj]["migration_files"].add(rel)
            elif bucket == "documentation":
                usage[obj]["documentation_files"].add(rel)
            elif bucket == "schema_doc":
                usage[obj]["schema_doc_files"].add(rel)
            else:
                usage[obj]["other_files"].add(rel)

        # Plain text mention, but do not count schema doc as meaningful usage.
        elif re.search(rf"\b{re.escape(obj)}\b", text):
            if bucket == "runtime":
                usage[obj]["runtime_files"].add(rel)
            elif bucket == "migration":
                usage[obj]["migration_files"].add(rel)
            elif bucket == "documentation":
                usage[obj]["documentation_files"].add(rel)
            elif bucket == "schema_doc":
                usage[obj]["schema_doc_files"].add(rel)
            else:
                usage[obj]["other_files"].add(rel)

rows = []

for obj in objects:
    u = usage[obj]

    runtime_count = len(u["runtime_files"])
    migration_count = len(u["migration_files"])
    docs_count = len(u["documentation_files"])
    other_count = len(u["other_files"])

    if runtime_count > 0:
        classification = "runtime_used"
    elif migration_count > 0:
        classification = "migration_only_or_indirect"
    elif docs_count > 0 or other_count > 0:
        classification = "docs_only_review"
    else:
        classification = "schema_only_candidate"

    rows.append({
        "object": obj,
        "type": u["type"],
        "classification": classification,
        "runtime_usage_count": runtime_count,
        "migration_usage_count": migration_count,
        "documentation_usage_count": docs_count,
        "other_usage_count": other_count,
        "runtime_files": "; ".join(sorted(u["runtime_files"])[:30]),
        "migration_files": "; ".join(sorted(u["migration_files"])[:30]),
        "documentation_files": "; ".join(sorted(u["documentation_files"])[:20]),
        "likely_columns_from_runtime_selects": ", ".join(sorted(u["likely_columns"])),
        "direct_patterns": ", ".join(sorted(u["direct_patterns"])),
    })

out_dir = ROOT / "schema_audit"
out_dir.mkdir(exist_ok=True)

csv_path = out_dir / "schema_usage_matrix_v2.csv"
with csv_path.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

md_path = out_dir / "schema_usage_summary_v2.md"
with md_path.open("w", encoding="utf-8") as f:
    f.write("# Schema Usage Summary v2\n\n")
    f.write(f"Root scanned: `{ROOT}`\n\n")
    f.write(f"Schema file: `{SCHEMA_FILE}`\n\n")
    f.write(f"- Tables found: {len(tables)}\n")
    f.write(f"- Views found in schema doc: {len(views)}\n")
    f.write(f"- Functions found in schema doc: {len(functions)}\n")
    f.write(f"- Total schema objects found: {len(objects)}\n\n")

    for cls in [
        "runtime_used",
        "migration_only_or_indirect",
        "docs_only_review",
        "schema_only_candidate",
    ]:
        cls_rows = [r for r in rows if r["classification"] == cls]
        f.write(f"## {cls} ({len(cls_rows)})\n\n")
        for r in cls_rows:
            f.write(f"- `{r['object']}` ({r['type']})")
            if r["runtime_files"]:
                f.write(f" — runtime: {r['runtime_files']}")
            elif r["migration_files"]:
                f.write(f" — migrations: {r['migration_files']}")
            elif r["documentation_files"]:
                f.write(f" — docs: {r['documentation_files']}")
            f.write("\n")
        f.write("\n")

print(f"Schema file: {SCHEMA_FILE}")
print(f"Tables found: {len(tables)}")
print(f"Views found in schema doc: {len(views)}")
print(f"Functions found in schema doc: {len(functions)}")
print(f"Wrote: {csv_path}")
print(f"Wrote: {md_path}")