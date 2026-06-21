# WebX CMS — MCP server

Lets MCP clients (Claude Code, Claude Desktop, Cursor) operate the WebX/Strapi
CMS through tools. Zero dependencies — plain Node 18+ (uses global `fetch`),
stdio JSON-RPC.

## Tools
| Tool | What it does |
|---|---|
| `list_content_types` | List content types you can work with |
| `search_content` | Search/list entries of a type (lightweight summaries) |
| `get_entry` | Fetch one entry in full by documentId |
| `create_entry` | Create a **draft** entry (does not publish) |
| `update_entry` | Update an entry (stays draft until a human publishes) |

**Safe by design:** read + create/update **drafts** only. There is no publish
or delete tool — and what the agent can touch is bounded by the Strapi API
token's permissions (least privilege). Publishing stays a human action.

## Setup
1. In Strapi admin → **Settings → API Tokens → Create**. Give it the minimum
   find/create/update permissions on the content types the agent should manage.
   Copy the token.
2. Add the server to your MCP client.

**Claude Code** (`.mcp.json` in your project, or `claude mcp add`):
```json
{
  "mcpServers": {
    "webx-cms": {
      "command": "node",
      "args": ["mcp-webx/server.mjs"],
      "env": { "STRAPI_URL": "http://localhost:1337", "STRAPI_TOKEN": "<your-token>" }
    }
  }
}
```

**Claude Desktop / Cursor** — same shape in their MCP config file.

Without a token, read tools still work for content types whose public role has
`find` permission. Writes require a token.

## Verify
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | node mcp-webx/server.mjs
```
You should see the server info and the tool list.
