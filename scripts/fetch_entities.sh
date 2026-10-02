#!/usr/bin/env bash
# Pull full claims (including P625 precision and sources) for every curated QID.
# Batches of 10 keep the proxy happy; each batch retries up to 4 times.
set -u
cd "$(dirname "$0")/.."
OUT=artifacts/entities
mkdir -p "$OUT"

MAP=$(python - <<'PY'
import json
with open("artifacts/sparql/candidates.json", encoding="utf-8") as fh:
    items = json.load(fh)["items"]
print("\n".join(i["qid"] for i in items))
PY
)

TOTAL=$(printf '%s\n' "$MAP" | wc -l)
BATCH_SIZE=10
echo "fetching $TOTAL entities in batches of $BATCH_SIZE"
i=0
batch=0
for line in $(python -c "
import json,sys
items=json.load(open('artifacts/sparql/candidates.json',encoding='utf-8'))['items']
qids=[i['qid'] for i in items]
n=10
for k in range(0,len(qids),n):
    print('|'.join(qids[k:k+n]).replace(' ','_'))
"); do
  batch=$((batch + 1))
  slug=$(printf 'b%03d' "$batch")
  for attempt in 1 2 3 4; do
    code=$(curl -s -m 60 -G "https://www.wikidata.org/w/api.php" \
      --data-urlencode "action=wbgetentities" --data-urlencode "ids=$line" \
      --data-urlencode "props=claims|labels|descriptions" \
      --data-urlencode "languages=zh|zh-hans|en" \
      --data-urlencode "format=json" --data-urlencode "formatversion=2" \
      -o "$OUT/$slug.json" -w "%{http_code}")
    [ "$code" = "200" ] && [ -s "$OUT/$slug.json" ] && break
    sleep 2
  done
  if [ $((batch % 5)) -eq 0 ]; then echo "  batch $batch/$TOTAL-ish latest=$code"; fi
done
echo "done: batch=$batch"
