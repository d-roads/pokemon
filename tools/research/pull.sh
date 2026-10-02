#!/bin/bash
# Ingest new browser results; classify any newly completed page chunks.
OUT=$(/home/claude/work/ingest-new.sh)
echo "$OUT"
for tag in $(echo "$OUT" | grep '"complete":true' | sed -E 's/.*"tag":"([^"]+)".*/\1/'); do
  case "$tag" in xy-*|bw-*|re-*) (cd /home/claude/pokemon/site && node /home/claude/work/process-pages.mjs "$tag" 2>&1 | grep -v Experimental | tr -d '\n' | sed 's/  */ /g'; echo) ;; esac
done
