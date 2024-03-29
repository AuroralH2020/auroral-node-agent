ARG ARCH
ARG BUILD_DATE
ARG BUILD_VERSION
ARG BASE_IMAGE=node:16-slim 

# BUILD PHASE
# run only on native platform
FROM $BASE_IMAGE AS build-env
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
USER node
COPY --chown=node:node package*.json tsconfig.json ./
# INSTALL DEPENDENCIES
# RUN npm ci --only=production && npm cache clean --force
RUN npm ci && npm cache clean --force

FROM alpine/git as ui-download
# RUN apk add --no-cache git
RUN mkdir /ui
WORKDIR /ui
RUN git clone https://github.com/AuroralH2020/agent-ui

# RUN PHASE
FROM node:16-slim
# Copy source code
COPY --from=build-env /app /app
# Copy UI
COPY --from=ui-download /ui/agent-ui/dist/ /app/ui/
COPY healthcheck.js /app/healthcheck.js
WORKDIR /app
# COPY SOURCES
COPY --chown=node:node dist ./dist
EXPOSE 3000
# LABEL
LABEL maintaner="jorge.almela@bavenir.eu"
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.opencontainers.image.version=$BUILD_VERSION
LABEL org.opencontainers.image.source=https://github.com/AuroralH2020/auroral-node-agent
# START
CMD ["node", "/app/dist/src/server.js"]