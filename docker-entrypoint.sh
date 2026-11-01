#!/bin/sh
set -eu

input_dir=${INCEPTION_INPUT_DIR:-/inception}
dataset_url=${VITE_DATASET_URL:-/data/inception-dataset.json}

case "$dataset_url" in
  /data/*) ;;
  *)
    echo "VITE_DATASET_URL must be a local path under /data/ for Docker conversion." >&2
    exit 1
    ;;
esac

case "$dataset_url" in
  *"/../"*|*"/./"*|*'?'*|*'#'*)
    echo "VITE_DATASET_URL must not contain path traversal or URL query/fragment characters." >&2
    exit 1
    ;;
esac

dataset_path="/usr/share/nginx/html${dataset_url}"
set --
for input in "$input_dir"/*.json; do
  [ -f "$input" ] || continue
  [ "$(basename "$input")" = "metadata.json" ] && continue
  [ "$(basename "$input")" = "translations.json" ] && continue
  set -- "$@" "$input"
done

if [ "$#" -gt 0 ]; then
  mkdir -p "$(dirname "$dataset_path")"
  extra=""
  [ -f "$input_dir/metadata.json" ] && extra="$extra --config $input_dir/metadata.json"
  [ -f "$input_dir/translations.json" ] && extra="$extra --translations $input_dir/translations.json"
  # shellcheck disable=SC2086
  node /app/scripts/convert-inception.mjs "$@" $extra --out "$dataset_path"
else
  echo "No INCEpTION CAS JSON files found in $input_dir; using the bundled dataset." >&2
fi

exec nginx -g "daemon off;"
