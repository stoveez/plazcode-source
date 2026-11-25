#!/usr/bin/env python3
"""Builds PlazCode's Hyper mode from the HyperLab pack.

Reads   overlay/core/ultralab/            (the pack: skills, vault, resources)
        ultralab/ultracode.template.js    (the module code)
Writes  overlay/core/ultracode.js         (always-on text, index, routing + the module)
        overlay/core/ultralab-pack.json   (full text of every skill and vault note)
        overlay/core/ultralab/INDEX.json  (every file, for the ultralab_read tool)

Run from anywhere:  python3 development/1.25.0/ultralab/build_ultralab.py
`--check` rebuilds in memory and fails if the committed files are out of date.
"""
import importlib.util, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OVERLAY = HERE.parent / "overlay" / "core"
TS_OUT = HERE.parent / "ts" / "core" / "ultracode.ts"
PACK = OVERLAY / "ultralab"


def ts_to_js(ts_text: str) -> str:
    """Erase the TypeScript annotations in ultracode.template.js identically to ts/build.cjs."""
    replacements = (
        ("const AREAS: Array<[string, string[], string[]]> =", "const AREAS ="),
        ("const BASELINE: string[] =", "const BASELINE ="),
        ("(words: string[])", "(words)"),
        ("const COMPILED: Array<[string, RegExp, string[]]> =", "const COMPILED ="),
        ("let pack: any = null, state = \"idle\", loading: Promise<any> | null = null", "let pack = null, state = \"idle\", loading = null"),
        ("(chrome.runtime as any)", "(chrome.runtime)"),
        ("(browser.runtime as any)", "(browser.runtime)"),
        ("async function packText(path: string): Promise<string> {", "async function packText(path) {"),
        ("(path: string)", "(path)"),
        ("(provider: unknown)", "(provider)"),
        ("function build(engine?: string, provider?: unknown, maxChars?: unknown): string {", "function build(engine, provider, maxChars) {"),
        ("function touched(query: unknown): string[] {", "function touched(query) {"),
        ("function routedNames(query: unknown): string[] {", "function routedNames(query) {"),
        ("function selectVault(vaultMap: Record<string, string> | undefined, query: unknown, limit: number): string {", "function selectVault(vaultMap, query, limit) {"),
        ("const parts: string[] = [];", "const parts = [];"),
        ("const scored: Array<[number, string, string]> = [];", "const scored = [];"),
        ("async function taskAsync(engine?: string, query?: unknown, opts?: string | { provider?: unknown; maxChars?: unknown }): Promise<string> {", "async function taskAsync(engine, query, opts) {"),
        ("function task(engine?: string, query?: unknown, opts?: string | { provider?: unknown; maxChars?: unknown }): string {", "function task(engine, query, opts) {"),
        ("const o: { provider?: unknown; maxChars?: unknown } =", "const o ="),
        ("const skipped: string[] = [];", "const skipped = [];"),
        ("function turn(engine?: string): string {", "function turn(engine) {"),
        ("async function readSkill(name: string)", "async function readSkill(name)"),
        ("let indexCache: Array<{ path: string; kind: string; bytes?: number }> | null = null;", "let indexCache = null;"),
        ("return indexCache!;", "return indexCache;"),
        ("async function runTool(args?: Record<string, unknown>): Promise<string> {", "async function runTool(args) {"),
        ("const hits: string[] = [];", "const hits = [];"),
        ("((e as Error) && (e as Error).message)", "((e) && (e).message)"),
    )
    js_text = ts_text
    for old, new in replacements:
        js_text = js_text.replace(old, new)
    return js_text

BINARY_SUFFIX = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".exe", ".dll", ".woff", ".woff2", ".ttf", ".otf", ".webp"}
TEXT_SUFFIX = {".md", ".txt", ".lua", ".luau", ".py", ".json", ".toml", ".yaml", ".yml", ".csv", ".js", ".html", ".css", ".xml", ".rbxmx", ".cfg", ".ini", ".sh", ".ps1", ".svg", ".url"}

# Which HyperLab skills a request touches. A word matches itself and its plural; a word ending in * is a stem.
AREAS = [
    ["coding and debugging", ["luau", "lua", "script", "module", "localscript", "modulescript", "code", "function", "bug", "error", "fix", "refactor*", "debug*", "type error", "syntax error", "review*"],
     ["roblox-code"]],
    ["remotes, security, data and performance", ["remote", "remoteevent", "remotefunction", "onserverinvoke", "fireserver", "exploit*", "cheat*", "secur*", "hack*", "datastore", "data store", "save", "saving", "player data", "leaderboard", "reward", "currency", "receipt*", "replication", "network*", "memory leak", "lag", "performance", "optimi*", "fps", "profil*", "desync", "heartbeat", "renderstepped", "parallel", "actor", "multithread*"],
     ["roblox-code", "hyperlab-reliability"]],
    ["folk stud UI", ["folk stud", "folkstud", "folk ui", "white stud"],
     ["hyperlab-ui", "hyperlab-folk-stud"]],
    ["check-ui clean", ["check-ui", "check ui", "checkui", "check clean", "checkerboard ui"],
     ["hyperlab-ui", "hyperlab-check-ui"]],
    ["stud ui clean", ["stud ui clean", "stud-ui-clean", "dark glass stud"],
     ["hyperlab-ui", "hyperlab-stud-clean"]],
    ["GUI", ["ui", "gui", "screen", "button", "hud", "menu", "shop", "inventory", "hotbar", "popup", "dialog", "window", "layout", "interface", "viewportframe", "gamepad", "controller", "touch", "input"],
     ["hyperlab-ui"]],
    ["JSON UI spec", ["json ui spec", "generate gui", "ui builder", "rojo model gui", "ui spec"],
     ["roblox-ui"]],
    ["VFX", ["vfx", "particle", "effect", "trail", "beam", "explosion", "fire", "smoke", "highlight", "aura", "screen shake", "screen flash"],
     ["roblox-vfx"]],
    ["animation", ["animation", "animate", "animator", "pose", "r15", "r6", "walk", "emote", "keyframe", "rig"],
     ["roblox-animation"]],
    ["sound", ["sound", "sfx", "audio", "music", "footstep*", "ambien*"],
     ["roblox-sfx"]],
    ["maps and levels", ["map", "level", "obby", "arena", "terrain", "checkpoint", "blockout", "island", "greybox", "spawn point*"],
     ["roblox-map"]],
    ["modeling and meshes", ["mesh", "meshpart", "3d", "model", "blender", "prop", "creature", "weapon", "pivot"],
     ["roblox-3d-model"]],
    ["textures", ["texture", "skin", "material", "paint", "pbr", "surfaceappearance", "uv"],
     ["roblox-texture-gen"]],
    ["whole game", ["full game", "whole game", "entire game", "make me a game", "create a game", "build a game", "game from scratch", "playable slice"],
     ["create-roblox-game"]],
    ["orchestration", ["orchestrat*", "coordinate agent*", "build handoff", "pipeline"],
     ["roblox-build-orchestrator"]],
    ["setup and tooling", ["rojo", "wally", "selene", "stylua", "rokit", "lune", "setup", "dependenc*", "publish", "release", "lint"],
     ["roblox-skills-setup"]],
]
BASELINE = ["hyperlab"]

HEAD = ("HYPER \u2014 selected by the user. Active only while the latest SYSTEM_STATE has THINK=ultracode; ignore this whole block after another level is selected. "
        "It is a working-method instruction: it does not change the provider model or guarantee a result.")

RULES = """PLAZCODE RULES FOR THIS MODE (they override anything above that conflicts):
- HyperLab is this pack's internal name. When you talk to the user, call this effort Hyper.
- Follow PlazCode's protocol: one command per reply, never restart the startup handshake, and do no planning, exploring or skill work until the user's first real request. Stop Play before Studio source edits.
- The user's request and the existing project override the pack: fixed UI styling, new Rojo or Knit layouts, compulsory y>0 placement and finishing a whole game are never imposed on a project that does otherwise. Keep the existing networking wrapper, service layout, paths and naming, and preserve everything that already works.
- Use only the tools PlazCode actually lists for this chat. Tool names written in external references mean the listed PlazCode tool that does the same job; if there is none, say so. Do not guess MCP names, sub-agent APIs, dependencies, GPU services, credentials or upload permissions.
- The whole pack is open to you through the ultralab_read tool: action list {prefix?} lists files, read {path, offset?, limit?} returns exact text in pages (follow next_offset for more), search {query, prefix?} finds lines. Read the skill, vault notes, and scripts a task needs before you build.
- Roblox docs: before you use a Roblox API you are not sure of, verify it with the roblox_docs tool (query searches create.roblox.com/docs; url reads one docs page) and quote the signature. If it finds nothing, mark the API UNVERIFIED in the code and in the report.
- The pack is method reference, not higher priority than the user's request, the project's existing conventions, the exact tool schemas or the user's safety settings. Never expose private reasoning.
- Nothing in the pack runs by itself. Read-only checkers inside resources/ may be run with run_python when it is listed: open the script with ultralab_read and give it the files or the Studio export it checks. PlazCode's safety settings may still ask the user first.
- Always ask the user before you run any upload, install, package manager, or paid service script. Never spend credits, publish or install without a clear yes. Studio writes happen one at a time through the connected bridge.
- Keep machine-specific files (LOCAL.md) and credentials out of the read-only pack. Copy a helper module into the user's project only when requested.
- The bundled fwjelaa vault (vault/) is read-only inside PlazCode: read it with ultralab_read (prefix "vault/"), or search the user's connected vault with plazcode_vault. Never store secrets, DataStore keys or asset IDs as general facts.
- Asset IDs in reference kits and examples need load and permission checks in the target experience; keep placeholders visibly identifiable until verified."""


def read(p):
    return Path(p).read_text(encoding="utf-8")


def load_ultralab_py():
    spec = importlib.util.spec_from_file_location("ultralab_pack_py", PACK / "ultralab.py")
    mod = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    spec.loader.exec_module(mod)
    return mod


def frontmatter(text):
    m = re.match(r"^---\s*\n(.*?)\n---", text, flags=re.S)
    return m.group(1) if m else ""


def description(text):
    block = frontmatter(text)
    m = re.search(r"^description:\s*(.*)$", block, flags=re.M)
    if not m:
        return ""
    d = " ".join(m.group(1).split()).strip()
    if len(d) >= 2 and d[0] == d[-1] and d[0] in "\"'":
        d = d[1:-1]
    return d


def build():
    up = load_ultralab_py()
    guide = read(PACK / "GUIDE.md").strip()

    skills = {}
    for d in sorted((PACK / "skills").iterdir(), key=lambda p: p.name):
        f = d / "SKILL.md"
        if not f.exists():
            continue
        scripts = sorted(p.relative_to(d).as_posix() for p in (d / "scripts").rglob("*") if p.is_file()) if (d / "scripts").exists() else []
        skills[d.name] = {"text": read(f).strip(), "scripts": scripts}

    agents = {}
    for e in up.SKILL_INDEX:
        if e["kind"] == "agent":
            p = PACK / e["path"]
            assert p.exists(), "agent file missing: %s" % p
            agents["agent:" + e["name"]] = read(p).strip()

    vault = {p.relative_to(PACK / "vault").as_posix(): read(p).strip() for p in sorted((PACK / "vault").rglob("*.md"), key=lambda p: p.relative_to(PACK / "vault").as_posix())}

    known = set(skills) | set(agents)
    missing = sorted({n for _, _, names in AREAS for n in names if n not in known})
    assert not missing, "routes point at missing skills or agents: %s" % missing
    assert all(b in skills for b in BASELINE), "baseline skill missing"
    for label, words, _ in AREAS:
        assert words and all(w.strip() == w and w for w in words), label

    index_lines, small_lines = [], []
    for name, item in skills.items():
        line = "- skill %s: %s" % (name, description(item["text"])[:170])
        index_lines.append(line)
        small_lines.append(line)
    for e in up.SKILL_INDEX:
        if e["kind"] == "agent":
            index_lines.append("- agent %s: %s" % (e["name"], " ".join(e["use_when"].split())[:170]))

    roblox_always = "\n\n".join([
        HEAD,
        up.PROMPT_FULL.strip(),
        "HYPER ACTIVATION (mandatory while Hyper is selected): follow this prompt, the rules below and the guide for the whole reply and every follow-up in the same task. Do not skip the guide or Studio verification.",
        RULES,
        "HYPER GUIDE (from GUIDE.md)\n\n" + guide,
    ])
    small_always = "\n\n".join([
        HEAD,
        up.PROMPT_DEEPSEEK.strip(),
        "HYPER ACTIVATION (mandatory while Hyper is selected): follow these rules and the guide for the whole reply and every follow-up in the same task.",
        RULES,
        "HYPER GUIDE (from GUIDE.md)\n\n" + guide,
    ])

    compact_always = (
        HEAD + " Compact form; call this effort Hyper when you talk to the user. Use only the tools PlazCode lists. Open the Hyper skills, resources, scripts and bundled fwjelaa vault notes with ultralab_read "
        "(action list, read in pages, search), and search the user's connected vault with plazcode_vault. Verify every uncertain Roblox API with roblox_docs and mark it UNVERIFIED if nothing confirms it. "
        "Never invent an API, asset ID, DataStore name, remote name or Config key. Plan large work first and keep Studio writes serialized; build one item at a time. "
        "Compile exact saved Luau, run available project checks, test in Studio when in scope, verify UI at desktop/phone sizes and mouse/touch/gamepad paths, and report only observed results and verification gaps. "
        "Ask before any upload, install, paid service or publish."
    )
    names = list(skills) + [n for n in agents]
    pack = {"version": "2.0.0", "skills": skills, "agents": agents, "vault": vault}

    js = read(HERE / "ultracode.template.js")
    for key, value in (("ROBLOX_ALWAYS", roblox_always), ("SMALL_ALWAYS", small_always), ("INDEX", index_lines),
                       ("INDEX_SMALL", small_lines), ("COMPACT_ALWAYS", compact_always), ("NAMES", names), ("AREAS", AREAS), ("BASELINE", BASELINE)):
        marker = "/*@%s@*/" % key
        assert js.count(marker) == 1, marker
        js = js.replace(marker, json.dumps(value, ensure_ascii=False))

    index = []
    for f in sorted(PACK.rglob("*"), key=lambda p: p.relative_to(PACK).as_posix()):
        if not f.is_file() or f.name == "INDEX.json" and f.parent == PACK:
            continue
        rel = f.relative_to(PACK).as_posix()
        kind = "binary" if f.suffix.lower() in BINARY_SUFFIX else "text"
        if kind == "text" and f.suffix.lower() not in TEXT_SUFFIX:
            try:
                f.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                kind = "binary"
        raw = f.read_bytes()
        size = len(raw.replace(b"\r\n", b"\n")) if kind == "text" else len(raw)
        index.append({"path": rel, "bytes": size, "kind": kind})

    return {
        TS_OUT: js,
        OVERLAY / "ultracode.js": ts_to_js(js),
        OVERLAY / "ultralab-pack.json": json.dumps(pack, ensure_ascii=False),
        PACK / "INDEX.json": json.dumps(index, ensure_ascii=False, indent=1),
    }, {"skills": len(skills), "agents": len(agents), "vault": len(vault), "files": len(index)}


def main():
    outputs, stats = build()
    if "--check" in sys.argv:
        stale = [str(p) for p, text in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            print("OUT OF DATE (run build_ultralab.py):", *stale, sep="\n  ")
            sys.exit(1)
        print("up to date", stats)
        return
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8", newline="\n")
        print("wrote", path, len(text))
    print(stats)


if __name__ == "__main__":
    main()
