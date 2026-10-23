#!/bin/bash
# Installs Cyrus's T3 Code: the newest DynamicRex/t3code release, its settings, and Claude Code
# with its plugins. Safe to rerun. Later releases: `t3 update`.
#
#   curl -fsSL https://raw.githubusercontent.com/DynamicRex/t3code/flow/cyrus/install.sh | bash
set -euo pipefail

repo=DynamicRex/t3code
raw=https://raw.githubusercontent.com/$repo/flow

# Wrapped in a function so bash reads the whole script before any command can consume the pipe.
main() {
    export PATH="$HOME/.local/bin:$PATH"
    local t3_home known version line name sources source
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    curl -fsSL "$raw/cyrus/claude.json" -o "$tmp/claude.json"

    # 1. Claude Code, its settings (merged into any existing file) and its plugins
    command -v claude >/dev/null || curl -fsSL https://claude.ai/install.sh | bash
    mkdir -p ~/.claude
    python3 - "$tmp/claude.json" <<'EOF'
import json, os, sys
p = os.path.expanduser("~/.claude/settings.json")
s = json.load(open(p)) if os.path.exists(p) and os.path.getsize(p) else {}
s.update(json.load(open(sys.argv[1]))["settings"])
json.dump(s, open(p, "w"), indent=2)
EOF
    known=~/.claude/plugins/known_marketplaces.json
    mapfile -t lines < <(python3 -c 'import json, sys
for name, sources in json.load(open(sys.argv[1]))["marketplaces"].items(): print(name, *sources)' "$tmp/claude.json")
    for line in "${lines[@]}"; do
        read -r name sources <<<"$line"
        grep -q "\"$name\"" "$known" 2>/dev/null && continue
        # Sources in order; a local path counts only on a machine that has it
        for source in $sources; do
            [[ $source == /* && ! -d $source ]] && continue
            GIT_TERMINAL_PROMPT=0 claude plugin marketplace add "$source" && break
        done
        grep -q "\"$name\"" "$known" 2>/dev/null || echo "!! marketplace $name not added"
    done
    claude plugin marketplace update || echo "!! marketplace update failed"
    for p in $(python3 -c 'import json, sys; print(*json.load(open(sys.argv[1]))["plugins"])' "$tmp/claude.json"); do
        claude plugin install "$p" --scope user && claude plugin update "$p" --scope user \
            || echo "!! $p install failed"
    done

    # 2. T3 Code: the newest fork release, through the official installer
    version=$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" \
        | python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"][1:])')
    curl -fsSL "$raw/scripts/install.sh" \
        | T3CODE_VERSION=$version T3CODE_RELEASE_BASE_URL=https://github.com/$repo/releases/download sh

    # 3. T3 settings; the previous file stays as settings.json.bak
    t3_home=${T3CODE_HOME:-$HOME/.t3}
    mkdir -p "$t3_home/userdata"
    if [ -f "$t3_home/userdata/settings.json" ]; then
        cp "$t3_home/userdata/settings.json" "$t3_home/userdata/settings.json.bak"
    fi
    curl -fsSL "$raw/cyrus/t3-settings.json" -o "$t3_home/userdata/settings.json"

    claude auth status >/dev/null 2>&1 || echo ">> Sign in to Claude once: claude auth login"
    echo ">> Done: T3 Code $version. Start it with: t3"
}

main "$@"
