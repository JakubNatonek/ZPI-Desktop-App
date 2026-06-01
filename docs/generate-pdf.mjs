import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'dokumentacja.html');
const pdfPath = path.join(__dirname, 'ZPI-Desktop-Dokumentacja.pdf');

const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });

// Emuluj media "print" aby aktywować @media print style
await page.emulateMediaType('print');

await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div style="font-size:8pt;color:#aaa;width:100%;text-align:center;padding-top:4mm;font-family:Arial">ZPI-Desktop-App — Dokumentacja Techniczna</div>',
  footerTemplate: '<div style="font-size:8pt;color:#aaa;width:100%;text-align:center;padding-bottom:4mm;font-family:Arial"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});

await browser.close();
console.log('✅ PDF wygenerowany:', pdfPath);
