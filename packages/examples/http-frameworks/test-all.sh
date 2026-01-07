#!/bin/bash

# Test script for cross-framework demo
# Assumes all three servers are running on their respective ports

echo "🧪 Testing Cross-Framework Demo"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

FAILURES=0 # Initialize failure counter

test_endpoint() {
  local name=$1
  local url=$2
  local expected_status=$3
  
  response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  
  if [ "$response" -eq "$expected_status" ]; then
    echo -e "${GREEN}✓${NC} $name: $url (HTTP $response)"
  else
    echo -e "${RED}✗${NC} $name: $url (Expected $expected_status, got $response)"
    FAILURES=$((FAILURES + 1)) # Increment failure counter
  fi
}

# Express (Port 3001)
echo "Express (Port 3001):"
test_endpoint "Health Check" "http://localhost:3001/api/health" 200
test_endpoint "List Users" "http://localhost:3001/api/users" 200
test_endpoint "Get User" "http://localhost:3001/api/users/1" 200
test_endpoint "404 Test" "http://localhost:3001/api/notfound" 404
echo ""

# Hono (Port 3002)
echo "Hono (Port 3002):"
test_endpoint "Health Check" "http://localhost:3002/api/health" 200
test_endpoint "List Users" "http://localhost:3002/api/users" 200
test_endpoint "Get User" "http://localhost:3002/api/users/1" 200
test_endpoint "404 Test" "http://localhost:3002/api/notfound" 404
echo ""

# Fastify (Port 3003)
echo "Fastify (Port 3003):"
test_endpoint "Health Check" "http://localhost:3003/api/health" 200
test_endpoint "List Users" "http://localhost:3003/api/users" 200
test_endpoint "Get User" "http://localhost:3003/api/users/1" 200
test_endpoint "404 Test" "http://localhost:3003/api/notfound" 404
echo ""

echo "================================"
if [ $FAILURES -gt 0 ]; then
  echo -e "${RED}✗ $FAILURES test(s) failed${NC}"
  exit 1
else
  echo -e "${GREEN}✅ All tests passed!${NC}"
fi
echo ""
echo "Test identical responses:"
echo "curl http://localhost:3001/api/users | jq"
echo "curl http://localhost:3002/api/users | jq"
echo "curl http://localhost:3003/api/users | jq"
