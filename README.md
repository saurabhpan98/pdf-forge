# 📄 PDF Forge
> A modern, high-performance web application and desktop suite for converting, manipulating, compressing, and organizing PDF documents and Office files. Built with a React + Vite frontend and Node, Express + Python backend engine.

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white" alt="Docker Pulls">
  <img src="https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white" alt="Docker Pulls">
  <img src="https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white" alt="Docker Pulls">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" alt="Docker Pulls">
  <img src="https://img.shields.io/badge/Python-3.10+-3776ab?logo=python&logoColor=white" alt="Docker Pulls">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="Docker Pulls">  
</p>

---

## 🚀 Key Features & tools

### Organize PDF - 
* **Merge PDF** : Combine multiple PDFs
* **Split PDF** : Split documents by custom page ranges.
* **Remove Pages** : Remove pages just by selecting or defining the range
* **Extract Pages** : Extract specific page or range of pages from a PDF 
* **Organize PDF** : Drag-and-drop page reordering with individual page rotation.
* **Scan to PDF** : Directly scan a page from your phone to capture and convert it into PDF

### Convert to PDF 
* **Compress PDF** : Quality-preserving compression with before-and-after file size metrics.
* **Repair PDF** : (Coming Soon) Recover damaged and corrupted PDFs.
* **OCR Pages** : Make scanned documents searchable using in-browser Tesseract WASM. Supports English, Hindi, Spanish, French, and German. Two output modes: searchable PDF (invisible text layer) or plain .txt. Configurable DPI presets (192/288/384), character whitelists, and binarization.

### Optimize PDF 
* **JPG to PDF** : Conversion of Images to PDF with additional configuration applied on image while conversion
* **Word to PDF** : Direct conversion of Word (`.docx`, `.doc`) to PDF 
* **PowerPoint to PDF** : Direct conversion of PowerPoint (`.pptx`, `.ppt`) to PDF
* **Excel to PDF** : Direct conversion of Excel (`.xlsx`, `.xls`)
* **HTML to PDF** : Direct conversion of HTML (`.html`) files to PDF

### Convert from PDF 
* **PDF to JPG** : Conversion PDF file to image view of each page
* **PDF to Word** : High-fidelity document reconstruction preserving fonts, sizes, tables, and alignment without OpenXML schema corruption.
* **PDF to PowerPoint** : Slide-by-slide conversion retaining layout boundaries.
* **PDF to Excel** : Structured table and data extraction directly into clean `.xlsx` workbooks.
* **PDF to PDF/A** : ISO 19005 archival conversion (1b / 2b / 3b) with proper ICC OutputIntent, embedded fonts, and device-independent sRGB colorspace.

### Edit PDF 
* **Rotate PDF** : Interactive single-page and full-document rotation ($90^\circ$, $-90^\circ$, $180^\circ$).
* **Add page numbers** : Add pages on each / specific / range of pages with extra configuration tools given 
* **Add watermark** : Adding watermark with rotational ability on each or range of pages
* **Crop PDF** : Trim margins and adjust the visible page area with per-page or global boxes.
* **Edit PDF** : Full-featured annotation editor built on the EmbedPDF / PDFium WASM engine. Add text boxes, highlights, images, shapes (rectangle, ellipse, line, arrow, triangle, diamond), freehand drawings, and redactions.
* **Edit PDF Text** : In-place editing of existing text using a PyMuPDF text-free background restoration pipeline — preserves colored backgrounds, gradients, and images without painting white boxes. Includes background OCR to recover garbled ToUnicode mappings. Desktop only.
* **PDF Forms** : Detect, fill, and create interactive AcroForm fields (text, checkbox, radio, dropdown, listbox, signature).
* **Edit Metadata** : View and edit document properties — Title, Author, Subject, Keywords, Creator, Producer, and creation/modification dates. Inline "Was: …" comparison, per-field change badges, and full client-side processing via `pdf-lib`.

### PDF Security 
* **Unlock PDF** : Unlock a password protect or encrypted PDF once and for all 
* **Protect PDF** : Protect your PDF with password you want 
* **Sign PDF** : Draw, type (5 cursive fonts), or upload a signature, place it anywhere on any page, and burn it into the PDF with an aspect-ratio-locked resize workflow. 
* **Redact PDF** : True content-stream redaction powered by PyMuPDF. Draw rectangles over sensitive areas and permanently remove the underlying text glyphs, image pixels, and covered vector graphics — not just cover them. Drawings are stored in PDF-point space, so they survive zoom, page navigation, and multi-page editing. Includes fill-color options (black / red / white), per-page redaction lists with live mini-previews, and a "Continue editing" flow that preserves every drawn rectangle when you want to apply again.
* **Compare PDF** : (Coming Soon)

### PDF Intelligence
| Tool | Description |
|---|---|
| **AI Summarizer** | On-device summarization using Transformers.js. Three depth modes (Quick / Standard / Deep) with map-reduce chunking for long documents. Runs entirely in your browser — files never leave your device. |
| **Translate PDF** | Translate documents into 14+ languages using NLLB-200 or Opus-MT models. Paragraph-aware translation preserves structure. Also runs entirely client-side. |
| **PDF to Markdown** | Convert structured PDFs into clean GitHub-Flavored Markdown with table and heading preservation. |

**AI tools run fully in-browser** via WebAssembly and (where available) WebGPU. No API keys, no server round-trip, no rate limits. Models download once and are cached locally — you can clear them any time from the storage icon in each AI tool's header.

---

## 🛠 Tech Stack
### Frontend
* **Framework:** React 19 + Vite 8
* **Styling:** Tailwind CSS v4 (via ```@tailwindcss/vite)```, ```tailwind-merge```, ```clsx```
* **Icons:** Lucide React
* **PDF rendering:** ```pdfjs-dist```, ```@embedpdf/react-pdf-viewer```, ```@embedpdf/pdfium```
* **PDF manipulation:** ```pdf-lib```, ```@pdf-lib/fontkit```
* **Signature:** ```react-signature-canvas```
* **Image cropping:** ```react-image-crop```
* **OCR (client-side):** ```tesseract.js```
* **Archives:** ```jszip```
* **On-device AI:** `@huggingface/transformers` (Transformers.js) — WebGPU accelerated with WASM fallback
*-* **AI models used:** `Xenova/distilbart-cnn-12-6` (summarization), `Xenova/nllb-200-distilled-600M` + per-language `Xenova/opus-mt-*` (translation)

### Backend
* **Runtime:** Node.js 20+ / Express 5
* **Upload handling:** Multer (```memoryStorage``` — no disk writes)
* **Process orchestration:** ```child_process.spawn```, ```libreoffice-convert```

### Engines & Parsers
* **Python 3.10+:** PyMuPDF, python-docx, pdfplumber, openpyxl, pikepdf
* **System binaries:** LibreOffice (headless), Ghostscript, qpdf, Poppler-utils
* **Fonts:** Liberation, DejaVu, Noto, Carlito, Caladea

> ⚠️ LibreOffice is required on Render because ```libreoffice-convert``` wraps the system CLI (```libreoffice --headless```). Without the binary, Office conversions will fail with ```spawn libreoffice ENOENT```.

---

### Does PDF Forge store files on server or database ?
**No, this app does not store your processed or uploaded file anywhere.** Most of the tools process files on your browser, and those processed on backend/server, does not store. Also, we do not have database usage. We have open sourced this app as a proof. 
  * **Multer Configuration**: multer.memoryStorage() keeps the incoming .docx file entirely in RAM as a temporary Node.js Buffer. No files are written to server folders or databases.
  * **Conversion & Response**: LibreOffice processes the in-memory stream, and Express immediately streams the output buffer back to the browser via res.send(pdfBuffer). Once the request finishes, the memory is released by Node.js garbage collection.
  * **Client Handling**: The browser converts the returned response into a temporary Blob URL in memory (URL.createObjectURL), which is revoked and cleared when the modal closes.

---

## 📂 Repository Structure

```text
├── backend/
│   ├── convert_edit_pdf.py         # In-place PDF text editing (PyMuPDF background restoration)
│   ├── convert_redact_pdf.py       # True content-stream redaction (text, images, vector graphics)
│   ├── pdf_inplace_editor.py       # Content-stream Tj/TJ rewriter for span edits
│   ├── convert_pdf2docx.py         # PDF → DOCX reconstruction engine
│   ├── convert_pdf2excel.py        # PDF → XLSX table extraction engine
│   ├── convert_pdf2md.py           # PDF → Markdown converter (GFM tables + headings)
│   ├── Dockerfile                  # Container image with Node + Python + LibreOffice + GS
│   ├── package.json                # Backend Node dependencies
│   └── server.js                   # Express API + conversion pipeline
├── src/
│   ├── components/
|   |   ├── AboutSection.jsx        # About PDF Forge + values grid
│   │   ├── AICacheManager.jsx      # Modal for inspecting / clearing AI model storage
│   │   ├── AISummarizerStudio.jsx  # On-device PDF summarizer UI
│   │   ├── AIWorkingCard.jsx       # Animated loading state for AI tasks
│   │   ├── TranslatePdfStudio.jsx  # On-device translation UI
│   │   ├── EditPdfStudio.jsx       # Advanced in-place text editor (PyMuPDF powered)
│   │   ├── FAQSection.jsx          # Accordion FAQ section
│   │   ├── Footer.jsx              # Footer with quick tools, sections, resources
│   │   ├── Header.jsx              # Sticky nav with mega-dropdown + mobile drawer
│   │   ├── MetadataEditorStudio.jsx # Read & edit PDF document properties (pdf-lib)
│   │   ├── MobileNotSupportedModal.jsx
│   │   ├── PdfiumEditStudio.jsx    # Annotation editor backed by EmbedPDF/PDFium
│   │   ├── PdfiumTextEditOverlay.jsx
│   │   ├── PrivacySection.jsx      # Dark privacy + security pillars
│   │   ├── RedactPdfStudio.jsx     # True PDF redaction editor (marquee + PyMuPDF backend)
│   │   ├── Reviews.jsx             # Testimonial carousel
│   │   ├── SignPdfStudio.jsx       # Signature placement editor
│   │   ├── TextFormatSidebar.jsx   # Font / color / spacing / alignment controls
│   │   ├── ToolCard.jsx            # Interactive tool card with hover animations
│   │   ├── ToolModal.jsx           # Upload & security-verification modal
│   │   └── ToolStudio.jsx          # Full-screen workspace for all 25+ tools
|   ├── data/
|   │   └── pdfTools.jsx         # all pdf tools entry
│   ├── hooks/
│   │   └── useAIWorker.js          # Web Worker bridge for AI tasks
│   ├── utils/
│   │   ├── aiCacheManager.js       # Cache API stats + clearing for AI models
│   │   ├── pageOcrReader.js        # Tesseract-based OCR helper (upscale + contrast)
│   │   └── pdfWorker.js         # Client-side processing & backend API client
│   ├── workers/
│   │   └── ai.worker.js            # Transformers.js pipeline (summarize + translate)
│   ├── App.jsx                  # Main dashboard layout
│   ├── index.css                # Global Tailwind CSS styles
│   └── main.jsx                 # Application entry point
├── .env.production              # Production API base URL configuration
├── index.html                   # HTML entry page
├── package.json                 # Frontend dependencies & deployment scripts
├── tailwind.config.js           # Tailwind CSS configuration
└── vite.config.js               # Vite build configuration

```

## 💻 Local Setup & Installation

### Prerequisites
Ensure you have the following installed on your machine:

  1. Node.js: v18+ or v20+
  2. Python: 3.10+ with pip
  3. System Packages (Linux / Debian / Codespaces):

```
sudo apt-get update && sudo apt-get install -y \
  bzip2 \
  tar \
  curl \
  wget \
  cabextract \
  build-essential \
  python3 \
  python3-pip \
  libreoffice \
  libreoffice-writer \
  libreoffice-calc \
  libreoffice-impress \
  ghostscript \
  qpdf \
  poppler-utils \
  fonts-liberation \
  fonts-liberation2 \
  fonts-dejavu \
  fonts-croscore \
  fonts-crosextra-carlito \
  fonts-crosextra-caladea \
  fonts-noto \
  fonts-freefont-ttf
```

### 1. Backend setup
```
# Navigate to the backend directory
cd backend

# Install Node dependencies
npm install

# Install required Python layout and parsing libraries
pip3 install --break-system-packages pymupdf python-docx pdfplumber openpyxl pikepdf

# Start the backend server (runs on http://localhost:5000)
node server.js
```

### 2. Frontend setup
```
# Navigate to the project root
cd ..

# Install frontend dependencies
npm install

# Start the Vite development server (runs on http://localhost:5173)
npm run dev
```
Vite starts on http://localhost:5173 and proxies ```/api/*``` requests to the backend on port 5000 (configured in ```vite.config.js```).

### 3. AI tools (no setup required)

`@huggingface/transformers` is a regular npm dependency, so `npm install` is all you need. The AI models download on first use and are cached in the browser:

* **Summarizer** — ~250 MB (`distilbart-cnn-12-6`, quantized)
* **Translator** — ~50 MB for common pairs via Opus-MT, ~600 MB for NLLB fallback

Model downloads run once per browser. To free the space, open either AI tool and click the **storage icon** in the header → **Clear cache**. The next run re-downloads.

**WebGPU support:** If your browser exposes a WebGPU adapter (Chrome 113+ with hardware acceleration enabled), the models run on GPU and are roughly **5–10× faster**. Otherwise they fall back to WebAssembly on CPU. Both paths produce identical output — the header badge shows which is active (`GPU` or `CPU`).

### 4. Convenience: run both together
The root package.json has a dev script that launches both processes concurrently:
```
npm run dev
# → CLIENT  Vite ready on 5173
# → SERVER  Conversion server running on port 5000
```
### 5. Build the production bundle
```
npm run build      # outputs to dist/
npm run preview    # serves dist/ locally for verification
```

## 🐳 Docker Deployment (Render / Cloud Containers)
The backend ships with a ```Dockerfile``` that installs Node 20, Python 3, LibreOffice, Ghostscript, and the required font packages in one image. This is the recommended way to run the backend anywhere (Render, Fly.io, Railway, self-hosted VPS).
Build and run the self-contained backend container:
```
# Build the backend container image
docker build -t pdf-forge-backend ./backend

# Run the container exposing port 5000
docker run -p 5000:5000 pdf-forge-backend

# Verify
curl http://localhost:5000/
```
The container is **stateless** — every request writes temp files under ```/tmp``` and removes them in a finally block. Nothing persists across restarts.

## 🌐 Production Hosting Setup

**Backend (Render):** 
Render's free tier is enough to host PDF Forge, but it requires **two separate services:** a Docker Web Service for the backend and a Static Site for the React frontend.

### ⚠️ Free tier limitations
1. **Spin-down:** services sleep after 15 min of inactivity → first request takes 30–60 s to wake up.
2. **512 MB RAM, 0.1 vCPU per instance.** Simultaneous heavy conversions can be slow.
3. **750 instance hours / month** — enough for one always-on service.
4. **Ephemeral disk** — wiped on every deploy (irrelevant since the app is stateless).

In Render, create a new Web Service, link your repository, set the Runtime to Docker, and point the root directory to your backend/ folder. Render will build the container with LibreOffice installed automatically. Render binds to port 5000 automatically. Step wise - 

### Step 1 — Push to GitHub
Make sure these files are committed:
```
git add Dockerfile backend/Dockerfile vite.config.js .nvmrc
git commit -m "Prepare for Render deployment"
git push
```

### Step 2 — Deploy the backend Web Service
1. Render Dashboard → **New → Web Service.**
2. Connect your repository.
3. Configure:
   
   | Settings | Value |
   | -------- | ----- |
   | Name	| pdf-forge-backend |
   | Root Directory	| backend |
   | Runtime	| Docker |
   | Instance Type	| Free |
   | Health Check Path |	/ |
4. Deploy. Render builds the Docker image (5–10 min on the first run due to LibreOffice).
5. Copy the service URL — you'll need it for the frontend, e.g. ```https://pdf-forge-backend.onrender.com.```
   
**Frontend (GitHub Pages / Vercel):** Set VITE_API_BASE_URL=https://<your-backend-domain>.onrender.com in .env.production and deploy using npm run build.

Or you can also try Render static for frontend deployment
### 1. Deploy the frontend Static Site on Render
1. Render Dashboard → New → Static Site.
2. Connect the same repository.
3. Configure:
   
   | Setting	| Value |
   | ------- | ----- |
   | Name	| pdf-forge-frontend | 
   | Branch	| main |
   | Root Directory	| (leave blank) |
   | Build Command	| npm install && npm run build |
   | Publish Directory	| dist |
4. **Environment variables** (Settings → Environment):
```
NODE_VERSION=22
VITE_API_BASE_URL=https://pdf-forge-backend.onrender.com
```
> ⚠️ Vite inlines env vars at build time. You must redeploy after adding them.
5. **Redirects / Rewrites:** add a catch-all so client-side routing doesn't 404 on refresh:

   | Source	| Destination	| Action |
   | ------ | ----------- | ------ |
   | /*	| /index.html	| Rewrite |
6. **Deploy.** The build takes ~2 min.

### 2 — Kill the cold start (optional)
Add a health check endpoint in server.js if you haven't already:
```
app.get('/health', (req, res) => res.status(200).send('OK'));
```
Then register it with UptimeRobot or cron-job.org at a **10-minute interval** to keep the container warm.

### Final step — Verify
1. Backend: ```https://pdf-forge-backend.onrender.com/health``` → should return ```OK```.
2. Frontend: open your Static Site URL. DevTools → Console should show no 404s on ```assets/*.js```.
3. End-to-end: run a server-side tool (e.g. **Word to PDF**). If it converts and downloads, the wiring is correct.

## 🔒 Security, Privacy & Processing Architecture
PDF Forge is built around a simple promise: your documents remain yours.

* Stateless & Ephemeral Storage: All uploaded and generated files are stored in temporary memory/disk locations and deleted immediately after the response stream closes.

* Password Verification: Encrypted files are validated prior to execution to prevent process deadlocks.

* Valid OpenXML Generation: Document models are synthesized strictly within Microsoft OpenXML standards to eliminate corrupt file warnings.

### Client-side processing (default for most tools)
Merge, split, rotate, watermark, page numbers, crop, compress, sign, forms, and OCR all run entirely inside the browser using WebAssembly and JavaScript. Your file never leaves your device.

### Server-side processing (only when a real engine is required)
Office conversions, PDF/A, and in-place text editing run on the backend. These paths are stateless:
* **Multer configuration:** multer.memoryStorage() keeps uploads entirely in RAM as a Buffer. No files are written to server folders or databases.
* **Conversion & response:** The engine processes the in-memory stream; Express streams the output back via res.send(buffer). Node's garbage collector releases the memory as soon as the response closes.
* **Client handling:** The browser receives the response as a Blob URL (URL.createObjectURL), which is revoked the moment the modal closes or the user navigates away.

### AI features are 100% client-side

The **AI Summarizer** and **Translate PDF** tools run entirely in your browser using Transformers.js and WebAssembly/WebGPU. Your document text is:

* **Never uploaded** — inference happens on your device
* **Never logged** — there is no server involvement
* **Never sent to OpenAI, Anthropic, Google, or any LLM provider**
* **Cached locally** — the model weights are stored in the browser's Cache API and can be cleared at any time from the storage icon in each tool

This is architectural privacy: the design makes it impossible for your data to leave your device, regardless of what any policy says.

### Metadata editing is client-side too

The **Edit Metadata** tool reads and writes PDF document properties entirely in the browser via `pdf-lib`. No network request is made — the file is loaded into memory, modified, and returned as a Blob URL that you download locally. Removing personal information (author names, creator software, keywords) from a PDF is fully covered by this offline workflow.

### Redaction is real, not visual

The **Redact PDF** tool performs genuine content-stream removal — the same standard Adobe Acrobat uses. Drawing a black rectangle on top of text is not redaction: the underlying bytes remain in the file and can be recovered by copy-paste, text extraction, or hex inspection.

Our implementation calls PyMuPDF's `add_redact_annot()` and `apply_redactions()` on the server, which:

* **Removes every text glyph** intersecting a redaction rectangle from the PDF content stream.
* **Scrubs image pixels** at the covered region (`PDF_REDACT_IMAGE_PIXELS`) so photos and scans cannot be reconstructed.
* **Drops covered vector graphics** — lines, paths, and fills fully inside the rectangle disappear.
* **Rewrites the page content stream** without the removed operations, then saves with `garbage=4, deflate=True, clean=True` for maximum scrubbing.

To verify: run `pdftotext` on the output and search for the redacted content. It will return nothing. Files are processed in-memory on the server and discarded the moment the download finishes — same ephemeral model as every other server-side tool.

**NOTE:** Troubleshooting in Redaction

**Redaction appears to leave a visible "shadow" of the text**

The output is correct — the underlying content is gone, but a PDF reader may still show a faint artifact if the original page had anti-aliased text and the redaction rectangle was drawn too tight. Solution: extend the rectangle by a few pixels on each side so it fully covers the glyph bounding boxes. You can drag a rectangle's edges after drawing it, or delete and redraw it slightly larger before applying.


### Additional guarantees
* **No database.** There is nothing persistent to leak.
* **No analytics.** No fingerprinting, no ads, no third-party tracking.
* **Password-aware.** Encrypted PDFs and locked Office files are detected up-front; the app refuses to process them unless you explicitly provide the password to the Unlock tool.
* **Auditable source.** Every line of code is on GitHub. Verify our claims, self-host it, or fork it.

## 🗺 Roadmap
* Repair PDF (recover corrupted files)
* Redact PDF (permanent blackout)
* Compare PDF (visual + text diff)
* Sign PDF with X.509 / PKCS#7 cryptographic signatures
* AI Summarizer (local + cloud LLM options)
* Translate PDF
* Scan to PDF (camera capture)
* Batch processing / presets
* Desktop app (Tauri / Electron wrapper)

## 🤝 Contributing
Contributions are welcome. Please:
1. Fork the repository.
2. Create a feature branch (git checkout -b feat/amazing-tool).
3. Commit with a descriptive message.
4. Open a pull request against main.

For bug reports, please include:
* Browser + OS
* Exact steps to reproduce
* A sample file (if safe to share)
* Any console errors

## 📄 License
MIT — see LICENSE.

<p align="center"> Crafted with ❤️ by <strong>Saurabh Panchal</strong><br/> <a href="https://github.com/saurabhpan98/pdf-forge">GitHub</a> · <a href="https://github.com/saurabhpan98/pdf-forge/issues">Report an Issue</a> </p>
