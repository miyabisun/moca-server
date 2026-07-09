# syntax=docker/dockerfile:1

# (a) SPA ビルド: client/build を生成する。
FROM oven/bun:1 AS client
WORKDIR /app/client
COPY client/package.json client/bun.lock* ./
RUN bun install
COPY client/ ./
RUN bun run build

# (b) Rust ビルド: cargo build --release で単一バイナリを作る。
# libopus (audiopus) を pkg-config 経由でリンクするため libopus-dev を入れる。
FROM rust:slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libopus-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

# (c) ランタイム: VOICEPEAK は glibc 依存のため debian ベース (alpine=musl は不可)。
FROM debian:stable-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        libopus0 libasound2 libfreetype6 libcurl4 libpng16-16 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/moca-server /usr/local/bin/moca-server
# SPA 成果物 (spa.rs / ServeDir が実行ディレクトリの client/build を参照する)。
COPY --from=client /app/client/build ./client/build

# VOICEPEAK は商用ソフトのため同梱しない。/opt/voicepeak に volume mount する前提。
ENV VOICEPEAK=/opt/voicepeak/voicepeak
ENV DATABASE_PATH=/data/moca.db
VOLUME /data
EXPOSE 3000

CMD ["moca-server"]
