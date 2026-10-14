import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const BACKEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATE_DIRECTORY = resolve(BACKEND_ROOT, "src", "assets", "winner-certificates");
const PAGE_WIDTH = 595.28;
let browserPromise;
const templateDataPromises = new Map();

async function getTemplateData(rank) {
  const cacheKey = rank ?? "generic";
  if (!templateDataPromises.has(cacheKey)) {
    const ordinal = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : null;
    const templatePath = ordinal
      ? resolve(TEMPLATE_DIRECTORY, `${ordinal}.png`)
      : resolve(BACKEND_ROOT, "src", "assets", "winner-certificate-template.png");
    templateDataPromises.set(
      cacheKey,
      readFile(templatePath)
        .then((buffer) => ({
          dataUri: `data:image/png;base64,${buffer.toString("base64")}`,
          width: buffer.readUInt32BE(16),
          height: buffer.readUInt32BE(20),
        }))
        .catch((error) => {
          templateDataPromises.delete(cacheKey);
          const templateName = ordinal ? `${ordinal}-place` : "generic";
          throw new Error(
            `Could not read the ${templateName} winner certificate template: ${error.message}`,
          );
        }),
    );
  }
  return templateDataPromises.get(cacheKey);
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

export async function generateHackathonWinnerCertificatePdf(teamName, domainName, rank) {
  const name = String(teamName || "").trim();
  const domain = String(domainName || "").trim();
  const placement = rank == null ? null : Number(rank);
  if (!name) throw new Error("Team name is required to generate a winner certificate.");
  if (name.length > 300) throw new Error("Team name exceeds the 300-character limit.");
  if (!domain) throw new Error("Domain name is required to generate a winner certificate.");
  if (domain.length > 100) throw new Error("Domain name exceeds the 100-character limit.");
  if (placement !== null && ![1, 2, 3].includes(placement)) {
    throw new Error("Winner certificate placement must be 1, 2, or 3.");
  }

  const [{ dataUri, width, height }, browser] = await Promise.all([
    getTemplateData(placement),
    getBrowser(),
  ]);
  const page = await browser.newPage();
  try {
    const pageWidth = PAGE_WIDTH;
    const pageHeight = (PAGE_WIDTH * height) / width;
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        @page { size: ${pageWidth}pt ${pageHeight}pt; margin: 0; }
        * { box-sizing: border-box; }
        html, body { width: ${pageWidth}pt; height: ${pageHeight}pt; margin: 0; overflow: hidden; }
        #certificate { position: relative; width: 100%; height: 100%; }
        #template { position: absolute; inset: 0; width: 100%; height: 100%; }
        #team-name {
          position: absolute; top: 53%; left: 50%; width: 78%; height: 5%;
          transform: translate(-50%, -50%); color: #08163f;
          font: 700 34pt Georgia, "Times New Roman", serif;
          line-height: 1.1; text-align: center; white-space: nowrap;
          display: flex; align-items: center; justify-content: center;
        }
        #domain-name {
          position: absolute; top: 60.5%; left: 55.5%; width: 32%; height: 3.2%;
          transform: translate(-50%, -50%); color: #08163f;
          font: 700 15pt Georgia, "Times New Roman", serif;
          line-height: 1; text-align: center; white-space: nowrap;
          display: flex; align-items: center; justify-content: center;
        }
      </style></head><body><main id="certificate">
        <img id="template" src="${dataUri}" alt="">
        ${placement ? '<div id="team-name"></div>' : ""}
        <div id="domain-name"></div>
      </main><script>
        const teamNode = document.getElementById("team-name");
        const domainNode = document.getElementById("domain-name");
        if (teamNode) teamNode.textContent = ${JSON.stringify(name)};
        domainNode.textContent = ${JSON.stringify(domain)};
        if (teamNode) {
          let fontSize = 34;
          while (teamNode.scrollWidth > teamNode.clientWidth && fontSize > 20) {
            fontSize -= 0.5;
            teamNode.style.fontSize = fontSize + "pt";
          }
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

export async function closeWinnerCertificateBrowser() {
  if (!browserPromise) return;
  const currentBrowser = browserPromise;
  browserPromise = null;
  try {
    await (await currentBrowser).close();
  } catch (error) {
    console.error("[winner certificates] Could not close Puppeteer:", error);
  }
}
