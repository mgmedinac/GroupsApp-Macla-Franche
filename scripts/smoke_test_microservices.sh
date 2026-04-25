#!/usr/bin/env bash
set -euo pipefail

AUTH_URL="${AUTH_URL:-http://localhost:8001}"
CHAT_URL="${CHAT_URL:-http://localhost:8002}"
FILE_URL="${FILE_URL:-http://localhost:8003}"
USERNAME="${USERNAME:-ana}"
PASSWORD="${PASSWORD:-1234}"
GROUP_NAME="${GROUP_NAME:-Grupo 1}"

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

echo "[1/8] Health checks"
curl -fsS "$AUTH_URL/health" >/dev/null
curl -fsS "$CHAT_URL/health" >/dev/null
curl -fsS "$FILE_URL/health" >/dev/null
echo "OK health checks"

echo "[2/8] Register user (idempotent)"
set +e
REGISTER_RESPONSE=$(curl -sS -X POST "$AUTH_URL/api/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
REGISTER_EXIT=$?
set -e
if [[ $REGISTER_EXIT -ne 0 ]]; then
  echo "Error in register request"
  exit 1
fi
echo "$REGISTER_RESPONSE"

echo "[3/8] Login"
LOGIN_RESPONSE=$(curl -sS -X POST "$AUTH_URL/api/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")

TOKEN=$(printf '%s' "$LOGIN_RESPONSE" | json_get access_token)
USER_ID=$(printf '%s' "$LOGIN_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('user') or {}).get('id',''))")

if [[ -z "$TOKEN" ]]; then
  echo "Login failed, no access_token returned"
  echo "$LOGIN_RESPONSE"
  exit 1
fi
echo "OK login user_id=$USER_ID"

echo "[4/8] Validate token"
curl -fsS "$AUTH_URL/api/validate-token" \
  -H "Authorization: Bearer $TOKEN" >/dev/null
echo "OK token"

echo "[5/8] Create group"
GROUP_RESPONSE=$(curl -sS -X POST "$CHAT_URL/api/groups" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$GROUP_NAME\"}")
GROUP_ID=$(printf '%s' "$GROUP_RESPONSE" | json_get group_id)
if [[ -z "$GROUP_ID" ]]; then
  echo "Could not create group"
  echo "$GROUP_RESPONSE"
  exit 1
fi
echo "OK group_id=$GROUP_ID"

echo "[6/8] Send group message"
MESSAGE_RESPONSE=$(curl -sS -X POST "$CHAT_URL/api/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"group_id\":$GROUP_ID,\"content\":\"hola microservicios\"}")
MESSAGE_ID=$(printf '%s' "$MESSAGE_RESPONSE" | json_get message_id)
if [[ -z "$MESSAGE_ID" ]]; then
  echo "Could not send message"
  echo "$MESSAGE_RESPONSE"
  exit 1
fi
echo "OK message_id=$MESSAGE_ID"

echo "[7/8] Upload test file"
TMP_FILE="$(mktemp /tmp/groupsapp-smoke-XXXXXX.txt)"
echo "archivo de prueba $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TMP_FILE"
UPLOAD_RESPONSE=$(curl -sS -X POST "$FILE_URL/api/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMP_FILE")
rm -f "$TMP_FILE"
FILE_PATH=$(printf '%s' "$UPLOAD_RESPONSE" | json_get file_url)
if [[ -z "$FILE_PATH" ]]; then
  echo "Could not upload file"
  echo "$UPLOAD_RESPONSE"
  exit 1
fi
echo "OK file_url=$FILE_PATH"

echo "[8/8] Fetch group messages"
MSGS_RESPONSE=$(curl -sS "$CHAT_URL/api/groups/$GROUP_ID/messages" \
  -H "Authorization: Bearer $TOKEN")
if ! printf '%s' "$MSGS_RESPONSE" | grep -q 'messages'; then
  echo "Could not fetch messages"
  echo "$MSGS_RESPONSE"
  exit 1
fi
echo "OK chat history"

echo "Smoke test completed successfully."
