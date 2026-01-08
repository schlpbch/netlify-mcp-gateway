#!/bin/bash

# Step 1: Get session endpoint
SESSION_URL=$(curl -N -H "Accept: text/event-stream" https://mcp-gateway.deno.dev/sse 2>&1 | grep "data:" | cut -d'"' -f2)

echo "Session URL: $SESSION_URL"

# Step 2: Initialize
curl -X POST "$SESSION_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# Step 3: List tools
curl -X POST "$SESSION_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
