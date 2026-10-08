// Packages the ORST public website as a SELF-CONTAINED web server that can be
// run on any machine with Docker (or just Caddy) — no Strapi, no WordPress,
// no compose stack needed to SERVE it. The site is static HTML; those only
// matter at build time, which is what this script uses them for.
//
//   node public-site/scripts/package-standalone.mjs \
//        --url https://www.orst.go.th \
//        --wp  https://cms.orst.go.th/wp-json \
//        [--tag webx-orst-site] [--save]
//
// Run from the repo root with the compose stack up (profiles ai, wordpress,
// site) — it does a one-off build of the site against the running Strapi and
// WordPress, and does NOT touch the site-builder/site containers already
// serving the local trial.
//
// --url   the public address the site will live at. Baked into canonical /
//         Open Graph / RSS URLs, so it must be the FINAL address; changing
//         the domain later means packaging again.
// --wp    the WordPress REST base a VISITOR'S BROWSER can reach. The poll,
//         captcha and search features call it directly from the page, so it
//         cannot be localhost or a compose-internal name.
// --save  also write <bundle>/<tag>.tar (docker save) to copy to another host.
//
// Output: public-site/bundle/
//   site/        the static files          (what Caddy serves)
//   Caddyfile    the server config
//   Dockerfile   caddy + the files above in one image
//   README.md    how to run it
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(here, "..");
const ROOT = path.resolve(SITE, "..");
const BUNDLE = path.join(SITE, "bundle");

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : dflt; };
const url = flag("url", "http://orst.localhost:8090").replace(/\/$/, "");
const wp = flag("wp", "http://localhost:8081/wp-json").replace(/\/$/, "");
const tag = flag("tag", "webx-orst-site");
const save = args.includes("--save");

if (!/^https?:\/\/[^\s/]+/.test(url)) { console.error("--url must be an http(s) address, got: " + url); process.exit(2); }
if (/\blocalhost\b|\.localhost\b|127\.0\.0\.1/.test(wp) && !/localhost/.test(url)) {
  console.error("--wp is " + wp + " but --url is a real address: visitors' browsers cannot reach localhost. Pass --wp with a public WordPress URL.");
  process.exit(2);
}

function run(cmd, cmdArgs, opts = {}) {
  console.log("\n$ " + [cmd, ...cmdArgs].join(" "));
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: ROOT, ...opts });
  if (r.status !== 0) { console.error("\nFAILED: " + cmd + " exited " + r.status); process.exit(r.status || 1); }
}

rmSync(BUNDLE, { recursive: true, force: true });
const out = path.join(BUNDLE, ".build");
mkdirSync(out, { recursive: true });

// 1. One-off build — same image/env as the running site-builder, different
//    URLs, result written to a host folder instead of the shared volume.
//    The image is rebuilt first (cached when nothing changed) so a stale one
//    can never be used — an old builder would not know BUILD_ONCE, and would
//    start its server and never exit.
const PROFILES = ["--profile", "ai", "--profile", "wordpress", "--profile", "site"];
run("docker", ["compose", ...PROFILES, "build", "site-builder"]);
run("docker", [
  "compose", "--profile", "ai", "--profile", "wordpress", "--profile", "site",
  "run", "--rm", "--no-deps",
  "-e", "BUILD_ONCE=1",
  "-e", "PUBLIC_SITE_URL=" + url,
  "-e", "PUBLIC_SITE_URL_ORST=" + url,
  "-e", "NEXT_PUBLIC_WORDPRESS_URL=" + wp,
  "-v", out + ":/site",
  "site-builder",
]);

// 2. Take the one release it wrote.
const releases = path.join(out, "releases");
const made = existsSync(releases) ? readdirSync(releases).sort() : [];
if (!made.length) { console.error("build produced no release"); process.exit(1); }
cpSync(path.join(releases, made[made.length - 1]), path.join(BUNDLE, "site"), { recursive: true });
rmSync(out, { recursive: true, force: true });

// 3. Server config + image recipe + instructions.
cpSync(path.join(SITE, "docker", "Caddyfile"), path.join(BUNDLE, "Caddyfile"));
writeFileSync(path.join(BUNDLE, "Dockerfile"), `# ORST public website — static files + Caddy, nothing else.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY site/ /srv/current/
# Set SITE_ADDRESS at run time: a bare domain (www.orst.go.th) gets an automatic
# TLS certificate; http://host serves plain HTTP.
ENV SITE_ADDRESS=http://localhost
EXPOSE 80 443
`);
writeFileSync(path.join(BUNDLE, "README.md"), `# ORST public website — standalone

Built for **${url}** (WordPress for forms/polls/search: ${wp}).
Everything the site needs to be *served* is in this folder; it does not talk to
Strapi or WordPress to render pages. (Poll votes, the contact form's captcha and
site search do call WordPress from the visitor's browser, so ${wp} must be up.)

## Run with Docker

    docker build -t ${tag} .
    # real domain: ports 80 and 443 must reach this machine, DNS must point here
    docker run -d --name orst-site --restart unless-stopped \\
      -p 80:80 -p 443:443 -v orst-site-data:/data \\
      -e SITE_ADDRESS=${url.replace(/^https?:\/\//, "")} ${tag}

\`/data\` keeps the TLS certificate across restarts (don't skip it — Let's Encrypt
rate-limits re-issuing). To try it over plain HTTP instead:
\`-p 8080:80 -e SITE_ADDRESS=http://localhost\`.

## Run without Docker

Install Caddy 2, then from this folder:

    SITE_ROOT=./site SITE_ADDRESS=${url.replace(/^https?:\/\//, "")} caddy run --config Caddyfile

## Update the content

The files in \`site/\` are a snapshot. Content edits made in WebX Studio show up on
the live site after the site is re-packaged and redeployed:
\`node public-site/scripts/package-standalone.mjs --url ${url} --wp ${wp}\`
`);

// 4. Image (+ optional tarball to carry to another host).
run("docker", ["build", "-t", tag, BUNDLE]);
if (save) run("docker", ["save", "-o", path.join(BUNDLE, tag + ".tar"), tag]);

console.log("\nDone. Image: " + tag + "   Folder: " + BUNDLE + (save ? "\nTarball: " + path.join(BUNDLE, tag + ".tar") + "   (docker load -i " + tag + ".tar)" : ""));
