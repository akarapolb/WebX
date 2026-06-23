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
| `submit_for_review` | Put an entry into the human **review/approval** queue (Reviews board) |
| `list_reviews` | List the review queue (filter by stage) |

**Safe by design:** read + create/update **drafts** + **submit to review** only.
There is no publish or delete tool — an agent's change reaches the public site
only after a human approves and publishes it from the Reviews board. What the
agent can touch is bounded by the Strapi API token's permissions (least
privilege). This is the *gated agentic-write* surface: the agent proposes,
a person disposes.

## Setup
1. In Strapi admin → **Settings → API Tokens → Create**. Give it the minimum
   find/create/update permissions on the content types the agent should manage,
   plus `review` find/create for `submit_for_review` / `list_reviews` (a
   Full-access token covers all of this). Copy the token.
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
`find` permission. Writes and the review tools require a token (they return
`403 Forbidden` otherwise).

## Verify
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | node mcp-webx/server.mjs
```
You should see the server info and the tool list.
