#!/bin/bash
# Generate an investor link via the admin API
#
# Usage:
#   ./scripts/generate-link.sh "Investor Name" individual|corporate [days]
#
# Example:
#   ./scripts/generate-link.sh "Gordon Ding" individual 30

NAME="${1:?Usage: $0 <name> <type> [days]}"
TYPE="${2:?Usage: $0 <name> <type> [days]}"
DAYS="${3:-30}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${ADMIN_API_KEY:?Set ADMIN_API_KEY env var}"

curl -s -X POST "${BASE_URL}/api/admin/generate-link" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "{\"investorName\": \"${NAME}\", \"investorType\": \"${TYPE}\", \"expiresInDays\": ${DAYS}}" \
  | python3 -m json.tool 2>/dev/null || cat
