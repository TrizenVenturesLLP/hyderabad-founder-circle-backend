import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE_PATH = resolve(
  BACKEND_ROOT,
  "src",
  "assets",
  "second-round-selection-certificate.png",
);
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 867.4;
const NAME_TOP = 53;
let browserPromise;
let templateDataPromise;

async function getTemplateDataUri() {
  if (!templateDataPromise) {
    templateDataPromise = readFile(TEMPLATE_PATH)
      .then((buffer) => `data:image/png;base64,${buffer.toString("base64")}`)
      .catch((error) => {
        templateDataPromise = null;
        throw new Error(`Could not read the second-round certificate template: ${error.message}`);
      });
  }
  return templateDataPromise;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })
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

export async function generateRound2SelectionCertificatePdf(participantName) {
  const name = String(participantName || "").trim();
  if (!name) throw new Error("Participant name is required to generate a certificate.");
  if (name.length > 300) throw new Error("Participant name exceeds the 300-character limit.");

  const [browser, templateDataUri] = await Promise.all([getBrowser(), getTemplateDataUri()]);
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1054, height: 1536, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        @page { size: ${PAGE_WIDTH}pt ${PAGE_HEIGHT}pt; margin: 0; }
        * { box-sizing: border-box; }
        html, body { width: ${PAGE_WIDTH}pt; height: ${PAGE_HEIGHT}pt; margin: 0; overflow: hidden; }
        #certificate { position: relative; width: 100%; height: 100%; }
        #template { position: absolute; inset: 0; width: 100%; height: 100%; }
        #participant-name {
          position: absolute; top: ${NAME_TOP}%; left: 50%; width: 82%;
          transform: translate(-50%, -50%); color: #08163f;
          font: 700 30pt Georgia, "Times New Roman", serif;
          line-height: 1.1; text-align: center; white-space: nowrap;
        }
      </style></head><body><main id="certificate">
        <img id="template" src="${templateDataUri}" alt="">
        <div id="participant-name"></div>
      </main><script>
        const nameNode = document.getElementById("participant-name");
        nameNode.textContent = ${JSON.stringify(name)};
        let fontSize = 30;
        while (nameNode.scrollWidth > nameNode.clientWidth && fontSize > 18) {
          fontSize -= 0.5;
          nameNode.style.fontSize = fontSize + "pt";
        }
        document.getElementById("template").decode();
      </script></body></html>`,
      { waitUntil: "load" },
    );
    return Buffer.from(
      await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      }),
    );
  } finally {
    await page.close();
  }
}

export async function closeRound2CertificateBrowser() {
  if (!browserPromise) return;
  const currentBrowser = browserPromise;
  browserPromise = null;
  try {
    await (await currentBrowser).close();
  } catch (error) {
    console.error("[round-2 certificates] Could not close Puppeteer:", error);
  }
}
