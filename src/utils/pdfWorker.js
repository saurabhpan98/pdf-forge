import { PDFDocument, degrees, rgb, StandardFonts, PDFOperator, PDFNumber, PDFName, PDFString } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { createWorker } from 'tesseract.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Accurately check if a PDF is password-protected or encrypted.
 */
export async function checkPdfPassword(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0)),
        stopAtErrors: false
      });
      const doc = await loadingTask.promise;
      await doc.getPage(1);
      return false;
    } catch (pdfErr) {
      if (
        pdfErr.name === 'PasswordException' ||
        pdfErr.message?.toLowerCase().includes('password') ||
        pdfErr.code === 1
      ) {
        return true;
      }
    }

    try {
      await PDFDocument.load(arrayBuffer, { ignoreEncryption: false });
      return false;
    } catch (err) {
      const msg = err.message?.toLowerCase() || '';
      if (msg.includes('encrypt') || msg.includes('password') || msg.includes('protected')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function compressPDF(file, compressionLevel = 45) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('compressionPercent', compressionLevel.toString());

  const response = await fetch(`${API_BASE_URL}/api/compress-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Server failed to compress PDF.');
  }

  const pdfBlob = await response.blob();
  const originalSizeHeader = response.headers.get('x-original-size');
  const compressedSizeHeader = response.headers.get('x-compressed-size');

  const origSize = originalSizeHeader ? parseInt(originalSizeHeader, 10) : file.size;
  const compSize = compressedSizeHeader ? parseInt(compressedSizeHeader, 10) : pdfBlob.size;

  return {
    blob: pdfBlob,
    filename: `compressed_${file.name}`,
    originalSize: origSize,
    compressedSize: compSize,
  };
}

export async function renderPdfThumbnails(file) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const thumbnails = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.35 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbnails.push({
      id: `page-${i}-${Date.now()}-${Math.random()}`,
      originalIndex: i - 1,
      pageNumber: i,
      rotation: 0,
      dataUrl: canvas.toDataURL('image/jpeg', 0.8)
    });
  }

  return { totalPages: numPages, thumbnails };
}

export async function renderSinglePdfPage(file, pageNum = 1, scale = 1.6, hideAnnotations = false) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const targetPageNum = Math.max(1, Math.min(pageNum, totalPages));

  const page = await pdf.getPage(targetPageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  const renderContext = {
    canvasContext: ctx,
    viewport,
    annotationMode: hideAnnotations ? pdfjsLib.AnnotationMode.DISABLE : pdfjsLib.AnnotationMode.ENABLE,
  };

  await page.render(renderContext).promise;

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.95),
    width: viewport.width,
    height: viewport.height,
    totalPages
  };
}

export async function reorganizePDF(file, pageItems) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  if (!pageItems || pageItems.length === 0) {
    throw new Error('At least one page must remain in the document.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const originalPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const newPdf = await PDFDocument.create();

  const indices = pageItems.map((item) => item.originalIndex);
  const copiedPages = await newPdf.copyPages(originalPdf, indices);

  copiedPages.forEach((page, i) => {
    const customRotation = pageItems[i].rotation || 0;
    if (customRotation !== 0) {
      const currentRot = page.getRotation().angle;
      page.setRotation(degrees((currentRot + customRotation) % 360));
    }
    newPdf.addPage(page);
  });

  const bytes = await newPdf.save();
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: `organized_${file.name}`
  };
}

export async function extractPagesFromPDF(file, pagesToExtractSet) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  if (pagesToExtractSet.size === 0) {
    throw new Error('Please select at least one page to extract.');
  }

  const newPdf = await PDFDocument.create();
  const sortedPages = Array.from(pagesToExtractSet)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b)
    .map((p) => p - 1);

  const copiedPages = await newPdf.copyPages(pdfDoc, sortedPages);
  copiedPages.forEach((page) => newPdf.addPage(page));

  const bytes = await newPdf.save();
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: `extracted_${file.name}`
  };
}

export async function removePagesFromPDF(file, pagesToRemoveSet) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  if (pagesToRemoveSet.size >= totalPages) {
    throw new Error('You cannot remove all pages from the document.');
  }

  const newPdf = await PDFDocument.create();
  const pagesToKeepIndices = [];

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1;
    if (!pagesToRemoveSet.has(pageNum)) {
      pagesToKeepIndices.push(i);
    }
  }

  const copiedPages = await newPdf.copyPages(pdfDoc, pagesToKeepIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));

  const bytes = await newPdf.save();
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: `edited_${file.name}`
  };
}

async function loadPdfSafely(file) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  return await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
}

async function loadPdfJsSafely(file) {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    return await loadingTask.promise;
  } catch (err) {
    if (err.name === 'PasswordException' || err.message?.toLowerCase().includes('password')) {
      const lockErr = new Error(`"${file.name}" is password-protected and cannot be processed.`);
      lockErr.lockedFiles = [file.name];
      throw lockErr;
    }
    throw err;
  }
}

export async function mergePDFs(fileList) {
  const lockedFiles = [];

  for (const file of fileList) {
    const isLocked = await checkPdfPassword(file);
    if (isLocked) {
      lockedFiles.push(file.name);
    }
  }

  if (lockedFiles.length > 0) {
    const err = new Error('Password-protected files detected.');
    err.lockedFiles = lockedFiles;
    throw err;
  }

  const mergedPdf = await PDFDocument.create();

  for (const file of fileList) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const bytes = await mergedPdf.save();
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: 'merged_document.pdf'
  };
}

export async function splitPDF(file) {
  const pdfDoc = await loadPdfSafely(file);
  const totalPages = pdfDoc.getPageCount();
  const zip = new JSZip();

  for (let i = 0; i < totalPages; i++) {
    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(pdfDoc, [i]);
    singleDoc.addPage(copiedPage);
    const singleBytes = await singleDoc.save();
    zip.file(`page_${i + 1}.pdf`, singleBytes);
  }

  const zipContent = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipContent,
    filename: `${file.name.replace(/\.[^/.]+$/, '')}_pages.zip`
  };
}

export async function imagesToPDF(imageItems, options = {}) {
  const {
    orientation = 'portrait',
    pageSize = 'a4',
    margin = 'none',
    mergeAll = true,
  } = options;

  let marginPt = 0;
  if (margin === 'small') marginPt = 18;
  if (margin === 'big') marginPt = 36;

  const PAGE_SIZES = {
    a4: { width: 595.28, height: 841.89 },
    letter: { width: 612.0, height: 792.0 },
  };

  const createSinglePagePdf = async (item) => {
    const doc = await PDFDocument.create();
    const file = item.file || item;
    const customRotation = item.rotation || 0;
    const imgBytes = await file.arrayBuffer();

    let embeddedImg;
    if (file.type.includes('png') || file.name.toLowerCase().endsWith('.png')) {
      embeddedImg = await doc.embedPng(imgBytes);
    } else {
      embeddedImg = await doc.embedJpg(imgBytes);
    }

    if (!embeddedImg) return null;

    let pageWidth, pageHeight;

    if (pageSize === 'fit') {
      pageWidth = embeddedImg.width + marginPt * 2;
      pageHeight = embeddedImg.height + marginPt * 2;
      if (orientation === 'landscape' && pageHeight > pageWidth) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }
    } else {
      const base = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
      if (orientation === 'landscape') {
        pageWidth = Math.max(base.width, base.height);
        pageHeight = Math.min(base.width, base.height);
      } else {
        pageWidth = Math.min(base.width, base.height);
        pageHeight = Math.max(base.width, base.height);
      }
    }

    const page = doc.addPage([pageWidth, pageHeight]);

    if (customRotation !== 0) {
      page.setRotation(degrees(customRotation));
    }

    const availableWidth = pageWidth - marginPt * 2;
    const availableHeight = pageHeight - marginPt * 2;
    const scale = Math.min(
      availableWidth / embeddedImg.width,
      availableHeight / embeddedImg.height,
      1
    );

    const drawWidth = embeddedImg.width * scale;
    const drawHeight = embeddedImg.height * scale;
    const drawX = marginPt + (availableWidth - drawWidth) / 2;
    const drawY = marginPt + (availableHeight - drawHeight) / 2;

    page.drawImage(embeddedImg, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });

    return doc;
  };

  if (!mergeAll && imageItems.length > 1) {
    const zip = new JSZip();
    for (let idx = 0; idx < imageItems.length; idx++) {
      const item = imageItems[idx];
      const singleDoc = await createSinglePagePdf(item);
      if (singleDoc) {
        const bytes = await singleDoc.save({ useObjectStreams: true });
        const name = (item.file?.name || `image_${idx + 1}`).replace(/\.[^/.]+$/, '');
        zip.file(`${name}.pdf`, bytes);
      }
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return {
      blob: zipBlob,
      filename: 'converted_images.zip',
    };
  }

  const pdfDoc = await PDFDocument.create();

  for (const item of imageItems) {
    const file = item.file || item;
    const customRotation = item.rotation || 0;
    const imgBytes = await file.arrayBuffer();

    let embeddedImg;
    if (file.type.includes('png') || file.name.toLowerCase().endsWith('.png')) {
      embeddedImg = await pdfDoc.embedPng(imgBytes);
    } else {
      embeddedImg = await pdfDoc.embedJpg(imgBytes);
    }

    if (embeddedImg) {
      let pageWidth, pageHeight;

      if (pageSize === 'fit') {
        pageWidth = embeddedImg.width + marginPt * 2;
        pageHeight = embeddedImg.height + marginPt * 2;
        if (orientation === 'landscape' && pageHeight > pageWidth) {
          [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }
      } else {
        const base = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
        if (orientation === 'landscape') {
          pageWidth = Math.max(base.width, base.height);
          pageHeight = Math.min(base.width, base.height);
        } else {
          pageWidth = Math.min(base.width, base.height);
          pageHeight = Math.max(base.width, base.height);
        }
      }

      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      if (customRotation !== 0) {
        page.setRotation(degrees(customRotation));
      }

      const availableWidth = pageWidth - marginPt * 2;
      const availableHeight = pageHeight - marginPt * 2;
      const scale = Math.min(
        availableWidth / embeddedImg.width,
        availableHeight / embeddedImg.height
      );

      const drawWidth = embeddedImg.width * scale;
      const drawHeight = embeddedImg.height * scale;
      const drawX = marginPt + (availableWidth - drawWidth) / 2;
      const drawY = marginPt + (availableHeight - drawHeight) / 2;

      page.drawImage(embeddedImg, {
        x: drawX,
        y: drawY,
        width: drawWidth,
        height: drawHeight,
      });
    }
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: 'converted_images.pdf',
    originalSize: imageItems.reduce((acc, cur) => acc + (cur.file?.size || 0), 0),
    compressedSize: bytes.byteLength,
  };
}

export async function pdfToJpg(file) {
  const pdf = await loadPdfJsSafely(file);
  const numPages = pdf.numPages;

  if (numPages === 1) {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
    return {
      blob,
      filename: `${file.name.replace(/\.[^/.]+$/, '')}_page_1.jpg`
    };
  }

  const zip = new JSZip();
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;

    const pageBlob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
    zip.file(`page_${i}.jpg`, pageBlob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return {
    blob: zipBlob,
    filename: `${file.name.replace(/\.[^/.]+$/, '')}_jpgs.zip`
  };
}

export async function pdfToMarkdown(file) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/convert/pdf-to-markdown`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const mdBlob = await response.blob();
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      return {
        blob: mdBlob,
        filename: `${baseName}.md`,
        originalSize: file.size,
        compressedSize: mdBlob.size,
      };
    }
  } catch (err) {
    console.warn('Backend Markdown conversion error, using fallback:', err);
  }

  const pdf = await loadPdfJsSafely(file);
  let markdown = `# ${file.name.replace(/\.[^/.]+$/, '')}\n\n`;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const lineMap = new Map();
    for (const item of textContent.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) {
        lineMap.set(y, []);
      }
      lineMap.get(y).push(item.str);
    }

    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const pageLines = sortedY.map((y) => lineMap.get(y).join(' ').trim()).filter(Boolean);

    markdown += `## Page ${i}\n\n${pageLines.join('\n\n')}\n\n`;
  }

  return {
    blob: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    filename: `${file.name.replace(/\.[^/.]+$/, '')}.md`,
    originalSize: file.size,
    compressedSize: markdown.length,
  };
}

export async function checkDocxPassword(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const isOleContainer =
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1;

    if (isOleContainer) {
      const headerText = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
      if (
        headerText.includes('EncryptedPackage') ||
        headerText.includes('EncryptionInfo') ||
        headerText.includes('StrongEncryptionTransform')
      ) {
        return true;
      }
    }

    try {
      const zip = await JSZip.loadAsync(arrayBuffer);

      const settingsFile = zip.file('word/settings.xml');
      if (settingsFile) {
        const settingsXml = await settingsFile.async('text');
        if (
          settingsXml.includes('w:documentProtection') &&
          (settingsXml.includes('w:enforcement="1"') || settingsXml.includes('w:enforcement="true"'))
        ) {
          if (settingsXml.includes('w:cryptAlgorithmClass') || settingsXml.includes('w:hash')) {
            return true;
          }
        }
      }
    } catch {
      if (file.name.toLowerCase().endsWith('.docx')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function convertWordToPDF(file) {
  const isLocked = await checkDocxPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected or encrypted.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/convert/word-to-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.isLocked) {
      const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
      err.lockedFiles = [file.name];
      throw err;
    }
    throw new Error(errorData.error || 'Server failed to convert Word document.');
  }

  const pdfBlob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  return {
    blob: pdfBlob,
    filename: `${baseName}.pdf`,
    originalSize: file.size,
    compressedSize: pdfBlob.size,
  };
}

export async function checkPptxPassword(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const isOleContainer =
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1;

    if (isOleContainer) {
      const headerText = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
      if (
        headerText.includes('EncryptedPackage') ||
        headerText.includes('EncryptionInfo') ||
        headerText.includes('StrongEncryptionTransform')
      ) {
        return true;
      }
    }

    try {
      const zip = await JSZip.loadAsync(arrayBuffer);

      const presPropsFile = zip.file('ppt/presProps.xml');
      if (presPropsFile) {
        const presPropsXml = await presPropsFile.async('text');
        if (
          presPropsXml.includes('p:modifyVerifier') ||
          presPropsXml.includes('p:cryptAlgorithmClass') ||
          presPropsXml.includes('password=')
        ) {
          return true;
        }
      }
    } catch {
      if (file.name.toLowerCase().endsWith('.pptx')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function convertPowerpointToPDF(file) {
  const isLocked = await checkPptxPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected or encrypted.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/convert/powerpoint-to-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.isLocked) {
      const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
      err.lockedFiles = [file.name];
      throw err;
    }
    throw new Error(errorData.error || 'Server failed to convert presentation.');
  }

  const pdfBlob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  return {
    blob: pdfBlob,
    filename: `${baseName}.pdf`,
    originalSize: file.size,
    compressedSize: pdfBlob.size,
  };
}

export async function convertHtmlToPDF(input) {
  let response;

  if (typeof input === 'string') {
    response = await fetch(`${API_BASE_URL}/api/convert/html-to-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: input }),
    });
  } else {
    const formData = new FormData();
    formData.append('file', input);

    response = await fetch(`${API_BASE_URL}/api/convert/html-to-pdf`, {
      method: 'POST',
      body: formData,
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Server failed to convert HTML to PDF.');
  }

  const pdfBlob = await response.blob();
  const baseName = typeof input === 'string' ? 'document' : input.name.replace(/\.[^/.]+$/, '');

  return {
    blob: pdfBlob,
    filename: `${baseName}.pdf`,
    originalSize: typeof input === 'string' ? new Blob([input]).size : input.size,
    compressedSize: pdfBlob.size,
  };
}

export async function checkExcelPassword(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const isOleContainer =
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1;

    if (isOleContainer) {
      const headerText = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
      if (
        headerText.includes('EncryptedPackage') ||
        headerText.includes('EncryptionInfo') ||
        headerText.includes('StrongEncryptionTransform')
      ) {
        return true;
      }
    }

    try {
      const zip = await JSZip.loadAsync(arrayBuffer);

      const workbookFile = zip.file('xl/workbook.xml');
      if (workbookFile) {
        const wbXml = await workbookFile.async('text');
        if (wbXml.includes('workbookProtection') && (wbXml.includes('workbookPassword') || wbXml.includes('lockStructure="1"'))) {
          return true;
        }
      }
    } catch {
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function convertExcelToPDF(file) {
  const isLocked = await checkExcelPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected or encrypted.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/convert/excel-to-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData.isLocked) {
      const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
      err.lockedFiles = [file.name];
      throw err;
    }
    throw new Error(errorData.error || 'Server failed to convert Excel document.');
  }

  const pdfBlob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  return {
    blob: pdfBlob,
    filename: `${baseName}.pdf`,
    originalSize: file.size,
    compressedSize: pdfBlob.size,
  };
}

export async function rotatePDF(file, options = 90) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected and cannot be processed.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  if (Array.isArray(options)) {
    options.forEach((item, index) => {
      if (pages[index] && item.rotation !== 0) {
        const currentRotation = pages[index].getRotation().angle;
        pages[index].setRotation(degrees((currentRotation + item.rotation) % 360));
      }
    });
  } else {
    const angle = typeof options === 'number' ? options : 90;
    pages.forEach((page) => {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + angle) % 360));
    });
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    blob: new Blob([bytes], { type: 'application/pdf' }),
    filename: `rotated_${file.name}`,
  };
}

export async function convertPdfToWord(file) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/convert/pdf-to-word`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Server failed to convert PDF to Word document.');
  }

  const docxBlob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  return {
    blob: docxBlob,
    filename: `${baseName}.docx`,
    originalSize: file.size,
    compressedSize: docxBlob.size,
  };
}

export async function convertPdfToPowerpoint(file) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/convert/pdf-to-powerpoint`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Server failed to convert PDF to PowerPoint presentation.');
  }

  const pptxBlob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  return {
    blob: pptxBlob,
    filename: `${baseName}.pptx`,
    originalSize: file.size,
    compressedSize: pptxBlob.size,
  };
}

export async function convertPdfToExcel(file) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/convert/pdf-to-excel`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Server failed to convert PDF to Excel spreadsheet.');
  }

  const xlsxBlob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');

  return {
    blob: xlsxBlob,
    filename: `${baseName}.xlsx`,
    originalSize: file.size,
    compressedSize: xlsxBlob.size,
  };
}

export async function addPageNumbersToPDF(file, options) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected or encrypted.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const {
    position = 'bottom-right',
    margin = 'recommended',
    pageMode = 'single',
    firstNumber = 1,
    fromPage = 1,
    toPage = 1,
    textPreset = 'number-only',
    customText = 'Page {n} of {p}',
    fontSize = 10,
    fontFamily = 'Helvetica',
    isBold = false,
    isItalic = false,
    isUnderline = false,
    color = '#4A5568',
  } = options;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  let fontRef;
  if (fontFamily === 'Times') {
    if (isBold && isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
    else if (isBold) fontRef = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    else if (isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    else fontRef = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  } else if (fontFamily === 'Courier') {
    if (isBold && isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.CourierBoldOblique);
    else if (isBold) fontRef = await pdfDoc.embedFont(StandardFonts.CourierBold);
    else if (isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.CourierOblique);
    else fontRef = await pdfDoc.embedFont(StandardFonts.Courier);
  } else {
    if (isBold && isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    else if (isBold) fontRef = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    else if (isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    else fontRef = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  let marginPt = 36;
  if (margin === 'small') marginPt = 20;
  if (margin === 'large') marginPt = 54;

  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0.2;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0.2;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0.2;
  const textColor = rgb(r, g, b);

  const startPage = Math.max(1, Math.min(fromPage, totalPages));
  const endPage = Math.min(totalPages, Math.max(startPage, toPage));

  for (let i = startPage - 1; i <= endPage - 1; i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    const currentNumber = firstNumber + (i - (startPage - 1));

    let label = `${currentNumber}`;
    if (textPreset === 'page-n') {
      label = `Page ${currentNumber}`;
    } else if (textPreset === 'page-n-of-p') {
      label = `Page ${currentNumber} of ${totalPages}`;
    } else if (textPreset === 'custom') {
      label = customText
        .replace(/{n}/g, `${currentNumber}`)
        .replace(/{p}/g, `${totalPages}`);
    }

    const textWidth = fontRef.widthOfTextAtSize(label, fontSize);
    const textHeight = fontRef.heightAtSize(fontSize);

    let activePos = position;
    if (pageMode === 'facing') {
      const isEven = (i + 1) % 2 === 0;
      if (position.includes('right') && isEven) {
        activePos = position.replace('right', 'left');
      } else if (position.includes('left') && isEven) {
        activePos = position.replace('left', 'right');
      }
    }

    let x = marginPt;
    let y = marginPt;

    if (activePos.includes('left')) {
      x = marginPt;
    } else if (activePos.includes('center')) {
      x = (width - textWidth) / 2;
    } else if (activePos.includes('right')) {
      x = width - marginPt - textWidth;
    }

    if (activePos.startsWith('top')) {
      y = height - marginPt - textHeight;
    } else if (activePos.startsWith('middle')) {
      y = (height - textHeight) / 2;
    } else if (activePos.startsWith('bottom')) {
      y = marginPt;
    }

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font: fontRef,
      color: textColor,
    });

    if (isUnderline) {
      page.drawLine({
        start: { x, y: y - 2 },
        end: { x: x + textWidth, y: y - 2 },
        thickness: 0.8,
        color: textColor,
      });
    }
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: `numbered_${file.name}`,
    originalSize: file.size,
    compressedSize: pdfBytes.byteLength,
  };
}

export async function addWatermarkToPDF(file, options) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected or encrypted.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const {
    type = 'text',
    text = 'CONFIDENTIAL',
    imageFile = null,
    position = 'middle-center',
    isMosaic = false,
    opacity = 0.5,
    rotation = 45,
    fromPage = 1,
    toPage = 1,
    layer = 'over',
    fontFamily = 'Helvetica',
    fontSize = 36,
    isBold = false,
    isItalic = false,
    isUnderline = false,
    color = '#E11D48',
  } = options;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  let fontRef;
  if (type === 'text') {
    if (fontFamily === 'Times') {
      if (isBold && isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
      else if (isBold) fontRef = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
      else if (isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
      else fontRef = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    } else if (fontFamily === 'Courier') {
      if (isBold && isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.CourierBoldOblique);
      else if (isBold) fontRef = await pdfDoc.embedFont(StandardFonts.CourierBold);
      else if (isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.CourierOblique);
      else fontRef = await pdfDoc.embedFont(StandardFonts.Courier);
    } else {
      if (isBold && isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
      else if (isBold) fontRef = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      else if (isItalic) fontRef = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      else fontRef = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }
  }

  let embeddedImg = null;
  if (type === 'image' && imageFile) {
    const imgBuffer = await imageFile.arrayBuffer();
    if (imageFile.type.includes('png') || imageFile.name.toLowerCase().endsWith('.png')) {
      embeddedImg = await pdfDoc.embedPng(imgBuffer);
    } else {
      embeddedImg = await pdfDoc.embedJpg(imgBuffer);
    }
  }

  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255 || 0.88;
  const g = parseInt(hex.substring(2, 4), 16) / 255 || 0.11;
  const b = parseInt(hex.substring(4, 6), 16) / 255 || 0.28;
  const textColor = rgb(r, g, b);

  const startPage = Math.max(1, Math.min(fromPage, totalPages));
  const endPage = Math.min(totalPages, Math.max(startPage, toPage));

  for (let i = startPage - 1; i <= endPage - 1; i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();

    const drawSingle = (cx, cy) => {
      if (type === 'text' && fontRef) {
        const textWidth = fontRef.widthOfTextAtSize(text || '', fontSize);
        const textHeight = fontRef.heightAtSize(fontSize);
        const rad = (rotation * Math.PI) / 180;

        const drawX = cx - (textWidth / 2) * Math.cos(rad) + (textHeight / 2) * Math.sin(rad);
        const drawY = cy - (textWidth / 2) * Math.sin(rad) - (textHeight / 2) * Math.cos(rad);

        page.drawText(text || '', {
          x: drawX,
          y: drawY,
          size: fontSize,
          font: fontRef,
          color: textColor,
          opacity: opacity,
          rotate: degrees(rotation),
        });

        if (isUnderline) {
          page.drawLine({
            start: { x: drawX, y: drawY - 2 },
            end: { x: drawX + textWidth * Math.cos(rad), y: drawY + textWidth * Math.sin(rad) - 2 },
            thickness: 1.2,
            color: textColor,
            opacity: opacity,
          });
        }
      } else if (type === 'image' && embeddedImg) {
        const scaleFactor = Math.min(120 / embeddedImg.width, 120 / embeddedImg.height, 1);
        const imgW = embeddedImg.width * scaleFactor;
        const imgH = embeddedImg.height * scaleFactor;
        const rad = (rotation * Math.PI) / 180;

        const drawX = cx - (imgW / 2) * Math.cos(rad) + (imgH / 2) * Math.sin(rad);
        const drawY = cy - (imgW / 2) * Math.sin(rad) - (imgH / 2) * Math.cos(rad);

        page.drawImage(embeddedImg, {
          x: drawX,
          y: drawY,
          width: imgW,
          height: imgH,
          opacity: opacity,
          rotate: degrees(rotation),
        });
      }
    };

    if (isMosaic) {
      const cols = 3;
      const rows = 3;
      for (let c = 0; c < cols; c++) {
        for (let rw = 0; rw < rows; rw++) {
          const cx = (width / cols) * (c + 0.5);
          const cy = (height / rows) * (rw + 0.5);
          drawSingle(cx, cy);
        }
      }
    } else {
      let cx = width / 2;
      let cy = height / 2;

      if (position.includes('left')) cx = width * 0.2;
      else if (position.includes('right')) cx = width * 0.8;

      if (position.startsWith('top')) cy = height * 0.8;
      else if (position.startsWith('bottom')) cy = height * 0.2;

      drawSingle(cx, cy);
    }
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: `watermarked_${file.name}`,
    originalSize: file.size,
    compressedSize: pdfBytes.byteLength,
  };
}

export async function cropPDF(file, cropOptions) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected or encrypted.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const {
    pagesMode = 'custom',
    currentPage = 1,
    box = { x: 5, y: 5, width: 90, height: 90 },
    pageBoxes = {}
  } = cropOptions;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const applyCropToPage = (page, cropRect) => {
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const cropX = (cropRect.x / 100) * pageWidth;
    const cropWidth = Math.max(10, (cropRect.width / 100) * pageWidth);
    const cropHeight = Math.max(10, (cropRect.height / 100) * pageHeight);
    const cropY = pageHeight - ((cropRect.y / 100) * pageHeight) - cropHeight;

    page.setCropBox(cropX, Math.max(0, cropY), cropWidth, cropHeight);
    page.setMediaBox(cropX, Math.max(0, cropY), cropWidth, cropHeight);
  };

  if (pagesMode === 'current') {
    const targetIdx = Math.max(0, Math.min(currentPage - 1, totalPages - 1));
    const targetBox = pageBoxes[currentPage] || box;
    applyCropToPage(pdfDoc.getPage(targetIdx), targetBox);
  } else if (pagesMode === 'custom') {
    const pages = pdfDoc.getPages();
    pages.forEach((page, idx) => {
      const pageNum = idx + 1;
      if (pageBoxes[pageNum]) {
        applyCropToPage(page, pageBoxes[pageNum]);
      }
    });
  } else {
    const pages = pdfDoc.getPages();
    pages.forEach((page) => {
      applyCropToPage(page, box);
    });
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: `cropped_${file.name}`,
    originalSize: file.size,
    compressedSize: pdfBytes.byteLength,
  };
}

export async function protectPDF(file, password) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is already password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('password', password);

  const response = await fetch(`${API_BASE_URL}/api/protect-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to protect PDF.');
  }

  const blob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  return {
    blob,
    filename: `${baseName}_protected.pdf`,
    originalSize: file.size,
    compressedSize: blob.size,
  };
}

export async function unlockPDF(file, options = {}) {
  const { mode = 'with-password', password = '' } = options;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  if (mode === 'with-password') {
    formData.append('password', password);
  }

  const response = await fetch(`${API_BASE_URL}/api/unlock-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to unlock PDF document.');
  }

  const blob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  return {
    blob,
    filename: `${baseName}_unlocked.pdf`,
    originalSize: file.size,
    compressedSize: blob.size,
  };
}

export async function extractPdfFormFields(file) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = [];
  const pages = pdfDoc.getPages();

  try {
    const rawFields = form.getFields();

    rawFields.forEach((field, index) => {
      try {
        const name = field.getName();
        const type = field.constructor.name;
        const widgets = field.acroField.getWidgets();

        widgets.forEach((widget, wIdx) => {
          const rect = widget.getRectangle();

          const pRef = widget.P();
          let pageIndex = 0;
          if (pRef) {
            const foundIdx = pages.findIndex(p => p.ref === pRef);
            if (foundIdx !== -1) pageIndex = foundIdx;
          }

          const targetPage = pages[pageIndex] || pages[0];
          const { width: pWidth, height: pHeight } = targetPage.getSize();

          const widthPercent = Math.max(2, (rect.width / pWidth) * 100);
          const heightPercent = Math.max(1.5, (rect.height / pHeight) * 100);
          const xPercent = Math.max(0, Math.min(100 - widthPercent, (rect.x / pWidth) * 100));
          const yPercent = Math.max(0, Math.min(100 - heightPercent, ((pHeight - rect.y - rect.height) / pHeight) * 100));

          let fieldType = 'text';
          let value = '';
          let options = [];

          if (type.includes('CheckBox')) {
            fieldType = 'checkbox';
            try { value = field.isChecked(); } catch { value = false; }
          } else if (type.includes('Radio')) {
            fieldType = 'radio';
            try {
              value = field.getSelected() || '';
              options = field.getOptions() || [];
            } catch { value = ''; }
          } else if (type.includes('Dropdown') || type.includes('OptionList') || type.includes('Choice')) {
            fieldType = type.includes('Dropdown') ? 'combobox' : 'listbox';
            try {
              options = field.getOptions() || [];
              const selected = field.getSelected();
              value = Array.isArray(selected) ? selected[0] || '' : selected || '';
            } catch { options = []; }
          } else if (type.includes('Signature')) {
            fieldType = 'signature';
          } else {
            fieldType = 'text';
            try { value = field.getText() || ''; } catch { value = ''; }
          }

          fields.push({
            id: `detected-${index}-${wIdx}-${Date.now()}`,
            name: name || `Field_${index + 1}`,
            originalName: name,
            type: fieldType,
            page: pageIndex + 1,
            xPercent,
            yPercent,
            widthPercent,
            heightPercent,
            value: value,
            options: options,
            readOnly: false,
            required: field.isRequired ? field.isRequired() : false,
            multiline: field.isMultiline ? field.isMultiline() : false,
            includeIndicator: false,
            indicatorText: 'Fill Here',
            isExisting: true,
            fontSize: 11,
            fontFamily: 'Helvetica',
            color: '#000000',
            strokeColor: '#3b82f6',
            isBold: false,
            isItalic: false,
            isUnderline: false
          });
        });
      } catch (fErr) {
        console.warn('Skipping unparseable form field:', fErr);
      }
    });
  } catch (err) {
    console.warn('AcroForm parsing fell back to standard view:', err);
  }

  return {
    fields,
    totalPages: pdfDoc.getPageCount()
  };
}

export async function savePdfForms(file, formFields) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();

  try {
    const existingAcroFields = [...form.getFields()];
    existingAcroFields.forEach((f) => {
      try {
        form.removeField(f);
      } catch (_) {}
    });

    pages.forEach((page) => {
      const annots = page.node.Annots();
      if (annots) {
        for (let i = annots.size() - 1; i >= 0; i--) {
          const annotRef = annots.get(i);
          const annotDict = pdfDoc.context.lookup(annotRef);
          const subtype = annotDict?.get(pdfDoc.context.obj('Subtype'))?.toString();
          if (subtype === '/Widget') {
            annots.remove(i);
          }
        }
      }
    });
  } catch (cleanErr) {
    console.warn('Cleanup error:', cleanErr);
  }

  const fonts = {
    Helvetica: await pdfDoc.embedFont(StandardFonts.Helvetica),
    HelveticaBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    Times: await pdfDoc.embedFont(StandardFonts.TimesRoman),
    TimesBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    Courier: await pdfDoc.embedFont(StandardFonts.Courier),
    CourierBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
  };

  for (let i = 0; i < formFields.length; i++) {
    const field = formFields[i];
    const targetPage = pages[Math.max(0, Math.min(field.page - 1, pages.length - 1))];
    const { width: pageWidth, height: pageHeight } = targetPage.getSize();

    const pdfX = (field.xPercent / 100) * pageWidth;
    const pdfWidth = (field.widthPercent / 100) * pageWidth;
    const pdfHeight = (field.heightPercent / 100) * pageHeight;
    const pdfY = pageHeight - ((field.yPercent / 100) * pageHeight) - pdfHeight;

    let fontRef = fonts.Helvetica;
    if (field.fontFamily === 'Times') fontRef = field.isBold ? fonts.TimesBold : fonts.Times;
    else if (field.fontFamily === 'Courier') fontRef = field.isBold ? fonts.CourierBold : fonts.Courier;
    else if (field.isBold) fontRef = fonts.HelveticaBold;

    const targetFontSize = Math.max(7, Math.min(field.fontSize || 11, Math.round(pdfHeight * 0.75)));

    const hex = (field.color || '#000000').replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255 || 0;
    const g = parseInt(hex.substring(2, 4), 16) / 255 || 0;
    const b = parseInt(hex.substring(4, 6), 16) / 255 || 0;
    const textColor = rgb(r, g, b);

    if (field.type === 'formtext') {
      if (field.value) {
        targetPage.drawText(String(field.value), {
          x: pdfX,
          y: pdfY + (pdfHeight / 2) - (targetFontSize / 2.5),
          size: targetFontSize,
          font: fontRef,
          color: textColor,
          maxWidth: pdfWidth
        });

        if (field.isUnderline) {
          const textW = fontRef.widthOfTextAtSize(String(field.value), targetFontSize);
          targetPage.drawLine({
            start: { x: pdfX, y: pdfY + (pdfHeight / 2) - (targetFontSize / 2.5) - 2 },
            end: { x: pdfX + Math.min(textW, pdfWidth), y: pdfY + (pdfHeight / 2) - (targetFontSize / 2.5) - 2 },
            thickness: 1,
            color: textColor
          });
        }
      }
      continue;
    }

    if (field.includeIndicator) {
      const indLabel = field.indicatorText || 'Sign Here';
      const indFontSize = 8;
      const indPadding = 4;
      const indTextW = fonts.HelveticaBold.widthOfTextAtSize(indLabel, indFontSize);
      const indBadgeW = indTextW + indPadding * 2;
      const indBadgeH = 14;
      const indX = Math.max(4, pdfX - indBadgeW - 8);
      const indY = pdfY + (pdfHeight / 2) - (indBadgeH / 2);

      targetPage.drawRectangle({
        x: indX,
        y: indY,
        width: indBadgeW,
        height: indBadgeH,
        color: rgb(0.05, 0.55, 0.9),
      });

      targetPage.drawText(indLabel, {
        x: indX + indPadding,
        y: indY + 3.5,
        size: indFontSize,
        font: fonts.HelveticaBold,
        color: rgb(1, 1, 1),
      });
    }

    const cleanBase = (field.name || `field_${i}`).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueFieldName = `${cleanBase}_${i}`;

    try {
      if (field.type === 'checkbox') {
        const checkBox = form.createCheckBox(uniqueFieldName);
        checkBox.addToPage(targetPage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });

        if (field.value) checkBox.check();
        else checkBox.uncheck();

        if (field.readOnly) checkBox.enableReadOnly();
        if (field.required) checkBox.enableRequired();
      } else if (field.type === 'radio') {
        const groupName = field.group || `RadioGroup_${field.page}`;
        let radioGroup;
        try {
          radioGroup = form.getRadioGroup(groupName);
        } catch (_) {
          radioGroup = form.createRadioGroup(groupName);
        }

        const optionValue = field.name || `Option_${i}`;
        radioGroup.addOptionToPage(optionValue, targetPage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });

        if (field.value) radioGroup.select(optionValue);
        if (field.readOnly) radioGroup.enableReadOnly();
        if (field.required) radioGroup.enableRequired();
      } else if (field.type === 'combobox') {
        const dropdown = form.createDropdown(uniqueFieldName);
        dropdown.addToPage(targetPage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });

        const optionsList = field.options && field.options.length > 0
          ? field.options
          : ['Option 1', 'Option 2'];

        dropdown.setOptions(optionsList);
        if (field.value && optionsList.includes(field.value)) {
          dropdown.select(field.value);
        } else if (optionsList.length > 0) {
          dropdown.select(optionsList[0]);
        }

        try { dropdown.setFontSize(targetFontSize); } catch (_) {}
        dropdown.updateAppearances(fontRef);

        if (field.readOnly) dropdown.enableReadOnly();
        if (field.required) dropdown.enableRequired();
      } else if (field.type === 'listbox') {
        const optionList = form.createOptionList(uniqueFieldName);
        optionList.addToPage(targetPage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });

        const optionsList = field.options && field.options.length > 0
          ? field.options
          : ['Option 1', 'Option 2'];

        optionList.setOptions(optionsList);
        if (field.value && optionsList.includes(field.value)) {
          optionList.select(field.value);
        }

        try { optionList.setFontSize(Math.max(6, targetFontSize - 1)); } catch (_) {}
        optionList.updateAppearances(fontRef);

        if (field.readOnly) optionList.enableReadOnly();
        if (field.required) optionList.enableRequired();
      } else if (field.type === 'signature') {
        const tf = form.createTextField(uniqueFieldName);
        tf.addToPage(targetPage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });

        try { tf.setFontSize(Math.max(9, targetFontSize)); } catch (_) {}
        if (field.value) tf.setText(String(field.value));
        tf.updateAppearances(fonts.TimesBold);
        if (field.readOnly) tf.enableReadOnly();
      } else {
        const tf = form.createTextField(uniqueFieldName);
        tf.addToPage(targetPage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });

        if (field.multiline) tf.enableMultiline();
        try { tf.setFontSize(targetFontSize); } catch (_) {}

        if (field.value !== undefined && field.value !== '') {
          tf.setText(String(field.value));
        }

        tf.updateAppearances(fontRef);
        if (field.readOnly) tf.enableReadOnly();
        if (field.required) tf.enableRequired();
      }
    } catch (err) {
      console.warn(`Error writing field ${uniqueFieldName}:`, err);
    }
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  return {
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: `filled_${file.name}`,
    originalSize: file.size,
    compressedSize: pdfBytes.byteLength
  };
}

/* =========================================================================
 * OCR — BentoPDF-style implementation
 * ========================================================================= */

const OCR_DPI_PRESETS = {
  standard: 192,
  high: 288,
  ultra: 384,
};

export const OCR_WHITELIST_PRESETS = {
  none: '',
  invoice: '0123456789$.,/\\-#: ',
  numbers: '0123456789.,-',
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',
  letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
};

function binarizeCanvasInPlace(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray > 128 ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
}

function extractTesseractWords(data) {
  const out = [];

  if (Array.isArray(data?.words) && data.words.length > 0) {
    for (const w of data.words) {
      if (w && typeof w.text === 'string' && w.text.trim() && w.bbox) {
        out.push(w);
      }
    }
    if (out.length > 0) return out;
  }

  if (Array.isArray(data?.blocks)) {
    for (const block of data.blocks) {
      const paras = block?.paragraphs;
      if (!Array.isArray(paras)) continue;
      for (const para of paras) {
        const lines = para?.lines;
        if (!Array.isArray(lines)) continue;
        for (const line of lines) {
          const words = line?.words;
          if (!Array.isArray(words)) continue;
          for (const w of words) {
            if (w && typeof w.text === 'string' && w.text.trim() && w.bbox) {
              out.push(w);
            }
          }
        }
      }
    }
  }

  return out;
}

function parseTesseractTsv(tsvText) {
  if (!tsvText || typeof tsvText !== 'string') return [];
  const lines = tsvText.split('\n');
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    if (cols[0] !== '5') continue;

    const left = parseFloat(cols[6]);
    const top = parseFloat(cols[7]);
    const width = parseFloat(cols[8]);
    const height = parseFloat(cols[9]);
    const confidence = parseFloat(cols[10]);
    const text = cols[11];

    if (!text || !text.trim()) continue;
    if (isNaN(left) || isNaN(top) || isNaN(width) || isNaN(height)) continue;

    out.push({
      text: text.trim(),
      confidence: isNaN(confidence) ? 0 : confidence,
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
    });
  }

  return out;
}

function escapePdfLiteralString(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t\f\v\0]/g, ' ');
}

/**
 * Analyze a word's ink-height metrics relative to its em box.
 *
 * Tesseract's word bbox is the INK bounding box — the union of the pixels
 * of every glyph in the word. Its height therefore depends on which
 * characters the word contains:
 *
 *   • Words with full ascenders or capitals (b d f h k l, A-Z) —
 *     ink top is at the ascender height, roughly 0.72 em above the baseline.
 *   • Words with only x-height letters (a c e i m n o r s u v w x z) —
 *     ink top is at the x-height, roughly 0.52 em above the baseline.
 *   • Words with descenders (g j p q y) — ink bottom extends to roughly
 *     0.21 em below the baseline.
 *
 * Deriving the em size directly from the bbox height (the previous
 * implementation) caused the invisible text — and therefore the selection
 * quad — to be much smaller than the visible glyphs, because the em box
 * was never accounted for. This function returns the correct ratios so the
 * em size can be recovered from the ink height.
 *
 * @param {string} word
 * @returns {{ topRatio: number, bottomRatio: number, inkRatio: number }}
 */
function analyzeWordInkMetrics(word) {
  const w = String(word || '');
  const lower = w.toLowerCase();

  // Full-height characters: b d f h k l plus every uppercase letter.
  const hasFullAscender = /[bdfhkl]/.test(lower) || /[A-Z]/.test(w);

  // Partial-height characters: t (short ascender ~0.63 em), i/j dots (~0.70 em).
  const hasSemiAscender = /[ti]/.test(lower) || /[j]/.test(lower);

  // Descenders: g j p q y.
  const hasDescender = /[gjpqy]/.test(lower);

  let topRatio;
  if (hasFullAscender) topRatio = 0.72;
  else if (hasSemiAscender) topRatio = 0.66;
  else topRatio = 0.52;

  const bottomRatio = hasDescender ? 0.21 : 0;

  return { topRatio, bottomRatio, inkRatio: topRatio + bottomRatio };
}

/**
 * Genuine In-Browser WebAssembly OCR Engine with Granular Real-Time Progress
 * Tracking, matching BentoPDF's algorithm and output quality:
 *
 *   • Renders the page at a user-selected DPI (192 / 288 / 384).
 *   • Optional binarization and character whitelist for accuracy tuning.
 *   • Embeds the rendered page as a LOSSLESS PNG (not JPEG) so no visible
 *     compression artifacts are introduced.
 *   • Stamps each recognized word as a single text-showing operation using
 *     the PDF text operators BT / Tf / Tz / Td / Tj / ET, with:
 *        – font size derived from the word's ink-height metrics (see
 *          analyzeWordInkMetrics) so the invisible em box matches the
 *          visible glyphs;
 *        – baseline placed at the correct position for the word's ascender
 *          and descender composition;
 *        – horizontal scaling (Tz) so the run's natural width matches the
 *          OCR bbox width exactly;
 *        – invisible rendering mode 3 (Tr 3) — the specification-sanctioned
 *          way to hide text while keeping it fully searchable, selectable,
 *          and extractable in every PDF viewer, including Adobe Acrobat.
 *
 * @param {File} file
 * @param {Object} options
 *   language      — Tesseract language code (default 'eng')
 *   onProgress    — progress callback
 *   outputMode    — 'searchable_pdf' | 'text'
 *   dpiPreset     — 'standard' | 'high' | 'ultra'   (default 'high')
 *   charWhitelist — allowed-character string (empty = all)
 *   binarize      — boolean, apply black/white threshold before OCR
 */
export async function performPdfOcr(file, options = {}) {
  const {
    language = 'eng',
    onProgress = () => {},
    outputMode = 'searchable_pdf',
    dpiPreset = 'high',
    charWhitelist = '',
    binarize = false,
  } = options;

  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`"${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdfJsDoc.numPages;

  const dpi = OCR_DPI_PRESETS[dpiPreset] || OCR_DPI_PRESETS.high;
  const renderScale = dpi / 72;

  let currentPageNum = 1;

  onProgress({ status: 'Loading OCR Engine & Models...', percent: 5 });

  const worker = await createWorker(language, 1, {
    logger: (m) => {
      if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
        const pagePortion = 90 / totalPages;
        const basePagePercent = 5 + (currentPageNum - 1) * pagePortion;
        const currentSubPercent = Math.round(basePagePercent + m.progress * pagePortion);
        onProgress({
          status: `Scanning Page ${currentPageNum} of ${totalPages} (${Math.round(m.progress * 100)}%)...`,
          percent: Math.min(95, currentSubPercent)
        });
      } else if (m && m.status && m.status.includes('loading')) {
        onProgress({
          status: `Loading language data (${m.status})...`,
          percent: 8
        });
      }
    }
  });

  if (charWhitelist && charWhitelist.length > 0) {
    try {
      await worker.setParameters({ tessedit_char_whitelist: charWhitelist });
    } catch (e) {
      console.warn('[OCR] Failed to set character whitelist:', e);
    }
  }

  const outputPdfDoc = await PDFDocument.create();
  const helveticaFont = await outputPdfDoc.embedFont(StandardFonts.Helvetica);
  let extractedFullText = '';

  const opSave = PDFOperator.of('q');
  const opRestore = PDFOperator.of('Q');
  const opTrInvisible = PDFOperator.of('Tr', [PDFNumber.of(3)]);
  const opTrVisible = PDFOperator.of('Tr', [PDFNumber.of(0)]);

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      currentPageNum = pageNum;

      onProgress({
        status: `Rendering Page ${pageNum} of ${totalPages} at ${dpi} DPI...`,
        percent: Math.round(5 + ((pageNum - 1) / totalPages) * 90)
      });

      const page = await pdfJsDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Fill white first so PNG has an opaque base (canvas defaults to
      // transparent, and transparent PNGs are larger and can confuse some
      // downstream OCR / indexing pipelines).
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      if (binarize) {
        try { binarizeCanvasInPlace(canvas); } catch (_) {}
      }

      const { data } = await worker.recognize(canvas, {}, {
        text: true,
        blocks: true,
        tsv: true,
      });

      extractedFullText += `--- Page ${pageNum} ---\n` + (data.text || '') + '\n\n';

      if (outputMode === 'searchable_pdf') {
        // ------------------------------------------------------------------
        // PIXEL QUALITY FIX
        //
        // The page image is embedded as a LOSSLESS PNG. JPEG (even at 0.95
        // quality) introduces 8×8 block artifacts that are especially
        // destructive on crisp vector text and logos, and those artifacts
        // persist through every subsequent render. PNG preserves the
        // rasterized page exactly as pdf.js produced it, so the visible
        // output is identical to the source.
        // ------------------------------------------------------------------
        const imgBytes = await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('Canvas toBlob returned null')); return; }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
          }, 'image/png');
        });
        const embeddedImg = await outputPdfDoc.embedPng(imgBytes);

        const pdfPageW = viewport.width / renderScale;
        const pdfPageH = viewport.height / renderScale;
        const newPage = outputPdfDoc.addPage([pdfPageW, pdfPageH]);

        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: pdfPageW,
          height: pdfPageH,
        });

        let tesseractWords = extractTesseractWords(data);
        let source = 'blocks';
        if (tesseractWords.length === 0 && data.tsv) {
          tesseractWords = parseTesseractTsv(data.tsv);
          source = 'tsv';
        }

        console.log(
          `[OCR] Page ${pageNum}: ${tesseractWords.length} words extracted ` +
          `(source=${source}, dpi=${dpi})`
        );

        if (tesseractWords.length > 0) {
          let fontKey = null;
          try {
            fontKey = newPage.node.newFontDictionary(helveticaFont.name, helveticaFont.ref);
          } catch (regErr) {
            console.warn('[OCR] Font registration failed, falling back to drawText:', regErr);
          }

          const scaleX = pdfPageW / canvas.width;
          const scaleY = pdfPageH / canvas.height;

          newPage.pushOperators(opSave, opTrInvisible);

          for (const w of tesseractWords) {
            const wordText = (w.text || '').trim();
            if (!wordText) continue;
            const bbox = w.bbox;
            if (!bbox) continue;

            // Map bbox from canvas pixels to PDF points.
            const boxLeft = bbox.x0 * scaleX;
            const boxTopPdf = pdfPageH - bbox.y0 * scaleY;
            const boxBottomPdf = pdfPageH - bbox.y1 * scaleY;
            const boxWidth = (bbox.x1 - bbox.x0) * scaleX;
            const boxHeight = (bbox.y1 - bbox.y0) * scaleY;

            if (boxWidth <= 0 || boxHeight <= 0) continue;

            // --------------------------------------------------------------
            // ALIGNMENT FIX
            //
            // The OCR bbox is the INK bounding box. Its height depends on
            // which characters the word contains. To make the invisible text
            // render at the correct em size, we derive the em height from
            // the ink composition:
            //
            //   fontSize = boxHeight / inkRatio
            //
            // Then we place the baseline so the invisible em box lines up
            // with the visible glyphs:
            //
            //   baselineY = boxTop - topRatio * fontSize
            //
            // This makes the selection quad (which Acrobat derives from the
            // font's ascent/descent) track the visible glyphs exactly.
            // --------------------------------------------------------------
            const { topRatio, inkRatio } = analyzeWordInkMetrics(wordText);

            const fontSize = boxHeight / Math.max(inkRatio, 0.1);
            const baselineY = boxTopPdf - topRatio * fontSize;

            // Horizontal scaling: match the word's natural advance width
            // to the bbox width so the selection rectangle spans exactly
            // the visible glyphs horizontally.
            let naturalWidth = 0;
            try {
              naturalWidth = helveticaFont.widthOfTextAtSize(wordText, fontSize);
            } catch (_) { naturalWidth = 0; }

            let hScale = 100;
            if (naturalWidth > 0 && boxWidth > 0) {
              hScale = (boxWidth / naturalWidth) * 100;
              // Clamp to a sane range to prevent pathological stretching
              // when the bbox is obviously wrong.
              if (hScale < 30) hScale = 30;
              if (hScale > 300) hScale = 300;
            }

            if (fontKey) {
              try {
                newPage.pushOperators(
                  PDFOperator.of('BT'),
                  PDFOperator.of('Tf', [PDFName.of(fontKey), PDFNumber.of(fontSize)]),
                  PDFOperator.of('Tz', [PDFNumber.of(hScale)]),
                  PDFOperator.of('Td', [PDFNumber.of(boxLeft), PDFNumber.of(baselineY)]),
                  PDFOperator.of('Tj', [PDFString.of(escapePdfLiteralString(wordText))]),
                  PDFOperator.of('ET')
                );
              } catch (opErr) {
                try {
                  newPage.drawText(wordText, {
                    x: boxLeft,
                    y: baselineY,
                    size: fontSize,
                    font: helveticaFont,
                    color: rgb(0, 0, 0),
                  });
                } catch (_) { /* skip word */ }
              }
            } else {
              try {
                newPage.drawText(wordText, {
                  x: boxLeft,
                  y: baselineY,
                  size: fontSize,
                  font: helveticaFont,
                  color: rgb(0, 0, 0),
                });
              } catch (_) { /* skip word */ }
            }
          }

          newPage.pushOperators(opTrVisible, opRestore);
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  onProgress({ status: 'Finalizing PDF...', percent: 98 });

  const baseName = file.name.replace(/\.[^/.]+$/, '');

  if (outputMode === 'text') {
    onProgress({ status: 'Done!', percent: 100 });
    return {
      blob: new Blob([extractedFullText], { type: 'text/plain;charset=utf-8' }),
      filename: `${baseName}_ocr.txt`,
      originalSize: file.size,
      compressedSize: extractedFullText.length
    };
  }

  const pdfBytes = await outputPdfDoc.save({ useObjectStreams: true });
  onProgress({ status: 'Done!', percent: 100 });

  return {
    blob: new Blob([pdfBytes], { type: 'application/pdf' }),
    filename: `${baseName}_searchable.pdf`,
    originalSize: file.size,
    compressedSize: pdfBytes.byteLength
  };
}

export async function editPdfText(file, edits, additions = []) {
  const isLocked = await checkPdfPassword(file);
  if (isLocked) {
    const err = new Error(`Cannot process: "${file.name}" is password-protected.`);
    err.lockedFiles = [file.name];
    throw err;
  }
  if ((!edits || edits.length === 0) && (!additions || additions.length === 0)) {
    throw new Error('No edits or additions provided.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('edits', JSON.stringify(edits || []));
  formData.append('additions', JSON.stringify(additions || []));

  const response = await fetch(`${API_BASE_URL}/api/edit-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Server failed to edit PDF.');
  }

  const pdfBlob = await response.blob();
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  return {
    blob: pdfBlob,
    filename: `${baseName}_edited.pdf`,
    originalSize: file.size,
    compressedSize: pdfBlob.size,
  };
}