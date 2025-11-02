FROM oven/bun:1-alpine
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.json ./

RUN bun install --frozen-lockfile --production

COPY src/ ./src/

USER bun
EXPOSE 3000/tcp
ENTRYPOINT [ "bun", "run", "start" ]