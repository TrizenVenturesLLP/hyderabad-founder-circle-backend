import assert from "node:assert/strict";
import { after } from "node:test";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  closeWinnerCertificateBrowser,
  generateHackathonWinnerCertificatePdf,
} from "./hackathonWinnerCertificatePdf.js";

after(async () => {
  await closeWinnerCertificateBrowser();
});

test("renders the supplied winner design with team and domain into a single-page PDF", async () => {
  const pdf = await generateHackathonWinnerCertificatePdf("Team Kaizen", "Web Development");
  const document = await PDFDocument.load(pdf);
  const [page] = document.getPages();

  assert.equal(document.getPageCount(), 1);
  assert.ok(Math.abs(page.getWidth() / page.getHeight() - 1054 / 1492) < 0.002);
});

test("requires both a team name and domain name", async () => {
  await assert.rejects(
    generateHackathonWinnerCertificatePdf("", "Web Development"),
    /Team name is required/,
  );
  await assert.rejects(
    generateHackathonWinnerCertificatePdf("Team Kaizen", ""),
    /Domain name is required/,
  );
});
