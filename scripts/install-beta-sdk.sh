#!/usr/bin/env bash
set -euo pipefail

OSRS_SDK_REPO="${OSRS_SDK_REPO:-https://github.com/Julian-Dasilva/osrs-sdk.git}"
OSRS_SDK_COMMIT="${OSRS_SDK_COMMIT:-9995966c094c4cd18ab8b05038c9890ab95a189f}"
OSRS_SDK_PACKS="${OSRS_SDK_PACKS:-}"
CACHE_ROOT="${NETLIFY_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}}/archive-ocellus"
export NODE_COMPILE_CACHE="${NODE_COMPILE_CACHE:-${CACHE_ROOT}/node-compile-cache}"
PACKAGES=(osrs-sdk osrs-sdk-assets osrs-sdk-react)
PACKS=('osrs-sdk-[0-9]*.tgz' 'osrs-sdk-assets-*.tgz' 'osrs-sdk-react-*.tgz')

cd "$(dirname "$0")/.."

built_commit() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).gitHead ?? "unrecorded"))'
}

installed_commit() {
  local name
  for name in "${PACKAGES[@]}"; do
    if [[ -f "node_modules/${name}/package.json" ]]; then
      built_commit <"node_modules/${name}/package.json" 2>/dev/null || echo unreadable
    else
      echo missing
    fi
  done | sort -u | paste -sd ' ' -
}

check_installed() {
  local installed
  installed="$(installed_commit)"
  if [[ "${installed}" == "${OSRS_SDK_COMMIT}" ]]; then
    echo "install-beta-sdk: installed osrs-sdk commit ${installed} matches the pin"
  else
    echo "install-beta-sdk: installed osrs-sdk commit ${installed} does not match the pin ${OSRS_SDK_COMMIT}"
    return 1
  fi
}

pack() {
  local matches=("$1"/$2)
  if [[ ${#matches[@]} -ne 1 || ! -f "${matches[0]}" ]]; then
    echo "install-beta-sdk: expected exactly one $1/$2" >&2
    return 1
  fi
  echo "${matches[0]}"
}

packs_at_pin() {
  local glob file commit
  for glob in "${PACKS[@]}"; do
    file="$(pack "$1" "${glob}")" || return 1
    commit="$(tar -xzOf "${file}" package/package.json | built_commit)" || return 1
    if [[ "${commit}" != "${OSRS_SDK_COMMIT}" ]]; then
      echo "install-beta-sdk: refusing ${file}, built from ${commit}, not the pin ${OSRS_SDK_COMMIT}"
      return 1
    fi
  done
}

lock_fd() {
  if command -v flock >/dev/null 2>&1; then
    flock "$@"
  elif command -v perl >/dev/null 2>&1; then
    perl -MFcntl=:flock -e '
      my $operation = LOCK_EX;
      $operation |= LOCK_NB if $ARGV[0] eq "-n";
      $operation = LOCK_UN if $ARGV[0] eq "-u";
      open(my $fh, ">&=", $ARGV[-1]) or die "fdopen: $!\n";
      flock($fh, $operation) or exit 1;
    ' -- "$@"
  else
    echo "install-beta-sdk: locking requires flock or perl; install either tool and retry" >&2
    return 1
  fi
}

if [[ "${1:-}" == --check ]]; then
  check_installed
  exit
fi

mkdir -p "${CACHE_ROOT}/sdk-packs"
exec 8>"${CACHE_ROOT}/sdk-packs.lock"
lock_fd 8
for stale in "${CACHE_ROOT}"/sdk-packs/.build.*; do
  [[ -d "${stale}" ]] || continue
  if [[ ! -f "${stale}/.lock" ]]; then
    [[ "${stale##*/}" =~ ^\.build\.([0-9]+)\.[A-Za-z0-9]{6}$ ]] || continue
    node - "${BASH_REMATCH[1]}" <<'NODE' || continue
try {
  process.kill(Number(process.argv[2]), 0);
  process.exit(1);
} catch (error) {
  process.exit(error.code === 'ESRCH' ? 0 : 1);
}
NODE
  fi
  (
    exec 9>"${stale}/.lock"
    lock_fd -n 9 || exit 0
    rm -rf "${stale}"
  )
done

cleanup() {
  trap '' INT TERM
  if [[ -n "${builder:-}" ]]; then wait "${builder}" 2>/dev/null || true; fi
  exec 10>"${work}/.lock"
  exec 9>&-
  # A fresh descriptor waits for every descendant that inherited the build lease.
  lock_fd 10
  rm -rf "${work}"
}

cached_packs="${CACHE_ROOT}/sdk-packs/${OSRS_SDK_COMMIT}"
if [[ -n "${OSRS_SDK_PACKS}" ]] && packs_at_pin "${OSRS_SDK_PACKS}"; then
  packs="${OSRS_SDK_PACKS}"
  echo "install-beta-sdk: using prebuilt packs from ${packs}"
elif [[ -d "${cached_packs}" ]] && packs_at_pin "${cached_packs}"; then
  packs="${cached_packs}"
  echo "install-beta-sdk: using cached packs from ${packs}"
else
  work="$(mktemp -d "${CACHE_ROOT}/sdk-packs/.build.$$.XXXXXX")"
  exec 9>"${work}/.lock"
  lock_fd 9
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  lock_fd -u 8
  packs="${work}/packs"
  mkdir "${packs}"
  echo "install-beta-sdk: building ${OSRS_SDK_REPO} at ${OSRS_SDK_COMMIT}"
  git init --quiet "${work}/osrs-sdk"
  git -C "${work}/osrs-sdk" fetch --quiet --depth 1 "${OSRS_SDK_REPO}" "${OSRS_SDK_COMMIT}"
  git -C "${work}/osrs-sdk" checkout --quiet FETCH_HEAD
  built="$(git -C "${work}/osrs-sdk" rev-parse HEAD)"
  (
    cd "${work}/osrs-sdk"
    npm ci --no-audit --no-fund
    npm run build
    npm pkg set "gitHead=${built}" --workspaces --include-workspace-root
    npm pack --pack-destination "${packs}" --silent
    npm pack --workspace osrs-sdk-assets --pack-destination "${packs}" --silent
    npm pack --workspace osrs-sdk-react --pack-destination "${packs}" --silent
  ) &
  builder=$!
  wait "${builder}"
  packs_at_pin "${packs}"
  lock_fd 8
  if [[ -d "${cached_packs}" ]] && packs_at_pin "${cached_packs}"; then
    echo "install-beta-sdk: using concurrently published packs from ${cached_packs}"
  else
    if [[ -e "${cached_packs}" ]]; then mv "${cached_packs}" "${work}/rejected"; fi
    mv "${packs}" "${cached_packs}"
  fi
  packs="${cached_packs}"
  packs_at_pin "${packs}"
fi

files=()
for glob in "${PACKS[@]}"; do
  files+=("$(pack "${packs}" "${glob}")")
done
npm install --no-save --no-audit --no-fund "${files[@]}"
check_installed
for retired in "${CACHE_ROOT}/sdk-packs/"*; do
  [[ -d "${retired}" && "${retired}" != "${cached_packs}" ]] || continue
  rm -rf "${retired}"
done
