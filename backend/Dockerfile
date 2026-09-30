FROM node:20-bookworm-slim

# Enable contrib/non-free repos to access TrueType packages
RUN sed -i 's/main$/main contrib non-free non-free-firmware/g' /etc/apt/sources.list.d/* 2>/dev/null || true


# =========================================================================
# System packages
# Install system utilities, Python 3, LibreOffice suite, Ghostscript, and standard font sets
# =========================================================================
RUN apt-get update && apt-get install -y --no-install-recommends \
    bzip2 \
    tar \
    curl \
    wget \
    cabextract \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    cabextract \
    ghostscript \
    qpdf \
    poppler-utils \
    libreoffice \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    ghostscript \
    qpdf \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# =========================================================================
# Fonts — installed one group at a time so a missing package does not
# fail the whole build. Each `apt-get install ... || true` line tolerates
# individual packages that are not present in the current Debian release.
# =========================================================================

# --- Core office-compatible fonts (highest priority) ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-liberation \
        fonts-liberation2 \
        fonts-crosextra-carlito \
        fonts-crosextra-caladea \
        fonts-dejavu \
        fonts-croscore \
        fonts-dejavu-core \
        fonts-dejavu-extra \
        fonts-freefont-ttf \
        fonts-urw-base35 \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Noto family (comprehensive Unicode coverage) ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-noto \
        fonts-noto-core \
        fonts-noto-extra \
        fonts-noto-ui-core \
        fonts-noto-mono \
        fonts-noto-color-emoji \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Noto CJK (Chinese, Japanese, Korean) ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-noto-cjk \
        fonts-noto-cjk-extra \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Popular open-source Latin fonts ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-roboto \
        fonts-roboto-unhinted \
        fonts-lato \
        fonts-hack \
        fonts-firacode \
        fonts-ubuntu \
        fonts-lmodern \
        fonts-texgyre \
        fonts-junicode \
        fonts-sil-andika \
        fonts-sil-charis \
        fonts-sil-gentium \
        fonts-sil-gentium-basic \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Indic scripts (Hindi, Bengali, Tamil, Telugu, Gujarati, etc.) ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-lohit-beng \
        fonts-lohit-deva \
        fonts-lohit-gujr \
        fonts-lohit-guru \
        fonts-lohit-knda \
        fonts-lohit-mlym \
        fonts-lohit-orya \
        fonts-lohit-taml \
        fonts-lohit-taml-classical \
        fonts-lohit-telu \
        fonts-lohit-tibt \
        fonts-samyak-deva \
        fonts-samyak-gujr \
        fonts-samyak-mlym \
        fonts-samyak-orya \
        fonts-samyak-taml \
        fonts-beng \
        fonts-beng-extra \
        fonts-deva \
        fonts-deva-extra \
        fonts-gujr \
        fonts-gujr-extra \
        fonts-guru \
        fonts-guru-extra \
        fonts-knda \
        fonts-mlym \
        fonts-orya \
        fonts-orya-extra \
        fonts-taml \
        fonts-telu \
        fonts-telu-extra \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Malayalam (SMC family — widely used in Kerala government forms) ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-smc \
        fonts-smc-chilanka \
        fonts-smc-dyuthi \
        fonts-smc-gayathri \
        fonts-smc-karumbi \
        fonts-smc-keraleeyam \
        fonts-smc-manjari \
        fonts-smc-meera \
        fonts-smc-rachana \
        fonts-smc-raghumalayalamsans \
        fonts-smc-suruma \
        fonts-smc-uroob \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Arabic and Hebrew ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-kacst \
        fonts-kacst-one \
        fonts-hosny-amiri \
        fonts-sil-scheherazade \
        fonts-sil-abyssinica \
        fonts-sil-padauk \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- East Asian alternatives ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-takao \
        fonts-takao-gothic \
        fonts-takao-mincho \
        fonts-nanum \
        fonts-arphic-uming \
        fonts-arphic-ukai \
        fonts-wqy-microhei \
        fonts-wqy-zenhei \
        fonts-droid-fallback \
        fonts-bpg-georgian \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Thai, Khmer, Lao, Sinhala ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-thai-tlwg \
        fonts-tlwg-garuda \
        fonts-tlwg-kinnari \
        fonts-tlwg-laksaman \
        fonts-tlwg-loma \
        fonts-tlwg-mono \
        fonts-tlwg-norasi \
        fonts-tlwg-purisa \
        fonts-tlwg-sawasdee \
        fonts-tlwg-typewriter \
        fonts-tlwg-typist \
        fonts-tlwg-typo \
        fonts-tlwg-umpush \
        fonts-tlwg-waree \
        fonts-khmeros \
        fonts-lao \
        fonts-lklug-sinhala \
    || true ) && rm -rf /var/lib/apt/lists/*

# --- Misc extras ---
RUN apt-get update && ( \
    apt-get install -y --no-install-recommends \
        fonts-symbola \
        fonts-yrsa-rasa \
    || true ) && rm -rf /var/lib/apt/lists/*

# Refresh the font cache so the system picks up everything
RUN fc-cache -f -v 2>/dev/null || true

WORKDIR /usr/src/app

# =========================================================================
# Python dependencies
# =========================================================================
RUN pip3 install --no-cache-dir --break-system-packages \
    pymupdf \
    python-docx \
    pdfplumber \
    openpyxl \
    pikepdf

# =========================================================================
# Application
# =========================================================================
WORKDIR /app

COPY package*.json ./
RUN npm install --production

# Copy backend application code and conversion scripts
COPY . .

# Bind port for Render deployment (defaults to 5000)
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "server.js"]