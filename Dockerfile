FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:1 \
    OLLAMA_HOST=127.0.0.1:11434 \
    OLLAMA_MODEL=llama3.2:1b \
    OLLAMA_VISION_MODEL=llama3.2-vision \
    PULL_OLLAMA_VISION_MODEL=false

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates software-properties-common \
  && add-apt-repository -y universe \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    clang \
    cmake \
    curl \
    dbus-x11 \
    file \
    fluxbox \
    fonts-dejavu-core \
    git \
    gnupg \
    build-essential \
    libasound2 \
    libayatana-appindicator3-dev \
    libclang-dev \
    libgbm1 \
    libgl1-mesa-dri \
    libgl1-mesa-glx \
    libgtk-3-dev \
    libnss3 \
    librsvg2-dev \
    libsqlite3-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libxdo-dev \
    novnc \
    pkg-config \
    sqlite3 \
    tigervnc-common \
    tigervnc-standalone-server \
    websockify \
    wget \
    x11-xserver-utils \
    x11vnc \
    xdg-utils \
    xvfb \
    zstd \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal

ENV PATH="/root/.cargo/bin:${PATH}"

RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN chmod +x /app/start.sh

# Tauri v2 release build. --no-bundle keeps the image focused on the runnable Linux binary.
RUN npm run tauri -- build --no-bundle

EXPOSE 6080

CMD ["/app/start.sh"]
