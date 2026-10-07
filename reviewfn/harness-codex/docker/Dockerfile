FROM node@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
    && npm install --global --ignore-scripts @openai/codex@0.154.0 && codex --version && npm cache clean --force
USER node
ENV HOME=/tmp CODEX_HOME=/tmp
ENTRYPOINT ["codex"]
