#!/usr/bin/env bash
# Package dist/ into a signed ZXP. Requires ZXPSignCmd (Adobe-CEP/CEP-Resources) on PATH
# or at $ZXPSIGNCMD. Generates a self-signed cert if $PD_CERT_P12 is not provided.
set -euo pipefail
VERSION="$(node -p "require('./package.json').version")"
OUT="premiere-director-${VERSION}.zxp"
SIGN="${ZXPSIGNCMD:-ZXPSignCmd}"
CERT="${PD_CERT_P12:-build-cert.p12}"
PASS="${PD_CERT_PASS:-premiere-director}"

npm run build
if [ ! -f "$CERT" ]; then
  "$SIGN" -selfSignedCert US GA "PremiereDirector" "PremiereDirector" "$PASS" "$CERT"
fi
rm -f "$OUT"
# NOTE: dist/ must contain no symlinks — signing symlinked ZXPs yields blank panels.
find dist -type l -print -quit | grep -q . && { echo "symlink found in dist/ — abort"; exit 1; }
"$SIGN" -sign dist "$OUT" "$CERT" "$PASS" -tsa http://timestamp.digicert.com
"$SIGN" -verify "$OUT"
echo "Packaged $OUT"
