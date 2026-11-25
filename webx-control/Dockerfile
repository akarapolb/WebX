# webx-control: the WebX control plane (one Rust binary, one SQLite file).
#   docker build -t webx-control ./webx-control
#   docker run -p 1400:1400 -v control-data:/data -e WEBX_CONTROL_SERVICE_TOKEN=... -e WEBX_PII_KEY=... webx-control
# See README.md, "Configuration", for every setting. The binary listens on 127.0.0.1 by default; this image gives it
# --host 0.0.0.0 so the port can be published: keep it on a private network, behind the reverse proxy that sets X-Forwarded-For.
FROM rust:1-slim AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 1001 --home-dir /data webx && mkdir -p /data && chown webx /data
COPY --from=build /src/target/release/webx-control /usr/local/bin/webx-control
USER webx
WORKDIR /data
VOLUME /data
EXPOSE 1400
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -fsS http://127.0.0.1:1400/_health >/dev/null || exit 1
ENTRYPOINT ["webx-control"]
CMD ["--host", "0.0.0.0", "--port", "1400", "--db", "/data/control.db"]
