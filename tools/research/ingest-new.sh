#!/bin/bash
# Ingest every not-yet-processed browser tool-result file that contains PWPART chunks.
TR=/root/.claude/projects/-home-claude/ac1c0da2-21f4-5700-92b2-fd390bd6543f/tool-results
LOG=/home/claude/work/ingested.log; touch $LOG
NEW=()
for f in $(ls -1tr $TR/mcp-remote-devices-Claude_Browser__javascript_tool-*.txt 2>/dev/null); do
  grep -qxF "$f" $LOG && continue
  if grep -q 'PWPART|' "$f"; then NEW+=("$f"); fi
  echo "$f" >> $LOG
done
[ ${#NEW[@]} -gt 0 ] && node /home/claude/work/ingest.mjs "${NEW[@]}" || echo "no new parts"
