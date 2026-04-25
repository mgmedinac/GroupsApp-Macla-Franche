#!/usr/bin/env bash
set -euo pipefail

AUTH_URL="${AUTH_URL:-http://localhost:8001}"
CHAT_URL="${CHAT_URL:-http://localhost:8002}"
FILE_URL="${FILE_URL:-http://localhost:8003}"
U1="${U1:-ana}"
U2="${U2:-bob}"
PASS="${PASS:-1234}"
GROUP_NAME="${GROUP_NAME:-Grupo 2 usuarios}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found."
    exit 1
  fi
}

need_cmd curl
need_cmd python3

json_get() {
  local key="$1"
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$key',''))"
}

json_user_field() {
  local field="$1"
  python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('user') or {}).get('$field',''))"
}

echo "[1/10] Health checks"
curl -fsS "$AUTH_URL/health" >/dev/null
curl -fsS "$CHAT_URL/health" >/dev/null
curl -fsS "$FILE_URL/health" >/dev/null
echo "OK health checks"

echo "[2/10] Register users (idempotent)"
curl -sS -X POST "$AUTH_URL/api/register" -H "Content-Type: application/json" -d "{\"username\":\"$U1\",\"password\":\"$PASS\"}" >/dev/null || true
curl -sS -X POST "$AUTH_URL/api/register" -H "Content-Type: application/json" -d "{\"username\":\"$U2\",\"password\":\"$PASS\"}" >/dev/null || true
echo "OK users registered"

echo "[3/10] Login both users"
LOGIN_U1=$(curl -sS -X POST "$AUTH_URL/api/login" -H "Content-Type: application/json" -d "{\"username\":\"$U1\",\"password\":\"$PASS\"}")
TOKEN_U1=$(printf '%s' "$LOGIN_U1" | json_get access_token)
USER1_ID=$(printf '%s' "$LOGIN_U1" | json_user_field id)

LOGIN_U2=$(curl -sS -X POST "$AUTH_URL/api/login" -H "Content-Type: application/json" -d "{\"username\":\"$U2\",\"password\":\"$PASS\"}")
TOKEN_U2=$(printf '%s' "$LOGIN_U2" | json_get access_token)
USER2_ID=$(printf '%s' "$LOGIN_U2" | json_user_field id)

if [[ -z "$TOKEN_U1" || -z "$TOKEN_U2" ]]; then
  echo "Error: login/token failed"
  exit 1
fi
echo "OK login u1=$USER1_ID u2=$USER2_ID"

echo "[4/10] User1 creates group and adds User2"
GROUP_RESPONSE=$(curl -sS -X POST "$CHAT_URL/api/groups" -H "Authorization: Bearer $TOKEN_U1" -H "Content-Type: application/json" -d "{\"name\":\"$GROUP_NAME\"}")
GROUP_ID=$(printf '%s' "$GROUP_RESPONSE" | json_get group_id)
if [[ -z "$GROUP_ID" ]]; then
  echo "Error: group creation failed"
  echo "$GROUP_RESPONSE"
  exit 1
fi
curl -fsS -X POST "$CHAT_URL/api/groups/$GROUP_ID/members" \
  -H "Authorization: Bearer $TOKEN_U1" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$U2\"}" >/dev/null
echo "OK group_id=$GROUP_ID with both users"

echo "[5/10] Group message flow"
MSG_GROUP=$(curl -sS -X POST "$CHAT_URL/api/messages" \
  -H "Authorization: Bearer $TOKEN_U1" \
  -H "Content-Type: application/json" \
  -d "{\"group_id\":$GROUP_ID,\"content\":\"mensaje grupal de prueba\"}")
MSG_GROUP_ID=$(printf '%s' "$MSG_GROUP" | json_get message_id)
if [[ -z "$MSG_GROUP_ID" ]]; then
  echo "Error: group message failed"
  echo "$MSG_GROUP"
  exit 1
fi
curl -fsS "$CHAT_URL/api/groups/$GROUP_ID/messages" -H "Authorization: Bearer $TOKEN_U2" >/dev/null
curl -fsS -X PUT "$CHAT_URL/api/messages/read" -H "Authorization: Bearer $TOKEN_U2" -H "Content-Type: application/json" -d "{\"group_id\":$GROUP_ID}" >/dev/null
echo "OK group messaging + read"

echo "[6/10] Contacts flow"
curl -fsS -X POST "$CHAT_URL/api/contacts" \
  -H "Authorization: Bearer $TOKEN_U1" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$U2\"}" >/dev/null
CONTACTS=$(curl -sS "$CHAT_URL/api/contacts" -H "Authorization: Bearer $TOKEN_U1")
if ! printf '%s' "$CONTACTS" | grep -q "$U2"; then
  echo "Error: contact not visible in user1 list"
  echo "$CONTACTS"
  exit 1
fi
echo "OK contacts"

echo "[7/10] Private message flow"
MSG_PRIVATE=$(curl -sS -X POST "$CHAT_URL/api/direct-messages" \
  -H "Authorization: Bearer $TOKEN_U1" \
  -H "Content-Type: application/json" \
  -d "{\"receiver_id\":$USER2_ID,\"content\":\"mensaje privado de prueba\"}")
MSG_PRIVATE_ID=$(printf '%s' "$MSG_PRIVATE" | json_get message_id)
if [[ -z "$MSG_PRIVATE_ID" ]]; then
  echo "Error: private message failed"
  echo "$MSG_PRIVATE"
  exit 1
fi
curl -fsS -X PUT "$CHAT_URL/api/direct-messages/$MSG_PRIVATE_ID/delivered" -H "Authorization: Bearer $TOKEN_U2" >/dev/null
curl -fsS "$CHAT_URL/api/direct-messages/$USER1_ID" -H "Authorization: Bearer $TOKEN_U2" >/dev/null
curl -fsS -X PUT "$CHAT_URL/api/direct-messages/read" -H "Authorization: Bearer $TOKEN_U2" -H "Content-Type: application/json" -d "{\"contact_id\":$USER1_ID}" >/dev/null
echo "OK private messaging + delivered/read"

echo "[8/10] File upload with user2"
TMP_FILE="$(mktemp /tmp/groupsapp-two-users-XXXXXX.txt)"
echo "archivo de prueba dos usuarios $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TMP_FILE"
UPLOAD_RESPONSE=$(curl -sS -X POST "$FILE_URL/api/upload" -H "Authorization: Bearer $TOKEN_U2" -F "file=@$TMP_FILE")
rm -f "$TMP_FILE"
FILE_PATH=$(printf '%s' "$UPLOAD_RESPONSE" | json_get file_url)
if [[ -z "$FILE_PATH" ]]; then
  echo "Error: file upload failed"
  echo "$UPLOAD_RESPONSE"
  exit 1
fi
echo "OK file upload path=$FILE_PATH"

echo "[9/10] Presence heartbeat"
curl -fsS -X POST "$CHAT_URL/api/presence/heartbeat" -H "Authorization: Bearer $TOKEN_U2" >/dev/null
echo "OK heartbeat"

echo "[10/10] Logout both users"
curl -fsS -X POST "$AUTH_URL/api/logout" -H "Authorization: Bearer $TOKEN_U1" >/dev/null
curl -fsS -X POST "$AUTH_URL/api/logout" -H "Authorization: Bearer $TOKEN_U2" >/dev/null
echo "OK logout"

echo "Two-user smoke test completed successfully."
