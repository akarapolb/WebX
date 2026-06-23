# WebX CLI

Operate the WebX/Strapi CMS from the terminal, scripts, or CI. Zero
dependencies (Node 18+). Talks to Strapi's REST API with a Strapi API token;
the optional `ai` command uses the LiteLLM gateway.

## Install
```bash
chmod +x cli-webx/webx.mjs
alias webx="node $(pwd)/cli-webx/webx.mjs"     # or: npm link / put on PATH
```

## Configure (env)
```bash
export STRAPI_URL=http://localhost:1337
export STRAPI_TOKEN=<strapi api token>      # Settings → API Tokens (least privilege)
export LITELLM_URL=http://localhost:4000     # optional, for `webx ai`
export LITELLM_KEY=<litellm key>
```

## Commands
```
webx types                          list content types
webx ls <type> [-q query] [-n 20]   list / search entries
webx get <type> <documentId>        full entry as JSON
webx new <type> --title=.. --k=v    create a draft
webx set <type> <id> --field=value  update an entry (stays draft)
webx audit [--type t] [--tenant k]  content audit (SEO/AEO · PDPA · quality · freshness)
webx ai <prompt>                    ask the configured LLM (provider-agnostic)
```

Read commands work without a token for content types whose public role has
`find`. Writes need a token. Like the MCP server, there is no publish/delete —
going live stays a human action.

## Examples
```bash
webx ls articles -n 5
webx audit --tenant dga
webx new articles --title="New release note"
webx ai "summarise the DGA open-data policy in 2 sentences"
```
