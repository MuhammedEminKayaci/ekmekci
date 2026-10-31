#!/bin/bash
# Ekmekçi — günlük yerel veri tabanı yedeği (macOS, launchd ile her gün çalışır).
#
# Veri tabanı adresi bu dosyada değil, Anahtar Zinciri'nde durur:
#   security add-generic-password -U -a ekmekci -s ekmekci-db-url -w '<postgresql://...>'
#
# Elle çalıştırma:  bash yerel-yedek.sh          (bugünün yedeği varsa atlar)
#                   bash yerel-yedek.sh --zorla  (yeniden alır)
set -euo pipefail

DEST="$HOME/Ekmekci-Yedekleri"
KEEP_DAYS=90
BIN=/opt/homebrew/opt/libpq/bin
LOG="$DEST/yedek.log"

mkdir -p "$DEST"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >>"$LOG"; }
notify() {
  /usr/bin/osascript -e "display notification \"$2\" with title \"Ekmekçi yedek\" subtitle \"$1\"" >/dev/null 2>&1 || true
}
fail() {
  log "HATA: $1"
  notify "Yedek alınamadı" "$1"
  exit 1
}

TODAY=$(TZ=Europe/Istanbul date +%Y-%m-%d)
OUT="$DEST/ekmekci_$TODAY.dump"
TMP="$OUT.part"

if [ -s "$OUT" ] && [ "${1:-}" != "--zorla" ]; then
  log "bugünün yedeği zaten var: $OUT"
  exit 0
fi

[ -x "$BIN/pg_dump" ] || fail "pg_dump bulunamadı ($BIN). Kurulum: brew install libpq"
URL=$(/usr/bin/security find-generic-password -s ekmekci-db-url -w 2>/dev/null) ||
  fail "Anahtar Zinciri'nde 'ekmekci-db-url' kaydı yok"

trap 'rm -f "$TMP"' EXIT

"$BIN/pg_dump" "$URL" -Fc -Z 9 -n public -n private -n auth -f "$TMP" 2>>"$LOG" ||
  fail "Veri tabanına bağlanılamadı (internet ya da şifre). yedek.log dosyasına bakın"

# Yedek okunabiliyor ve ana tablolar içinde mi?
TABLES=$("$BIN/pg_restore" -l "$TMP" | grep -c "TABLE DATA" || true)
[ "$TABLES" -ge 20 ] || fail "Yedek eksik görünüyor ($TABLES tablo)"
for t in customers customer_prices orders profiles; do
  "$BIN/pg_restore" -l "$TMP" | grep -q "TABLE DATA public $t " || fail "$t tablosu yedekte yok"
done

COUNTS=$("$BIN/psql" "$URL" -At -c "select (select count(*) from public.customers)||' müşteri, '||(select count(*) from public.orders)||' sipariş'" 2>>"$LOG" || echo "sayım alınamadı")

mv "$TMP" "$OUT"
log "OK $(basename "$OUT") ($(du -h "$OUT" | cut -f1), $TABLES tablo, $COUNTS)"

# Eski yedekleri temizle
find "$DEST" -maxdepth 1 -name 'ekmekci_*.dump' -mtime +"$KEEP_DAYS" -print -delete >>"$LOG" 2>&1 || true
