#!/usr/bin/env bash
# Record a real Kane CLI run of the demo for the README's "recorded run" fallback.
# Needs: KANE_USERNAME + KANE_ACCESS_KEY (or `kane-cli login`), Google Chrome, opencode on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."
node bin/kanegate.js doctor --config examples/checkout/kanegate.config.json
(cd examples/checkout && node scripts/reset-demo.js)
set +e
(cd examples/checkout && node ../../bin/kanegate.js run 2> >(tee /tmp/kanegate-live.log >&2))
code=$?
set -e
run=$(ls -td examples/checkout/.kanegate/runs/*/ | head -1)
out=docs/recorded-runs/kane-live
rm -rf "$out" && mkdir -p "$out"
cp "$run/REPORT.md" "$out/"
sed -e "s#$PWD/##g" -e "s#$HOME#~#g" /tmp/kanegate-live.log > "$out/terminal.log"
for d in "$run"/attempt-*; do
  a=$(basename "$d"); mkdir -p "$out/$a"
  cp "$d"/*.ndjson "$d"/*.png "$d"/*.jpg "$d"/agent-prompt.md "$d"/agent.diff "$out/$a/" 2>/dev/null || true
done
find "$out" -name "*.ndjson" -exec sed -i "s#$HOME#~#g" {} +
# Evidence packs can be large; keep them out of git unless you mean to commit them.
echo "kanegate exit $code. Recorded to $out (review for anything private before committing)."
(cd examples/checkout && node scripts/reset-demo.js)
