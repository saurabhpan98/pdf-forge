const express = require('express');
const cors = require('cors');
const multer = require('multer');
const libre = require('libreoffice-convert');
const util = require('util');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const libreConvert = util.promisify(libre.convert);
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

//cors for local 
//app.use(cors());

//cors for production 
/*app.use(cors({
  origin: '*', // Or specify: ['https://your-app.vercel.app', 'https://<username>.github.io']
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  exposedHeaders: ['x-original-size', 'x-compressed-size', 'Content-Disposition']
}));*/

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  exposedHeaders: [
    'Content-Disposition',
    'Content-Length',

    // Compress / Crop / Edit / Word-to-PDF size headers
    'x-original-size',
    'x-compressed-size',
    'x-edited-size',
    'x-converted-size',
    'x-pdfa-size',

    // Redact
    'x-redacted-size',

    // Repair
    'x-repaired-size',
    'x-repair-engine',
    'x-original-pages',
    'x-repaired-pages',

    // Word to PDF — audit + integrity
    'x-page-count',
    'x-text-extractable',
    'x-missing-fonts',
    'x-used-fonts',

    // Compress algorithm info
    'x-algorithm',
    'x-was-compressed',
    'x-complexity-warnings',
    'x-complexity-flags',
    'x-high-fidelity',
    'x-conversion-engine',
    'x-conversion-enhanced',
    'x-converted-size',
    // PDF to PowerPoint
    'x-ppt-mode',
    'x-slide-count',
    'x-text-boxes',
    'x-image-count',
    // PDF to Excel
    'x-excel-mode',
    'x-table-count',
    'x-row-count',
    'x-sheet-count',
  ],
}));

app.use(express.json());

// Universal 1:1 Word to PDF conversion engine for arbitrary document layouts.
// Returns:
//   { buffer, audit, integrity, complexity, highFidelity }
//   • audit       — font audit (from before conversion)
//   • integrity   — post-conversion validation
//   • complexity  — chart / diagram / OLE detection
//   • highFidelity — true if the output was rasterized
async function convertDocxToPdf(fileBuffer, originalFilename, options = {}) {
  const highFidelity = Boolean(options.highFidelity);
  const tempId = `docx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_${originalFilename}`);
  const rawPdfPath = path.join(tempDir, `${tempId}_raw.pdf`);
  const finalPdfPath = path.join(tempDir, `${tempId}_final.pdf`);
  const rasterizedPath = path.join(tempDir, `${tempId}_rasterized.pdf`);
  const userProfileDir = path.join(tempDir, `lo_profile_${tempId}`);

  await fs.writeFile(inputPath, fileBuffer);

  // ---------------------------------------------------------------
  // 0a. PRE-CONVERSION — Normalize DOCX for LibreOffice
  // ---------------------------------------------------------------
  const preprocessedPath = path.join(tempDir, `${tempId}_preprocessed.docx`);
  let usePreprocessed = false;
  try {
    if (originalFilename.toLowerCase().endsWith('.docx')) {
      const preprocessScript = path.join(__dirname, 'preprocess_docx.py');
      const preprocessed = await new Promise((resolve) => {
        const py = spawn('python3', [preprocessScript, inputPath, preprocessedPath]);
        py.stderr.on('data', (d) => process.stderr.write(`[py-preprocess] ${d}`));
        py.on('close', (code) => resolve(code === 0));
        py.on('error', () => resolve(false));
      });
      if (preprocessed && (await fs.stat(preprocessedPath).catch(() => null))) {
        usePreprocessed = true;
      }
    }
  } catch (e) {
    console.warn('DOCX preprocessing failed, using original:', e.message);
  }

  const conversionInputPath = usePreprocessed ? preprocessedPath : inputPath;

  // ---------------------------------------------------------------
  // 0b. PRE-CONVERSION — Font audit
  // ---------------------------------------------------------------
  let fontAudit = { fonts: [], missing: [], available: [] };
  try {
    const auditScript = path.join(__dirname, 'audit_docx_fonts.py');
    const auditOutput = await new Promise((resolve) => {
      const py = spawn('python3', [auditScript, conversionInputPath]);
      let out = '';
      py.stdout.on('data', (d) => { out += d.toString(); });
      py.stderr.on('data', (d) => process.stderr.write(`[py-audit] ${d}`));
      py.on('close', () => resolve(out));
      py.on('error', () => resolve(''));
    });
    const line = auditOutput.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
    if (line) {
      try { fontAudit = JSON.parse(line.slice('__RESULT__'.length)); }
      catch (e) { console.warn('Font audit JSON parse failed:', e.message); }
    }
  } catch (e) {
    console.warn('Font audit step failed:', e.message);
  }

  // ---------------------------------------------------------------
  // 0c. PRE-CONVERSION — Complexity detection
  // ---------------------------------------------------------------
  let complexity = { hasCharts: false, hasDiagrams: false, hasOleObjects: false, hasDrawingCanvas: false, warnings: [] };
  try {
    if (originalFilename.toLowerCase().endsWith('.docx')) {
      const detectScript = path.join(__dirname, 'detect_docx_complexity.py');
      const detectOutput = await new Promise((resolve) => {
        const py = spawn('python3', [detectScript, conversionInputPath]);
        let out = '';
        py.stdout.on('data', (d) => { out += d.toString(); });
        py.stderr.on('data', (d) => process.stderr.write(`[py-complexity] ${d}`));
        py.on('close', () => resolve(out));
        py.on('error', () => resolve(''));
      });
      const line = detectOutput.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
      if (line) {
        try { complexity = JSON.parse(line.slice('__RESULT__'.length)); }
        catch (e) { console.warn('Complexity JSON parse failed:', e.message); }
      }
    }
  } catch (e) {
    console.warn('Complexity detection failed:', e.message);
  }

  // ---------------------------------------------------------------
  // 1. Convert via LibreOffice with isolated profile
  // ---------------------------------------------------------------
  const loArgs = [
    `-env:UserInstallation=file://${userProfileDir}`,
    '--headless',
    '--invisible',
    '--nodefault',
    '--nofirststartwizard',
    '--nolockcheck',
    '--nologo',
    '--norestore',
    '--convert-to',
    'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"1"},"UseTaggedPDF":{"type":"boolean","value":"true"},"ExportNotes":{"type":"boolean","value":"false"}}',
    '--outdir',
    tempDir,
    conversionInputPath,
  ];

  await new Promise((resolve) => {
    const lo = spawn('soffice', loArgs);
    lo.on('close', () => resolve());
    lo.on('error', () => resolve());
  });

  const generatedPdfName = path.basename(conversionInputPath, path.extname(conversionInputPath)) + '.pdf';
  const generatedPdfPath = path.join(tempDir, generatedPdfName);

  if (!(await fs.stat(generatedPdfPath).catch(() => null))) {
    const fallbackBuffer = await libreConvert(fileBuffer, '.pdf', undefined);
    await fs.writeFile(generatedPdfPath, fallbackBuffer);
  }

  // ---------------------------------------------------------------
  // 2. Reconciliation (page count)
  // ---------------------------------------------------------------
  const pyReconcile = `
import sys
import os
import fitz
import docx

docx_file = sys.argv[1]
pdf_in = sys.argv[2]
pdf_out = sys.argv[3]

try:
    expected_pages = 0
    if docx_file.lower().endswith('.docx'):
        doc = docx.Document(docx_file)
        try:
            core_props = doc.core_properties
            if hasattr(core_props, 'pages') and core_props.pages:
                expected_pages = int(core_props.pages)
        except Exception:
            expected_pages = 0

        explicit_breaks = 1
        for p in doc.paragraphs:
            for r in p.runs:
                if 'w:br' in r._element.xml and 'type="page"' in r._element.xml:
                    explicit_breaks += 1
        for t in doc.tables:
            for r in t.rows:
                for c in r.cells:
                    for p in c.paragraphs:
                        for run in p.runs:
                            if 'w:br' in run._element.xml and 'type="page"' in run._element.xml:
                                explicit_breaks += 1

        expected_pages = max(expected_pages, explicit_breaks)

    pdf_doc = fitz.open(pdf_in)
    actual_pages = len(pdf_doc)

    if expected_pages > 0 and actual_pages > expected_pages:
        last_page = pdf_doc[-1]
        text_content = last_page.get_text().strip()
        drawings = last_page.get_drawings()
        images = last_page.get_images()

        if not text_content and len(drawings) == 0 and len(images) == 0:
            pdf_doc.delete_page(actual_pages - 1)

    pdf_doc.save(pdf_out, garbage=3, deflate=True)
    pdf_doc.close()
    sys.exit(0)
except Exception:
    import shutil
    shutil.copy(pdf_in, pdf_out)
    sys.exit(0)
`;

  try {
    await new Promise((resolve) => {
      const py = spawn('python3', ['-c', pyReconcile, conversionInputPath, generatedPdfPath, finalPdfPath]);
      py.on('close', () => resolve());
      py.on('error', () => resolve());
    });
  } catch {
    // Proceed with generated PDF if post-processor has issues
  }

  let outputTarget = (await fs.stat(finalPdfPath).catch(() => null))
    ? finalPdfPath
    : generatedPdfPath;

  // ---------------------------------------------------------------
  // 3. HIGH-FIDELITY MODE — rasterize the PDF
  // ---------------------------------------------------------------
  let usedHighFidelity = false;
  if (highFidelity) {
    try {
      const rasterizeScript = path.join(__dirname, 'rasterize_pdf.py');
      const ok = await new Promise((resolve) => {
        const py = spawn('python3', [rasterizeScript, outputTarget, rasterizedPath, '200', '88']);
        py.stderr.on('data', (d) => process.stderr.write(`[py-rasterize] ${d}`));
        py.on('close', (code) => resolve(code === 0));
        py.on('error', () => resolve(false));
      });
      if (ok && (await fs.stat(rasterizedPath).catch(() => null))) {
        outputTarget = rasterizedPath;
        usedHighFidelity = true;
      }
    } catch (e) {
      console.warn('Rasterization failed, using vector output:', e.message);
    }
  }

  const pdfBuffer = await fs.readFile(outputTarget);

  // ---------------------------------------------------------------
  // 4. POST-CONVERSION — Integrity check
  // ---------------------------------------------------------------
  let integrity = { valid: true, pageCount: 0, textExtractable: false };
  try {
    const validateScript = path.join(__dirname, 'validate_converted_pdf.py');
    const validateOutput = await new Promise((resolve) => {
      const py = spawn('python3', [validateScript, outputTarget]);
      let out = '';
      py.stdout.on('data', (d) => { out += d.toString(); });
      py.stderr.on('data', (d) => process.stderr.write(`[py-validate] ${d}`));
      py.on('close', () => resolve(out));
      py.on('error', () => resolve(''));
    });
    const line = validateOutput.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
    if (line) {
      try { integrity = JSON.parse(line.slice('__RESULT__'.length)); }
      catch (e) { console.warn('Validation JSON parse failed:', e.message); }
    }
  } catch (e) {
    console.warn('Validation step failed:', e.message);
  }

  // ---------------------------------------------------------------
  // 5. Cleanup
  // ---------------------------------------------------------------
  await fs.unlink(inputPath).catch(() => {});
  if (usePreprocessed) await fs.unlink(preprocessedPath).catch(() => {});
  await fs.unlink(generatedPdfPath).catch(() => {});
  await fs.unlink(finalPdfPath).catch(() => {});
  if (usedHighFidelity) await fs.unlink(rasterizedPath).catch(() => {});
  await fs.rm(userProfileDir, { recursive: true, force: true }).catch(() => {});

  return {
    buffer: pdfBuffer,
    audit: fontAudit,
    integrity,
    complexity,
    highFidelity: usedHighFidelity,
  };
}

// Word to PDF Route
app.post('/api/convert/word-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const buffer = req.file.buffer;
    const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    if (isOle) {
      const headerText = buffer.slice(0, 4096).toString('binary');
      if (headerText.includes('EncryptedPackage') || headerText.includes('EncryptionInfo')) {
        return res.status(400).json({
          error: `"${req.file.originalname}" is password-protected and cannot be converted.`,
          isLocked: true,
        });
      }
    }

    const highFidelity = req.body.highFidelity === 'true';
    const result = await convertDocxToPdf(buffer, req.file.originalname, { highFidelity });

    if (!result.integrity.valid) {
      return res.status(500).json({
        error: `Conversion produced an invalid PDF: ${result.integrity.error || 'unknown reason'}.`,
        integrityFailed: true,
      });
    }

    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');
    const missingFontsEncoded = encodeURIComponent(JSON.stringify(result.audit.missing || []));
    const usedFontsEncoded = encodeURIComponent(JSON.stringify(result.audit.fonts || []));
    const warningsEncoded = encodeURIComponent(JSON.stringify(result.complexity.warnings || []));
    const complexityFlagsEncoded = encodeURIComponent(JSON.stringify({
      hasCharts: Boolean(result.complexity.hasCharts),
      hasDiagrams: Boolean(result.complexity.hasDiagrams),
      hasOleObjects: Boolean(result.complexity.hasOleObjects),
      hasDrawingCanvas: Boolean(result.complexity.hasDrawingCanvas),
    }));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.pdf"`);
    res.setHeader('x-original-size', req.file.size.toString());
    res.setHeader('x-converted-size', result.buffer.length.toString());
    res.setHeader('x-page-count', String(result.integrity.pageCount || 0));
    res.setHeader('x-text-extractable', result.integrity.textExtractable ? '1' : '0');
    res.setHeader('x-missing-fonts', missingFontsEncoded);
    res.setHeader('x-used-fonts', usedFontsEncoded);
    res.setHeader('x-complexity-warnings', warningsEncoded);
    res.setHeader('x-complexity-flags', complexityFlagsEncoded);
    res.setHeader('x-high-fidelity', result.highFidelity ? '1' : '0');

    return res.send(result.buffer);
  } catch (error) {
    console.error('Word conversion failed:', error);
    return res.status(500).json({
      error: error.message || 'Failed to convert document with LibreOffice.',
    });
  }
});

// ---------------------------------------------------------
// PDF analysis for the PDF-to-Word tool.
// Runs the complexity detector without converting, so the studio can
// show a content-aware accuracy badge before the user commits.
// ---------------------------------------------------------
app.post('/api/analyze/pdf-for-word', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const tempId = `analyze_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_${req.file.originalname}`);

  try {
    await fs.writeFile(inputPath, req.file.buffer);

    const script = path.join(__dirname, 'detect_pdf_complexity.py');
    const output = await new Promise((resolve) => {
      const py = spawn('python3', [script, inputPath]);
      let buf = '';
      py.stdout.on('data', (d) => { buf += d.toString(); });
      py.stderr.on('data', (d) => process.stderr.write(`[py-pdf-complexity] ${d}`));
      py.on('close', () => resolve(buf));
      py.on('error', () => resolve(''));
    });

    const line = output.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
    let report = { accuracyTier: 'unknown', hasTextLayer: false, reasons: [] };
    if (line) {
      try { report = JSON.parse(line.slice('__RESULT__'.length)); }
      catch (e) { console.warn('PDF complexity parse failed:', e.message); }
    }

    return res.json(report);
  } catch (error) {
    console.error('PDF analysis failed:', error);
    return res.status(500).json({ error: 'Failed to analyze PDF.' });
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
});

// DOCX analysis route — returns font audit + complexity WITHOUT converting
app.post('/api/analyze/docx', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const tempId = `analyze_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_${req.file.originalname}`);

  try {
    await fs.writeFile(inputPath, req.file.buffer);

    // Run both detectors in parallel
    const [fontAudit, complexity] = await Promise.all([
      (async () => {
        try {
          const script = path.join(__dirname, 'audit_docx_fonts.py');
          const out = await new Promise((resolve) => {
            const py = spawn('python3', [script, inputPath]);
            let buf = '';
            py.stdout.on('data', (d) => { buf += d.toString(); });
            py.on('close', () => resolve(buf));
            py.on('error', () => resolve(''));
          });
          const line = out.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
          return line ? JSON.parse(line.slice('__RESULT__'.length)) : {};
        } catch { return {}; }
      })(),
      (async () => {
        try {
          const script = path.join(__dirname, 'detect_docx_complexity.py');
          const out = await new Promise((resolve) => {
            const py = spawn('python3', [script, inputPath]);
            let buf = '';
            py.stdout.on('data', (d) => { buf += d.toString(); });
            py.on('close', () => resolve(buf));
            py.on('error', () => resolve(''));
          });
          const line = out.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
          return line ? JSON.parse(line.slice('__RESULT__'.length)) : {};
        } catch { return {}; }
      })(),
    ]);

    return res.json({
      fonts: fontAudit.fonts || [],
      availableFonts: fontAudit.available || [],
      missingFonts: fontAudit.missing || [],
      hasCharts: Boolean(complexity.hasCharts),
      hasDiagrams: Boolean(complexity.hasDiagrams),
      hasOleObjects: Boolean(complexity.hasOleObjects),
      hasDrawingCanvas: Boolean(complexity.hasDrawingCanvas),
      chartCount: complexity.chartCount || 0,
      diagramCount: complexity.diagramCount || 0,
      oleCount: complexity.oleCount || 0,
      complexityWarnings: complexity.warnings || [],
    });
  } catch (error) {
    console.error('DOCX analysis failed:', error);
    return res.status(500).json({ error: 'Failed to analyze DOCX.' });
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
});

app.post('/api/convert/powerpoint-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const buffer = req.file.buffer;

    // Check for OLE EncryptedPackage header
    const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    if (isOle) {
      const headerText = buffer.slice(0, 4096).toString('binary');
      if (
        headerText.includes('EncryptedPackage') ||
        headerText.includes('EncryptionInfo') ||
        headerText.includes('PowerPoint Document')
      ) {
        return res.status(400).json({
          error: `"${req.file.originalname}" is password-protected and cannot be converted.`,
          isLocked: true,
        });
      }
    }

    const pdfBuffer = await libreConvert(buffer, '.pdf', undefined);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PowerPoint conversion failed:', error);
    return res.status(500).json({ error: 'Failed to convert presentation with LibreOffice.' });
  }
});

app.post('/api/convert/html-to-pdf', upload.single('file'), async (req, res) => {
  try {
    let htmlBuffer;

    if (req.file) {
      htmlBuffer = req.file.buffer;
    } else if (req.body && req.body.html) {
      htmlBuffer = Buffer.from(req.body.html, 'utf-8');
    } else {
      return res.status(400).json({ error: 'No HTML file or content provided.' });
    }

    const pdfBuffer = await libreConvert(htmlBuffer, '.pdf', undefined);
    const originalName = req.file
      ? req.file.originalname.replace(/\.[^/.]+$/, '')
      : 'rendered_html';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('HTML conversion failed:', error);
    return res.status(500).json({ error: 'Failed to convert HTML to PDF with LibreOffice.' });
  }
});

// 4. Excel to PDF
app.post('/api/convert/excel-to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const buffer = req.file.buffer;

    // Check for OLE EncryptedPackage header
    const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    if (isOle) {
      const headerText = buffer.slice(0, 4096).toString('binary');
      if (
        headerText.includes('EncryptedPackage') ||
        headerText.includes('EncryptionInfo') ||
        headerText.includes('Workbook')
      ) {
        return res.status(400).json({
          error: `"${req.file.originalname}" is password-protected and cannot be converted.`,
          isLocked: true,
        });
      }
    }

    const pdfBuffer = await libreConvert(buffer, '.pdf', undefined);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Excel conversion error:', error);
    return res.status(500).json({ error: 'Failed to convert Excel spreadsheet with LibreOffice.' });
  }
});

// ---------------------------------------------------------------------------
// Ghostscript PDF compression — Smart Compress (Condense-style)
//
// Preserves text as selectable, recompresses images at target DPI,
// subsets fonts, and removes metadata/thumbnails. This is what BentoPDF
// calls "Condense".
// ---------------------------------------------------------------------------
async function compressWithGhostscript(inputBuffer, options = {}) {
  const {
    dpi = 96,
    quality = 75,
    grayscale = false,
    removeMetadata = true,
    subsetFonts = true,
    removeThumbnails = true,
  } = options;

  const tempId = `compress_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_in.pdf`);
  const outputPath = path.join(tempDir, `${tempId}_out.pdf`);

  await fs.writeFile(inputPath, inputBuffer);

  const gsArgs = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    '-dSAFER',

    // ---- Image downsampling ----
    '-dDownsampleColorImages=true',
    `-dColorImageResolution=${dpi}`,
    `-dGrayImageResolution=${dpi}`,
    `-dMonoImageResolution=${Math.min(dpi * 2, 600)}`,
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dMonoImageDownsampleType=/Subsample',
    '-dColorImageDownsampleThreshold=1.0',
    '-dGrayImageDownsampleThreshold=1.0',
    '-dMonoImageDownsampleThreshold=1.0',

    // ---- JPEG encoding with user-selected quality ----
    '-dAutoFilterColorImages=false',
    '-dAutoFilterGrayImages=false',
    '-dColorImageFilter=/DCTEncode',
    '-dGrayImageFilter=/DCTEncode',
    '-dJPEGQ=' + quality,
    '-dEncodeColorImages=true',
    '-dEncodeGrayImages=true',

    // ---- Color space ----
    grayscale ? '-sColorConversionStrategy=Gray' : '-sColorConversionStrategy=RGB',
    '-dProcessColorModel=' + (grayscale ? '/DeviceGray' : '/DeviceRGB'),

    // ---- Structural optimizations ----
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    subsetFonts ? '-dSubsetFonts=true' : '-dSubsetFonts=false',
    '-dEmbedAllFonts=true',
    removeThumbnails ? '-dPreserveEmbeddedThumbnails=false' : '-dPreserveEmbeddedThumbnails=true',

    // ---- Metadata ----
    removeMetadata ? '-dPreserveMetadata=false' : '-dPreserveMetadata=true',
    '-dPreserveMarkedContent=true',
    '-dPreserveAnnots=true',
    '-dPreserveHalftoneInfo=false',

    `-sOutputFile=${outputPath}`,
    inputPath,
  ];

  return new Promise((resolve, reject) => {
    const gs = spawn('gs', gsArgs);
    let stderr = '';
    gs.stderr.on('data', (d) => { stderr += d.toString(); });

    gs.on('close', async (code) => {
      try {
        if (code === 0) {
          const out = await fs.readFile(outputPath);
          resolve(out);
        } else {
          reject(new Error(
            `Ghostscript compression failed (code ${code}). ${stderr.slice(0, 300)}`
          ));
        }
      } catch (err) {
        reject(err);
      } finally {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
      }
    });

    gs.on('error', (err) => reject(err));
  });
}


// ---------------------------------------------------------------------------
// PDF/A conversion helpers
// ---------------------------------------------------------------------------

/**
 * Locate an RGB ICC profile suitable for a PDF/A OutputIntent.
 * Returns the absolute path or null.
 */
async function findIccProfile() {
  const candidates = [
    '/usr/share/color/icc/ghostscript/srgb.icc',
    '/usr/share/color/icc/ghostscript/default_rgb.icc',
    '/usr/share/color/icc/sRGB.icc',
    '/usr/share/color/icc/srgb.icc',
    '/usr/share/color/icc/colord/sRGB.icc',
  ];

  // Also probe versioned Ghostscript dirs — ICC location varies by release.
  try {
    const gsRoot = '/usr/share/ghostscript';
    const entries = await fs.readdir(gsRoot).catch(() => []);
    for (const v of entries) {
      candidates.push(`/usr/share/ghostscript/${v}/iccprofiles/default_rgb.icc`);
      candidates.push(`/usr/share/ghostscript/${v}/iccprofiles/srgb.icc`);
      candidates.push(`/usr/share/ghostscript/${v}/iccprofiles/ps_rgb.icc`);
    }
  } catch { /* ignore */ }

  for (const p of candidates) {
    const st = await fs.stat(p).catch(() => null);
    if (st && st.isFile()) return p;
  }
  return null;
}

/**
 * Build the PostScript prelude that Ghostscript uses to declare an ICC
 * OutputIntent. Without this, PDF/A output will not pass strict validators.
 */
function buildPdfaDefPs(iccPath) {
  if (!iccPath) {
    // No ICC found: emit an empty prelude. Ghostscript will still produce
    // PDF/A with its built-in fallback, which passes looser validators.
    return '%!\n% PDFA_def.ps — no explicit ICC profile available\n';
  }

  return `%!
/ICCProfile (${iccPath}) def

[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} << /N 3 >> /PUT pdfmark
[{icc_PDFA} ICCProfile (r) file /PUT pdfmark

[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} <<
  /Type /OutputIntent
  /S /GTS_PDFA1
  /DestOutputProfile {icc_PDFA}
  /OutputConditionIdentifier (sRGB IEC61966-2.1)
  /RegistryName (http://www.color.org)
>> /PUT pdfmark

[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark
`;
}

/**
 * Run Ghostscript to convert an input PDF buffer to PDF/A.
 * Supported levels: '1' (1b), '2' (2b), '3' (3b).
 */
async function convertToPdfA(inputBuffer, options = {}) {
  const {
    level = '2',
    colorStrategy = 'UseDeviceIndependentColor',
  } = options;

  const safeLevel = ['1', '2', '3'].includes(String(level)) ? String(level) : '2';

  const tempId = `pdfa_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_in.pdf`);
  const outputPath = path.join(tempDir, `${tempId}_out.pdf`);
  const pdfaDefPath = path.join(tempDir, `${tempId}_pdfa_def.ps`);

  await fs.writeFile(inputPath, inputBuffer);

  const iccPath = await findIccProfile();
  const pdfaDef = buildPdfaDefPs(iccPath);
  await fs.writeFile(pdfaDefPath, pdfaDef);

  const gsArgs = [
    `-dPDFA=${safeLevel}`,
    '-dBATCH',
    '-dNOPAUSE',
    '-dQUIET',
    '-dSAFER',
    `-sColorConversionStrategy=${colorStrategy}`,
    '-dPDFACompatibilityPolicy=1',   // warn + continue instead of aborting
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
    '-dCompressFonts=true',
    '-dAutoRotatePages=/None',
    '-sDEVICE=pdfwrite',
    `-sOutputFile=${outputPath}`,
    pdfaDefPath,
    inputPath,
  ];

  return new Promise((resolve, reject) => {
    const gs = spawn('gs', gsArgs);
    let stderr = '';
    gs.stderr.on('data', (d) => { stderr += d.toString(); });

    gs.on('close', async (code) => {
      try {
        if (code === 0) {
          const out = await fs.readFile(outputPath);
          resolve(out);
        } else {
          reject(new Error(
            `Ghostscript PDF/A conversion failed (code ${code}). ${stderr.trim().slice(0, 400)}`
          ));
        }
      } catch (err) {
        reject(err);
      } finally {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
        await fs.unlink(pdfaDefPath).catch(() => {});
      }
    });

    gs.on('error', (err) => reject(err));
  });
}


// PDF to PDF/A — ISO 19005 archival format
app.post('/api/convert/pdf-to-pdfa', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    const options = {
      level: req.body.level || '2',
      conformance: req.body.conformance || 'b',
      colorStrategy: req.body.colorStrategy || 'UseDeviceIndependentColor',
      title: req.body.title || '',
      author: req.body.author || '',
      subject: req.body.subject || '',
      keywords: req.body.keywords || '',
    };

    const pdfaBuffer = await convertToPdfA(req.file.buffer, options);

    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');
    const levelLabel = `${options.level}${String(options.conformance).toLowerCase()}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${originalName}_PDFA-${levelLabel}.pdf"`
    );
    res.setHeader('x-original-size', req.file.buffer.length.toString());
    res.setHeader('x-pdfa-size', pdfaBuffer.length.toString());

    return res.send(pdfaBuffer);
  } catch (error) {
    console.error('PDF/A conversion failed:', error);
    return res.status(500).json({
      error: error.message || 'Failed to convert PDF to PDF/A.',
    });
  }
});
                                                                                                                       
// 5. Compress PDF Endpoint
// ---------------------------------------------------------------------------
// Compress PDF — two algorithms, monotonic guarantee
// ---------------------------------------------------------------------------
app.post('/api/compress-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const algorithm = req.body.algorithm || 'condense';   // 'condense' | 'photon'
  const dpi = parseInt(req.body.dpi || '96', 10);
  const quality = parseInt(req.body.quality || '75', 10);
  const grayscale = req.body.grayscale === 'true';
  const removeMetadata = req.body.removeMetadata !== 'false';
  const subsetFonts = req.body.subsetFonts !== 'false';
  const removeThumbnails = req.body.removeThumbnails !== 'false';

  const originalBuffer = req.file.buffer;
  const originalSize = originalBuffer.length;

  try {
    let compressedBuffer;

    if (algorithm === 'photon') {
      // ---- Deep Compress: rasterize via PyMuPDF ----
      const tempId = `deep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const tempDir = path.join(os.tmpdir(), tempId);
      const inputPath = path.join(tempDir, 'input.pdf');
      const outputPath = path.join(tempDir, 'output.pdf');
      const payloadPath = path.join(tempDir, 'payload.json');
      const pyScript = path.join(__dirname, 'convert_compress_pdf.py');

      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(inputPath, originalBuffer);
      await fs.writeFile(payloadPath, JSON.stringify({
        dpi, quality, grayscale, removeMetadata,
      }), 'utf-8');

      await new Promise((resolve, reject) => {
        const py = spawn('python3', [pyScript, inputPath, outputPath, payloadPath]);
        let stderr = '';
        py.stderr.on('data', (d) => {
          const s = d.toString();
          stderr += s;
          process.stderr.write(`[py-compress] ${s}`);
        });
        py.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Deep compression failed (code ${code}): ${stderr.slice(0, 300)}`));
        });
        py.on('error', (err) => reject(err));
      });

      compressedBuffer = await fs.readFile(outputPath);
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    } else {
      // ---- Smart Compress: Ghostscript ----
      compressedBuffer = await compressWithGhostscript(originalBuffer, {
        dpi, quality, grayscale, removeMetadata, subsetFonts, removeThumbnails,
      });
    }

    // ---- Monotonic guarantee: never return a larger file ----
    const finalBuffer = compressedBuffer.length < originalSize
      ? compressedBuffer
      : originalBuffer;

    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}_compressed.pdf"`);
    res.setHeader('x-original-size', originalSize.toString());
    res.setHeader('x-compressed-size', finalBuffer.length.toString());
    res.setHeader('x-algorithm', algorithm);
    res.setHeader('x-was-compressed', compressedBuffer.length < originalSize ? '1' : '0');

    return res.send(finalBuffer);
  } catch (error) {
    console.error('PDF compression error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to compress PDF.',
    });
  }
});

// PDF to Word (.docx) route
app.post('/api/convert/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const tempId = `pdf2docx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = path.join(os.tmpdir(), tempId);
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const outputDocxPath = path.join(tempDir, 'output.docx');
  const pythonScriptPath = path.join(__dirname, 'convert_pdf2docx.py');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPdfPath, req.file.buffer);

    let stdout = '';
    let stderr = '';

    const exitCode = await new Promise((resolve) => {
      const py = spawn('python3', [pythonScriptPath, inputPdfPath, outputDocxPath]);
      py.stdout.on('data', (d) => { stdout += d.toString(); });
      py.stderr.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        process.stderr.write(`[py-pdf2docx] ${s}`);
      });
      py.on('close', (code) => resolve(code));
      py.on('error', () => resolve(-1));
    });

    // Parse the marker line
    let report = { success: false, engine: null, enhanced: false, sizeBytes: 0 };
    const line = stdout.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
    if (line) {
      try { report = JSON.parse(line.slice('__RESULT__'.length)); }
      catch (e) { console.warn('PDF→DOCX result parse failed:', e.message); }
    }

    if (exitCode !== 0 || !report.success) {
      return res.status(500).json({
        error: 'Failed to convert this PDF to Word. Both the primary and fallback engines were unable to produce a valid DOCX.',
      });
    }

    const docxBuffer = await fs.readFile(outputDocxPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.docx"`);
    res.setHeader('x-original-size', req.file.size.toString());
    res.setHeader('x-converted-size', docxBuffer.length.toString());
    res.setHeader('x-conversion-engine', report.engine || 'unknown');
    res.setHeader('x-conversion-enhanced', report.enhanced ? '1' : '0');

    return res.send(docxBuffer);
  } catch (error) {
    console.error('PDF to DOCX conversion error:', error);
    return res.status(500).json({ error: 'Failed to convert PDF to Word document.' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// PDF to PowerPoint (.pptx) — image mode or text mode
app.post('/api/convert/pdf-to-powerpoint', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const tempId = `pdf2ppt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = path.join(os.tmpdir(), tempId);
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const outputPptxPath = path.join(tempDir, 'output.pptx');
  const payloadPath = path.join(tempDir, 'payload.json');
  const pythonScriptPath = path.join(__dirname, 'convert_pdf2pptx.py');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPdfPath, req.file.buffer);

    const mode = req.body.mode === 'text' ? 'text' : 'image';
    const options = {
      mode,
      dpi: parseInt(req.body.dpi || '150', 10),
      quality: parseInt(req.body.quality || '85', 10),
      minFontSize: parseFloat(req.body.minFontSize || '4'),
      minBlockArea: parseFloat(req.body.minBlockArea || '20'),
    };
    await fs.writeFile(payloadPath, JSON.stringify(options), 'utf-8');

    let stdout = '';
    let stderr = '';

    const exitCode = await new Promise((resolve) => {
      const py = spawn('python3', [
        pythonScriptPath,
        inputPdfPath,
        outputPptxPath,
        payloadPath,
      ]);
      py.stdout.on('data', (d) => { stdout += d.toString(); });
      py.stderr.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        process.stderr.write(`[py-pdf2ppt] ${s}`);
      });
      py.on('close', (code) => resolve(code));
      py.on('error', () => resolve(-1));
    });

    let report = { success: false };
    const line = stdout.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
    if (line) {
      try { report = JSON.parse(line.slice('__RESULT__'.length)); }
      catch (e) { console.warn('PPTX result parse failed:', e.message); }
    }

    if (exitCode !== 0 || !report.success) {
      return res.status(500).json({
        error: 'Failed to convert PDF to PowerPoint. The PDF may be corrupted or use an unsupported layout.',
      });
    }

    const pptxBuffer = await fs.readFile(outputPptxPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.pptx"`);
    res.setHeader('x-original-size', req.file.size.toString());
    res.setHeader('x-converted-size', pptxBuffer.length.toString());
    res.setHeader('x-ppt-mode', report.mode || 'image');
    res.setHeader('x-slide-count', String(report.slides || 0));
    res.setHeader('x-text-boxes', String(report.textBoxes || 0));
    res.setHeader('x-image-count', String(report.images || 0));

    return res.send(pptxBuffer);
  } catch (error) {
    console.error('PDF to PowerPoint conversion error:', error);
    return res.status(500).json({ error: 'Failed to convert PDF to PowerPoint presentation.' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// PDF to Excel (.xlsx) using the rewritten high-fidelity engine
app.post('/api/convert/pdf-to-excel', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const tempId = `pdf2excel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = path.join(os.tmpdir(), tempId);
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const outputXlsxPath = path.join(tempDir, 'output.xlsx');
  const payloadPath = path.join(tempDir, 'payload.json');
  const pythonScriptPath = path.join(__dirname, 'convert_pdf2excel.py');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPdfPath, req.file.buffer);

    const mode = ['tables', 'mixed', 'text'].includes(req.body.mode)
      ? req.body.mode
      : 'tables';
    await fs.writeFile(
      payloadPath,
      JSON.stringify({ mode }),
      'utf-8'
    );

    let stdout = '';
    let stderr = '';

    const exitCode = await new Promise((resolve) => {
      const py = spawn('python3', [
        pythonScriptPath,
        inputPdfPath,
        outputXlsxPath,
        payloadPath,
      ]);
      py.stdout.on('data', (d) => { stdout += d.toString(); });
      py.stderr.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        process.stderr.write(`[py-pdf2excel] ${s}`);
      });
      py.on('close', (code) => resolve(code));
      py.on('error', () => resolve(-1));
    });

    let report = { success: false };
    const line = stdout.split('\n').reverse().find((l) => l.startsWith('__RESULT__'));
    if (line) {
      try { report = JSON.parse(line.slice('__RESULT__'.length)); }
      catch (e) { console.warn('XLSX result parse failed:', e.message); }
    }

    if (exitCode !== 0 || !report.success) {
      return res.status(500).json({
        error: 'Failed to convert PDF to Excel. The PDF may not contain extractable tables.',
      });
    }

    const xlsxBuffer = await fs.readFile(outputXlsxPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.xlsx"`);
    res.setHeader('x-original-size', req.file.size.toString());
    res.setHeader('x-converted-size', xlsxBuffer.length.toString());
    res.setHeader('x-excel-mode', report.mode || 'tables');
    res.setHeader('x-table-count', String(report.tables || 0));
    res.setHeader('x-row-count', String(report.rows || 0));
    res.setHeader('x-sheet-count', String(report.sheets || 0));

    return res.send(xlsxBuffer);
  } catch (error) {
    console.error('PDF to Excel conversion error:', error);
    return res.status(500).json({ error: 'Failed to convert PDF to Excel spreadsheet.' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// Protect PDF with Password
app.post('/api/protect-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const password = req.body.password;
  if (!password) {
    return res.status(400).json({ error: 'Password is required to protect the PDF.' });
  }

  const tempId = `protect_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_in.pdf`);
  const outputPath = path.join(tempDir, `${tempId}_protected.pdf`);

  try {
    await fs.writeFile(inputPath, req.file.buffer);

    // Ghostscript password protection arguments
    const gsArgs = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-sOwnerPassword=${password}`,
      `-sUserPassword=${password}`,
      '-dEncryptionR=3',
      '-dKeyLength=128',
      '-dPermissions=-4',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    await new Promise((resolve, reject) => {
      const gs = spawn('gs', gsArgs);
      let stderr = '';
      gs.stderr.on('data', (d) => (stderr += d.toString()));
      gs.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Ghostscript protection failed: ${stderr}`));
      });
      gs.on('error', (err) => reject(err));
    });

    const protectedBuffer = await fs.readFile(outputPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}_protected.pdf"`);
    return res.send(protectedBuffer);
  } catch (error) {
    console.error('PDF Protect error:', error);
    return res.status(500).json({ error: 'Failed to apply password protection.' });
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
});

// Multi-Tier PDF Unlock Engine
app.post('/api/unlock-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const mode = req.body.mode || 'with-password';
  const password = req.body.password || '';

  const tempId = `unlock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_locked.pdf`);
  const outputPath = path.join(tempDir, `${tempId}_unlocked.pdf`);

  try {
    await fs.writeFile(inputPath, req.file.buffer);

    const pyScript = `
import sys
import os
import fitz
import pikepdf

input_path = sys.argv[1]
output_path = sys.argv[2]
mode = sys.argv[3]
user_password = sys.argv[4] if len(sys.argv) > 4 else ""

# Tier 1: If user provided a password, authenticate directly
if mode == "with-password":
    try:
        with pikepdf.open(input_path, password=user_password) as pdf:
            pdf.save(output_path)
            sys.exit(0)
    except pikepdf.PasswordError:
        sys.stderr.write("Incorrect password. Please verify and try again.\\n")
        sys.exit(1)
    except Exception as e:
        sys.stderr.write(f"Decryption error: {str(e)}\\n")
        sys.exit(1)

# Tier 2: Automatic Mode (No password supplied)
# 2A: Owner Password / Permissions Only (Empty string open key)
unlocked = False
try:
    with pikepdf.open(input_path, password="") as pdf:
        pdf.save(output_path)
        unlocked = True
except Exception:
    unlocked = False

# 2B: Fast Pattern & Common Default Dictionary Check
if not unlocked:
    common_defaults = [
        "1234", "0000", "123456", "1111", "password", "admin", "12345678",
        "pass", "test", "default", "9999", "owner", "user", "root", "pdf",
        "123", "2024", "2025", "2026"
    ]
    # Check 4-digit zero-padded numbers from 0000 to 9999 in steps
    for trial in common_defaults:
        try:
            with pikepdf.open(input_path, password=trial) as pdf:
                pdf.save(output_path)
                unlocked = True
                break
        except Exception:
            continue

# 2C: PyMuPDF Fallback Stream Cleaner
if not unlocked:
    try:
        doc = fitz.open(input_path)
        if doc.is_encrypted:
            if doc.authenticate(""):
                doc.save(output_path, encryption=fitz.PDF_ENCRYPT_NONE, deflate=True, garbage=3, clean=True)
                unlocked = True
        doc.close()
    except Exception:
        unlocked = False

# Tier 3: Strong AES User Password Encountered
if not unlocked or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
    sys.stderr.write("STRONG_ENCRYPTION_DETECTED: This PDF is protected with a strong User-Open password. Please switch to 'I have the password' to enter the key.\\n")
    sys.exit(2)

sys.exit(0)
`;

    await new Promise((resolve, reject) => {
      const py = spawn('python3', ['-c', pyScript, inputPath, outputPath, mode, password]);
      let stderr = '';
      py.stderr.on('data', (d) => (stderr += d.toString()));
      py.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else if (code === 2) {
          reject(new Error("This file has a strong User Open Password. Please select 'I have the password' and enter the password to decrypt it."));
        } else {
          reject(new Error(stderr.trim() || 'Failed to unlock PDF.'));
        }
      });
      py.on('error', (err) => reject(err));
    });

    const unlockedBuffer = await fs.readFile(outputPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}_unlocked.pdf"`);
    return res.send(unlockedBuffer);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to unlock PDF.' });
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
});

/**
 * Executes a PDF crop operation using Ghostscript.
 * It maps normalized client coordinates to page dimensions.
 */
async function executeGhostscriptCrop(inputBuffer, cropParams, originalFilename) {
  const tempId = `crop_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${tempId}_in.pdf`);
  const outputPath = path.join(tempDir, `${tempId}_cropped.pdf`);

  await fs.writeFile(inputPath, inputBuffer);

  // cropParams: { pages, xPercent, yPercent, widthPercent, heightPercent }
  const { pages, x, y, width, height } = cropParams;

  const gsArgs = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    `-sOutputFile=${outputPath}`,
    '-q', // quiet mode
    '-dBATCH',
    '-dNOPAUSE',
    `-dFirstPage=${pages === 'current' ? cropParams.currentPageNumber : 1}`,
    `-dLastPage=${pages === 'current' ? cropParams.currentPageNumber : 9999}`,
    '-c',
    // Custom postscript to set the new CropBox/MediaBox for selected pages
    '[',
    '/pdfmark',
    `{ { ${x} 100 div PageWidth mul } { ${y} 100 div PageHeight mul } { ${width} 100 div PageWidth mul } { ${height} 100 div PageHeight mul } }`,
    '/SetPDFcrop',
    ']',
    '/pdfmark',
    '-f',
    inputPath,
  ];

  return new Promise((resolve, reject) => {
    const gs = spawn('gs', gsArgs);
    let stderr = '';
    gs.stderr.on('data', (d) => (stderr += d.toString()));

    gs.on('close', async (code) => {
      try {
        if (code === 0) {
          const croppedBuffer = await fs.readFile(outputPath);
          resolve(croppedBuffer);
        } else {
          reject(new Error(`Ghostscript protection failed: ${stderr}`));
        }
      } catch (err) {
        reject(err);
      } finally {
        // Cleanup temp files immediately
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
      }
    });

    gs.on('error', (err) => {
      reject(err);
    });
  });
}

// ---------------------------------------------------------
// New Route: Crop PDF
// ---------------------------------------------------------
app.post('/api/crop-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    // Parse the crop parameters from the multipart request
    const cropParams = JSON.parse(req.body.cropParams);

    // cropParams structure: { pages: 'all'|'current', currentPageNumber: number, x: percent, y: percent, width: percent, height: percent }

    const inputBuffer = req.file.buffer;
    const croppedBuffer = await executeGhostscriptCrop(
      inputBuffer,
      cropParams,
      req.file.originalname
    );

    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cropped_${originalName}.pdf"`);
    res.setHeader('x-original-size', inputBuffer.length.toString());
    res.setHeader('x-compressed-size', croppedBuffer.length.toString());

    return res.send(croppedBuffer);
  } catch (error) {
    console.error('Ghostscript compression error:', error);
    return res.status(500).json({ error: 'Failed to compress PDF.' });
  }
});

// PDF to Markdown (.md) conversion route using PyMuPDF & table extraction
app.post('/api/convert/pdf-to-markdown', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const tempId = `pdf2md_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = path.join(os.tmpdir(), tempId);
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const outputMdPath = path.join(tempDir, 'output.md');
  const pythonScriptPath = path.join(__dirname, 'convert_pdf2md.py');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPdfPath, req.file.buffer);

    await new Promise((resolve, reject) => {
      const py = spawn('python3', [pythonScriptPath, inputPdfPath, outputMdPath]);

      let stderr = '';
      py.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      py.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`convert_pdf2md failed with code ${code}: ${stderr}`));
        }
      });

      py.on('error', (err) => reject(err));
    });

    const mdBuffer = await fs.readFile(outputMdPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}.md"`);
    return res.send(mdBuffer);
  } catch (error) {
    console.error('PDF to Markdown conversion error:', error);
    return res.status(500).json({ error: 'Failed to convert PDF to Markdown.' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ---------------------------------------------------------
// Edit PDF (in-place span edits + new text/shape additions)
// ---------------------------------------------------------
app.post('/api/edit-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const tempId = `edit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = path.join(os.tmpdir(), tempId);
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const outputPdfPath = path.join(tempDir, 'output.pdf');
  const editsPath = path.join(tempDir, 'edits.json');
  const additionsPath = path.join(tempDir, 'additions.json');
  const pythonScriptPath = path.join(__dirname, 'convert_edit_pdf.py');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPdfPath, req.file.buffer);

    let edits = [];
    let additions = [];
    try { edits = JSON.parse(req.body.edits || '[]'); } catch { /* ignore */ }
    try { additions = JSON.parse(req.body.additions || '[]'); } catch { /* ignore */ }

    if (
      (!Array.isArray(edits) || edits.length === 0) &&
      (!Array.isArray(additions) || additions.length === 0)
    ) {
      return res.status(400).json({ error: 'No edits or additions provided.' });
    }

    await fs.writeFile(editsPath, JSON.stringify(edits), 'utf-8');
    await fs.writeFile(additionsPath, JSON.stringify(additions), 'utf-8');

        await new Promise((resolve, reject) => {
      const py = spawn('python3', [
        pythonScriptPath,
        inputPdfPath,
        outputPdfPath,
        editsPath,
        additionsPath,
      ]);
      let stderr = '';
      py.stdout.on('data', (d) => process.stdout.write(`[py-edit] ${d}`));
      py.stderr.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        process.stderr.write(`[py-edit] ${s}`);
      });
      py.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`edit_pdf failed (code ${code}): ${stderr}`));
      });
      py.on('error', (err) => reject(err));
    });

    const pdfBuffer = await fs.readFile(outputPdfPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}_edited.pdf"`);
    res.setHeader('x-original-size', req.file.size.toString());
    res.setHeader('x-edited-size', pdfBuffer.length.toString());
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF text edit error:', error);
    return res.status(500).json({ error: error.message || 'Failed to edit PDF.' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ---------------------------------------------------------
// Redact PDF — true content-stream removal via PyMuPDF
// ---------------------------------------------------------
app.post('/api/redact-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const tempId = `redact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = path.join(os.tmpdir(), tempId);
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const outputPdfPath = path.join(tempDir, 'output.pdf');
  const payloadPath = path.join(tempDir, 'payload.json');
  const pythonScriptPath = path.join(__dirname, 'convert_redact_pdf.py');

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPdfPath, req.file.buffer);

    let payload = { options: {}, redactions: [] };
    try {
      payload = JSON.parse(req.body.payload || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid redaction payload.' });
    }

    const redactions = Array.isArray(payload.redactions) ? payload.redactions : [];
    if (redactions.length === 0) {
      return res.status(400).json({ error: 'No redaction rectangles provided.' });
    }

    await fs.writeFile(payloadPath, JSON.stringify(payload), 'utf-8');

    await new Promise((resolve, reject) => {
      const py = spawn('python3', [
        pythonScriptPath,
        inputPdfPath,
        outputPdfPath,
        payloadPath,
      ]);
      let stderr = '';
      py.stdout.on('data', (d) => process.stdout.write(`[py-redact] ${d}`));
      py.stderr.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        process.stderr.write(`[py-redact] ${s}`);
      });
      py.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`redact_pdf failed (code ${code}): ${stderr.slice(0, 500)}`));
      });
      py.on('error', (err) => reject(err));
    });

    const pdfBuffer = await fs.readFile(outputPdfPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}_redacted.pdf"`);
    res.setHeader('x-original-size', req.file.size.toString());
    res.setHeader('x-redacted-size', pdfBuffer.length.toString());
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF redaction error:', error);
    return res.status(500).json({ error: error.message || 'Failed to redact PDF.' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ---------------------------------------------------------
// Repair PDF — multi-tier recovery via Ghostscript, PyMuPDF, pikepdf
// ---------------------------------------------------------
app.post('/api/repair-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  const tempId = `repair_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tempDir = path.join(os.tmpdir(), tempId);
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const outputPdfPath = path.join(tempDir, 'output.pdf');
  const payloadPath = path.join(tempDir, 'payload.json');
  const pythonScriptPath = path.join(__dirname, 'convert_repair_pdf.py');

  const originalSize = req.file.buffer.length;
  const originalPages = parseInt(req.body.originalPages || '0', 10) || 0;

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPdfPath, req.file.buffer);
    await fs.writeFile(payloadPath, JSON.stringify({ originalPages }), 'utf-8');

    let stdout = '';
    let stderr = '';

    const exitCode = await new Promise((resolve) => {
      const py = spawn('python3', [
        pythonScriptPath,
        inputPdfPath,
        outputPdfPath,
        payloadPath,
      ]);
      py.stdout.on('data', (d) => {
        stdout += d.toString();
        process.stdout.write(`[py-repair] ${d}`);
      });
      py.stderr.on('data', (d) => {
        stderr += d.toString();
        process.stderr.write(`[py-repair] ${d}`);
      });
      py.on('close', (code) => resolve(code));
      py.on('error', () => resolve(-1));
    });

    // Parse the JSON result block emitted by the Python script
    let report = null;
    try {
      const lines = stdout.trim().split('\n');
      const last = lines[lines.length - 1];
      report = JSON.parse(last);
    } catch {
      report = { success: false, engine: null, pages: 0, originalPages };
    }

    if (exitCode !== 0 || !report.success) {
      return res.status(422).json({
        error: 'Unable to repair this PDF. It may be too heavily corrupted, or the content data has been lost.',
        isUnrepairable: true,
        engine: report.engine,
        originalPages: report.originalPages,
      });
    }

    const repairedBuffer = await fs.readFile(outputPdfPath);
    const originalName = req.file.originalname.replace(/\.[^/.]+$/, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}_repaired.pdf"`);
    res.setHeader('x-original-size', originalSize.toString());
    res.setHeader('x-repaired-size', repairedBuffer.length.toString());
    res.setHeader('x-repair-engine', report.engine || 'unknown');
    res.setHeader('x-original-pages', String(report.originalPages || 0));
    res.setHeader('x-repaired-pages', String(report.pages || 0));

    return res.send(repairedBuffer);
  } catch (error) {
    console.error('PDF repair error:', error);
    return res.status(500).json({ error: error.message || 'Failed to repair PDF.' });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Conversion server running on port ${PORT}`);
});