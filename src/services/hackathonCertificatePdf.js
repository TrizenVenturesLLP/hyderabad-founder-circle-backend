import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import puppeteer from "puppeteer";

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE_PATH =
  process.env.PARTICIPATION_CERTIFICATE_TEMPLATE_PATH ||
  resolve(BACKEND_ROOT, "src", "assets", "participation-certificate-template.pdf");
const NAME_BASELINE_Y = 445;

let templateBufferPromise;
let browserPromise;

async function readTemplate() {
  if (!templateBufferPromise) {
    templateBufferPromise = readFile(resolve(TEMPLATE_PATH)).catch((error) => {
      templateBufferPromise = null;
      throw new Error(
        `Could not read the participation certificate template at ${TEMPLATE_PATH}: ${error.message}`,
      );
    });
  }
  return templateBufferPromise;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      .then((browser) => {
        browser.on("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

async function renderNameOverlay(name, width, height) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            @page { size: ${width}pt ${height}pt; margin: 0; }
            html, body { width: ${width}pt; height: ${height}pt; margin: 0; padding: 0; }
            body { background: transparent; }
            #participant-name {
              position: absolute;
              top: ${height - NAME_BASELINE_Y}pt;
              left: 50%;
              width: ${width - 80}pt;
              height: 74pt;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              transform: translate(-50%, -50%);
              color: #20365e;
              font-family: Arial, Helvetica, sans-serif;
              font-weight: 700;
              text-align: center;
              line-height: 1.08;
              overflow: hidden;
            }
            #participant-name span {
              display: block;
              max-width: 100%;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
          </style>
        </head>
        <body><div id="participant-name"></div></body>
      </html>`,
      { waitUntil: "load" },
    );
    await page.evaluate((participantName) => {
      const container = document.getElementById("participant-name");
      if (!container) throw new Error("Certificate name overlay was not initialized.");

      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Could not measure the certificate participant name.");

      const maxWidth = container.clientWidth;
      const words = participantName.split(/\s+/).filter(Boolean);
      const wrapAt = (fontSize) => {
        context.font = `700 ${fontSize}pt Arial`;
        const lines = [];
        let line = "";

        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (!line || context.measureText(candidate).width <= maxWidth) {
            line = candidate;
            continue;
          }
          lines.push(line);
          line = word;
        }
        if (line) lines.push(line);
        return lines;
      };

      let fontSize = 32;
      let lines = wrapAt(fontSize);
      while (lines.length > 1 && fontSize > 18) {
        fontSize -= 2;
        lines = wrapAt(fontSize);
      }
      if (lines.length > 3) {
        fontSize = Math.max(10, Math.floor(70 / (lines.length * 1.08)));
        lines = wrapAt(fontSize);
      }

      container.style.fontSize = `${fontSize}pt`;
      for (const line of lines) {
        const span = document.createElement("span");
        span.textContent = line;
        container.append(span);
      }
    }, name);

    return Buffer.from(
      await page.pdf({
        printBackground: false,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    );
  } finally {
    await page.close();
  }
}

export async function generateParticipationCertificatePdf(participantName) {
  const name = String(participantName || "").trim();
  if (!name) throw new Error("Participant name is required to generate a certificate.");
  if (name.length > 300) throw new Error("Participant name exceeds the 300-character limit.");

  const template = await PDFDocument.load(await readTemplate());
  const pages = template.getPages();
  if (pages.length !== 1) {
    throw new Error("The participation certificate template must contain exactly one page.");
  }

  const page = pages[0];
  const overlayBuffer = await renderNameOverlay(name, page.getWidth(), page.getHeight());
  const overlay = await PDFDocument.load(overlayBuffer);
  if (overlay.getPageCount() !== 1) {
    throw new Error("Could not generate a single-page participant name overlay.");
  }

  const [overlayPage] = await template.embedPages([overlay.getPages()[0]]);
  const mediaBox = page.getMediaBox();
  page.drawPage(overlayPage, {
    x: mediaBox.x,
    y: mediaBox.y,
    width: page.getWidth(),
    height: page.getHeight(),
  });
  return Buffer.from(await template.save());
}

export async function closeCertificateBrowser() {
  if (!browserPromise) return;
  const currentBrowser = browserPromise;
  browserPromise = null;
  try {
    await (await currentBrowser).close();
  } catch (error) {
    console.error("[hackathon certificates] Could not close Puppeteer:", error);
  }
}
