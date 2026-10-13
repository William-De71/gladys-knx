# -----------------------------------------------------------------------------
# KNX integration image.
#
# A Node.js service (the Gladys side, through the SDK) that talks to the KNX
# bus through a KNX IP interface or router, with KNXUltimate.
#
# Gladys sandbox constraints ("the sandbox is the defense"):
#   - rootfs mounted READ-ONLY -> never write outside /data
#   - a single writable volume: /data (unused today: the declared devices
#     live in the Gladys configuration, so in the Gladys backups)
#   - runs as a non-root user
#   - multi-arch image (linux/amd64 + linux/arm64), see build.yml
# -----------------------------------------------------------------------------
FROM node:24-trixie-slim

# The version label and the manifest label are added by build.yml.
LABEL org.opencontainers.image.title="gladys-knx" \
      org.opencontainers.image.description="KNX installations in Gladys Assistant, through a KNX IP interface or router" \
      org.opencontainers.image.source="https://github.com/William-De71/gladys-knx" \
      org.opencontainers.image.licenses="Apache-2.0"

# dumb-init: handles signals (SIGTERM) correctly for a graceful shutdown (the
# KNX tunnel is closed, so the interface frees it at once).
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the PROD dependencies first (better build cache). `npm ci` only:
# a lockfile out of sync with package.json must fail the build. No install
# scripts: KNXUltimate loads the `serialport` native module at startup (never
# used here, no serial transport), whose prebuilt binaries for amd64 and
# arm64 ship in the npm package.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Then the integration code.
COPY index.js ./
COPY src ./src
COPY gladys-assistant-integration.json LICENSE NOTICE ./

ENV NODE_ENV=production

# The only writable location allowed at runtime. Docker creates a new volume
# with the owner of the image's /data, so it must belong to `node`, and before
# VOLUME: changes made to /data after it are discarded.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

# Run as an unprivileged user (already present in the node image).
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
