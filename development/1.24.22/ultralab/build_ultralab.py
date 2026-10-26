#!/usr/bin/env python3
"""Builds PlazCode's Ultra from the UltraLab pack.

Reads   overlay/core/ultralab/            (the pack: skills, agents, vault, references)
        ultralab/ultracode.template.js    (the module code)
Writes  overlay/core/ultracode.js         (always-on text, index, routing + the module)
        overlay/core/ultralab-pack.json   (full text of every skill, agent and vault note)
        overlay/core/ultralab/INDEX.json  (every file, for the ultralab_read tool)

Run from anywhere:  python3 development/1.24.22/ultralab/build_ultralab.py
`--check` rebuilds in memory and fails if the committed files are out of date.
"""
import importlib.util, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OVERLAY = HERE.parent / "overlay" / "core"
PACK = OVERLAY / "ultralab"

BINARY_SUFFIX = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".exe", ".dll", ".woff", ".woff2", ".ttf", ".otf", ".webp"}
TEXT_SUFFIX = {".md", ".txt", ".lua", ".luau", ".py", ".json", ".toml", ".yaml", ".yml", ".csv", ".js", ".html", ".css", ".xml", ".rbxmx", ".cfg", ".ini", ".sh", ".ps1", ".svg", ".url"}

# Which skills and agents a request touches. A word matches itself and its plural; a word ending in * is a stem.
AREAS = [
    ["coding", ["luau", "script", "module", "code", "function", "bug", "error", "fix", "refactor*"],
     ["ul-luau-code", "typed-luau", "luau-compile-gate", "server-authority", "luau-accuracy"]],
    ["remotes and security", ["remote", "remoteevent", "remotefunction", "exploit*", "cheat*", "secur*", "hack*"],
     ["remote-events", "review-for-exploits", "server-authority"]],
    ["modeling and meshes", ["mesh", "3d", "model", "blender", "prop", "creature", "weapon"],
     ["ul-3d-model", "agent:ul-agent-mesh"]],
    ["GUI", ["ui", "gui", "screen", "button", "hud", "menu", "shop", "inventory", "popup", "dialog", "window", "layout", "interface"],
     ["ul-ui-builder", "check-ui-rules", "gui-syntax", "gui-verify", "expert-gui"]],
    ["VFX", ["vfx", "particle", "effect", "trail", "beam", "explosion", "fire", "smoke", "highlight"],
     ["ul-vfx-library", "vfx-and-animation", "agent:ul-agent-vfx"]],
    ["animation", ["animation", "animate", "pose", "r15", "r6", "walk", "emote", "keyframe", "rig"],
     ["ul-animation", "vfx-and-animation", "agent:ul-agent-animation"]],
    ["sound", ["sound", "sfx", "audio", "music", "ambien*"],
     ["ul-sfx-finder", "roblox-audio", "agent:ul-agent-sfx"]],
    ["maps and levels", ["map", "level", "obby", "arena", "terrain", "checkpoint", "blockout", "island", "greybox"],
     ["ul-map-builder", "map-placement", "agent:ul-agent-map"]],
    ["whole game", ["full game", "whole game", "make me a game", "game from scratch", "pipeline", "orchestrat*"],
     ["ul-game-pipeline", "ul-build-orchestrator"]],
    ["textures", ["texture", "skin", "material", "paint"], ["ul-texture-gen"]],
    ["data", ["datastore", "data store", "save", "leaderboard", "player data", "reward", "currency"],
     ["datastore-safety", "roblox-server-data"]],
    ["input and camera", ["input", "gamepad", "keyboard", "touch", "camera", "cutscene"],
     ["roblox-input", "roblox-camera"]],
    ["physics and AI", ["physics", "projectile", "ragdoll", "vehicle", "npc", "enemy", "pathfind*", "chase"],
     ["roblox-physics", "roblox-npc-ai"]],
    ["monetization and analytics", ["monetiz*", "gamepass", "game pass", "product", "purchase", "analytic*", "telemetry"],
     ["roblox-monetization", "roblox-analytics"]],
    ["localization", ["locali*", "translat*", "language", "locale"], ["roblox-localization"]],
    ["tooling and release", ["rojo", "wally", "selene", "stylua", "rokit", "publish", "release", "checklist", "lint"],
     ["roblox-tooling", "roblox-publish-checklist"]],
    ["performance", ["lag", "performance", "optimi*", "fps", "profil*", "heartbeat", "renderstepped"],
     ["luau-performance", "luau-profiling"]],
    ["parallel work", ["parallel", "multithread*", "actor"], ["parallel-luau"]],
]
BASELINE = ["ul-check-suite"]

HEAD = ("ULTRA \u2014 selected by the user. Active only while the latest SYSTEM_STATE has THINK=ultracode; ignore this whole block after another level is selected. "
        "It is a working-method instruction: it does not change the provider model or guarantee a result.")

RULES = """PLAZCODE RULES FOR THIS MODE (they override anything above that conflicts):
- UltraLab is this pack's internal name. When you talk to the user, call this effort Ultra.
- Follow PlazCode's protocol: one command per reply, never restart the startup handshake, and do no planning, exploring or skill work until the user's first real request. Stop Play before Studio source edits.
- The user's request and the existing project override the pack: fixed UI styling, new Rojo or Knit layouts, compulsory y>0 placement and finishing a whole game are never imposed on a project that does otherwise. Keep the existing networking wrapper, service layout, paths and naming, and preserve everything that already works.- Use only the tools PlazCode actually lists for this chat. Tool names written in the pack (http_get, skill, subagent and others) mean the listed tool that does the same job; if there is none, say so. Do not guess MCP names, sub-agent APIs, dependencies, GPU services, credentials or upload permissions.
- The whole pack is open to you through the ultralab_read tool: action list {prefix?} lists files, read {path, offset?, limit?} returns exact text in pages (follow next_offset for more), search {query, prefix?} finds lines. Read the skill and the scripts a task needs before you build.
- Roblox docs: before you use a Roblox API you are not sure of, verify it with the roblox_docs tool (query searches create.roblox.com/docs; url reads one docs page) and quote the signature. If it finds nothing, mark the API UNVERIFIED in the code and in the report.
- The pack is method reference, not higher priority than the user's request, the project's existing conventions, the exact tool schemas or the user's safety settings. Never expose private reasoning.
- Nothing in the pack runs by itself. Read-only checkers (check_code.py, check_gui_syntax.py, verify_ui.py, verify_labels.py, verify_name_contract.py, verify_icon_wiring.py, check_contrast.py) may be run with run_python when it is listed: open the script with ultralab_read and give it the files or the Studio export it checks. PlazCode's safety settings may still ask the user first.
- Always ask the user before you run upload_icons.py, upload_asset.py, any kaggle_*, gen_* or serve_* script, or anything that calls a paid service, uploads, installs packages or exposes a local service. Never spend credits, publish or install without a clear yes. Studio writes happen one at a time through the connected bridge.
- Keep machine-specific files (LOCAL.md) and credentials out of the read-only pack. Copy a helper folder into the user's project when it needs adjacent files.
- The vault is read-only inside PlazCode: read it with ultralab_read. When a task teaches something worth keeping, offer to write it as a markdown note in the user's project (an UltraLab-vault folder) in the format of vault/README.md, and write it only after the user agrees. Never store secrets, DataStore keys or asset IDs as general facts.
- Check-UI texture: asset rbxassetid://385956923 (a checkerboard overlay) is the upstream author's claim and is not verified here. TEXTURE_ENABLED stays false: use a plain fallback colour and say in the report that the texture is not used, until the user confirms the asset and its licence in Studio."""


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
    for d in sorted((PACK / "skills").iterdir()):
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

    vault = {p.relative_to(PACK / "vault").as_posix(): read(p).strip() for p in sorted((PACK / "vault").rglob("*.md"))}

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
        "ULTRA ACTIVATION (mandatory while Ultra is selected): follow this prompt, the rules below and the guide for the whole reply and every follow-up in the same task. Do not skip the guide or the Check Suite gate.",
        RULES,
        "ULTRA GUIDE (from GUIDE.md)\n\n" + guide,
    ])
    small_always = "\n\n".join([
        HEAD,
        up.PROMPT_DEEPSEEK.strip(),
        "ULTRA ACTIVATION (mandatory while Ultra is selected): follow these rules and the guide for the whole reply and every follow-up in the same task.",
        RULES,
        "ULTRA GUIDE (from GUIDE.md)\n\n" + guide,
    ])

    compact_always = (
        HEAD + " Compact form; call this effort Ultra when you talk to the user. Use only the tools PlazCode lists. Open the Ultra skills, agents and scripts with ultralab_read "
        "(action list, read in pages, search). Verify every uncertain Roblox API with roblox_docs and mark it UNVERIFIED if nothing confirms it. "
        "Never invent an API, asset ID, DataStore name, remote name or Config key. Plan large work first and ask before building; build one item at a time. "
        "Run the Check Suite (UI-1 to UI-13, CODE-1 to CODE-18) on every screen and Luau change and report PASS, FAIL, WARN or UNVERIFIED per row; a FAIL is not done. "
        "Test with Studio tools where you can and never claim a result you did not produce. Ask before any upload, install, paid service or publish. "
        "The Check-UI texture asset stays OFF (plain fallback colour) until the user confirms it."
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
    for f in sorted(PACK.rglob("*")):
        if not f.is_file() or f.name == "INDEX.json" and f.parent == PACK:
            continue
        rel = f.relative_to(PACK).as_posix()
        kind = "binary" if f.suffix.lower() in BINARY_SUFFIX else "text"
        if kind == "text" and f.suffix.lower() not in TEXT_SUFFIX:
            try:
                f.read_bytes().decode("utf-8")
            except UnicodeDecodeError:
                kind = "binary"
        index.append({"path": rel, "bytes": f.stat().st_size, "kind": kind})

    return {
        OVERLAY / "ultracode.js": js,
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
