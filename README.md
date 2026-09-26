# 📄 PDF Forge
A modern, high-performance web application and desktop suite for converting, manipulating, compressing, and organizing PDF documents and Office files. Built with a React + Vite frontend and Node, Express + Python backend engine.

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

### PDF Security 
* **Unlock PDF** : Unlock a password protect or encrypted PDF once and for all 
* **Protect PDF** : Protect your PDF with password you want 
* **Sign PDF** : Draw, type (5 cursive fonts), or upload a signature, place it anywhere on any page, and burn it into the PDF with an aspect-ratio-locked resize workflow. 
* **Redact PDF** : (Coming Soon)
* **Compare PDF** : (Coming Soon)

### PDF Intelligence 
* **AI Summarizer** : Summarize your PDF with AI tool without going through a long set of pages
* **Translate PDF** : Translate a PDF from one to other language 
* **PDF to markdown** : Convert PDF content to markdown extension 

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
│   │   ├── EditPdfStudio.jsx       # Advanced in-place text editor (PyMuPDF powered)
│   │   ├── FAQSection.jsx          # Accordion FAQ section
│   │   ├── Footer.jsx              # Footer with quick tools, sections, resources
│   │   ├── Header.jsx              # Sticky nav with mega-dropdown + mobile drawer
│   │   ├── MobileNotSupportedModal.jsx
│   │   ├── PdfiumEditStudio.jsx    # Annotation editor backed by EmbedPDF/PDFium
│   │   ├── PdfiumTextEditOverlay.jsx
│   │   ├── PrivacySection.jsx      # Dark privacy + security pillars
│   │   ├── Reviews.jsx             # Testimonial carousel
│   │   ├── SignPdfStudio.jsx       # Signature placement editor
│   │   ├── TextFormatSidebar.jsx   # Font / color / spacing / alignment controls
│   │   ├── ToolCard.jsx            # Interactive tool card with hover animations
│   │   ├── ToolModal.jsx           # Upload & security-verification modal
│   │   └── ToolStudio.jsx          # Full-screen workspace for all 25+ tools
|   ├── data/
|   │   └── pdfTools.jsx         # all pdf tools entry
│   ├── utils/
│   │   ├── pageOcrReader.js        # Tesseract-based OCR helper (upscale + contrast)
│   │   └── pdfWorker.js         # Client-side processing & backend API client
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

## 🐳 Docker Deployment (Render / Cloud Containers)
The backend ships with a ```Dockerfile``` that installs Node 20, Python 3, LibreOffice, Ghostscript, and the required font packages in one image. This is the recommended way to run the backend anywhere (Render, Fly.io, Railway, self-hosted VPS).
Build and run the self-contained backend container:
```
# Build the backend container image
docker build -t pdf-tools-backend ./backend

# Run the container exposing port 5000
docker run -p 5000:5000 pdf-tools-backend
```
The container is **stateless** — every request writes temp files under ```/tmp``` and removes them in a finally block. Nothing persists across restarts.

## 🌐 Production Hosting Setup

**Backend (Render):** 
Render's free tier is enough to host PDF Forge, but it requires **two separate services:** a Docker Web Service for the backend and a Static Site for the React frontend.

In Render, create a new Web Service, link your repository, set the Runtime to Docker, and point the root directory to your backend/ folder. Render will build the container with LibreOffice installed automatically. Render binds to port 5000 automatically.

**Frontend (GitHub Pages / Vercel):** Set VITE_API_BASE_URL=https://<your-backend-domain>.onrender.com in .env.production and deploy using npm run build.

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
