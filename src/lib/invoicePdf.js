import PDFDocument from "pdfkit";

/**
 * Generates a clean Tax Invoice PDF.
 * Table columns: # | Description | HSN/SAC | Qty. | Fee (INR)
 * Summary block: Fee (INR) + Total
 *
 * @param {object} opts
 * @param {string} opts.invoiceNumber
 * @param {Date}   opts.invoiceDate
 * @param {string} opts.billToName
 * @param {string} [opts.billToEmail]
 * @param {string} [opts.eventTitle]
 * @param {number} opts.amountInr       Total charged in INR
 * @returns {Promise<Buffer>}
 */
export async function generateInvoicePdf(opts) {
  const {
    invoiceNumber,
    invoiceDate,
    billToName,
    billToEmail = "",
    eventTitle = "",
    amountInr,
  } = opts;

  const total = Math.round((Number(amountInr) || 0) * 100) / 100;
  const fmt   = (n) => n.toFixed(2);

  const formattedDate = new Date(invoiceDate || new Date()).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Page metrics ────────────────────────────────────────────────────────
    const ML    = 50;
    const MR    = 50;
    const CW    = doc.page.width - ML - MR;   // 495.28
    const RIGHT = ML + CW;                     // 545.28

    // ── Colours ─────────────────────────────────────────────────────────────
    const C_BLACK = "#000000";
    const C_DARK  = "#1a1a2e";
    const C_GREY  = "#555555";
    const C_HDRFG = "#ffffff";
    const C_HDRBG = "#1a1a2e";
    const C_ROWBG = "#f9f9f9";
    const C_TOTBG = "#e2e2e2";
    const C_LINE  = "#cccccc";

    // ── Helpers ──────────────────────────────────────────────────────────────
    const hline = (y, color = C_LINE, lw = 0.5) =>
      doc.moveTo(ML, y).lineTo(RIGHT, y).strokeColor(color).lineWidth(lw).stroke();

    const rtxt = (text, x, y, w, extra = {}) =>
      doc.text(text, x, y, { width: w, align: "right", lineBreak: false, ...extra });

    const ctxt = (text, x, y, w, extra = {}) =>
      doc.text(text, x, y, { width: w, align: "center", lineBreak: false, ...extra });

    // ────────────────────────────────────────────────────────────────────────
    //  SECTION 1 — Header
    // ────────────────────────────────────────────────────────────────────────
    let y = 50;

    doc.font("Helvetica-Bold").fontSize(13).fillColor(C_BLACK);
    doc.text("Hyderabad Founders Network", ML, y, { lineBreak: false });

    doc.font("Helvetica").fontSize(9).fillColor(C_GREY);
    doc.text("No. 1-90/HFC/201, 2nd Floor, HFC Colony,", ML, y + 18, { lineBreak: false });
    doc.text("Kondapur, Hyderabad, Telangana 500084",      ML, y + 30, { lineBreak: false });
    doc.text("India",                                       ML, y + 42, { lineBreak: false });
    doc.text("GST No: 36AAKCT2345B1ZX",                    ML, y + 54, { lineBreak: false });

    doc.font("Helvetica-Bold").fontSize(16).fillColor(C_DARK);
    rtxt("Invoice", ML, y, CW);

    doc.font("Helvetica").fontSize(9).fillColor(C_GREY);
    rtxt(`Invoice Number: ${invoiceNumber}`, ML, y + 24, CW);
    rtxt(`Date: ${formattedDate}`,           ML, y + 37, CW);

    // ────────────────────────────────────────────────────────────────────────
    //  SECTION 2 — Bill To + Place of Supply
    // ────────────────────────────────────────────────────────────────────────
    y += 80;
    hline(y);

    y += 18;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C_BLACK);
    doc.text("Bill To", ML, y, { lineBreak: false });

    y += 15;
    doc.font("Helvetica").fontSize(10).fillColor(C_GREY);
    doc.text(billToName || "Guest", ML, y, { lineBreak: false });

    if (billToEmail) {
      y += 13;
      doc.text(billToEmail, ML, y, { lineBreak: false });
    }

    y += 26;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C_BLACK);
    doc.text("Place of Supply: ", ML, y, { continued: true, lineBreak: false });
    doc.font("Helvetica").fillColor(C_GREY).text("Telangana", { lineBreak: false });

    // ────────────────────────────────────────────────────────────────────────
    //  SECTION 3 — Table
    //  Columns (offset from ML):
    //    #        : 0   → w 18
    //    Desc     : 22  → w 295   (wide — takes up freed GST space)
    //    HSN/SAC  : 322 → w 60
    //    Qty.     : 387 → w 28
    //    Fee (INR): 420 → w 75   (right edge = 495 = CW)
    // ────────────────────────────────────────────────────────────────────────
    const COL = {
      numX:  ML,        numW:  18,
      descX: ML + 22,   descW: 295,
      hsnX:  ML + 322,  hsnW:  60,
      qtyX:  ML + 387,  qtyW:  28,
      feeX:  ML + 420,  feeW:  63,   // 8px right padding kept before edge
    };

    y += 26;
    const HDR_H = 32;

    doc.rect(ML, y, CW, HDR_H).fill(C_HDRBG);

    const hy = y + 11;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C_HDRFG);
    ctxt("#",          COL.numX,  hy, COL.numW);
    doc.text("Description", COL.descX, hy, { lineBreak: false });
    ctxt("HSN/SAC",    COL.hsnX,  hy, COL.hsnW);
    ctxt("Qty.",       COL.qtyX,  hy, COL.qtyW);
    rtxt("Fee (INR)",  COL.feeX,  hy, COL.feeW);

    // ── Data row ─────────────────────────────────────────────────────────────
    y += HDR_H;

    const descLine2 = `Processing Fee towards the ticket for ${eventTitle}`;
    const ROW_PAD = 10;
    const LINE_H  = 13;
    const ROW_H   = ROW_PAD + LINE_H + LINE_H + ROW_PAD;

    doc.rect(ML, y, CW, ROW_H).fill(C_ROWBG);

    const ry = y + ROW_PAD;

    doc.font("Helvetica").fontSize(9).fillColor(C_BLACK);
    ctxt("1", COL.numX, ry, COL.numW);

    doc.font("Helvetica-Bold").fontSize(9).fillColor(C_BLACK);
    doc.text("Hyderabad Founders Network Fees", COL.descX, ry, { width: COL.descW, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(C_GREY);
    doc.text(descLine2, COL.descX, ry + LINE_H, { width: COL.descW, lineBreak: false });

    doc.font("Helvetica").fontSize(9).fillColor(C_BLACK);
    ctxt("998554", COL.hsnX, ry, COL.hsnW);
    ctxt("1",      COL.qtyX, ry, COL.qtyW);
    rtxt(fmt(total), COL.feeX, ry, COL.feeW);

    y += ROW_H;
    hline(y, C_LINE, 0.4);

    // ────────────────────────────────────────────────────────────────────────
    //  SECTION 4 — Notes (left) + Total (right)
    // ────────────────────────────────────────────────────────────────────────
    y += 24;

    // Notes
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C_BLACK);
    doc.text("Note:", ML, y, { lineBreak: false });
    doc.font("Helvetica").fontSize(8.5).fillColor(C_GREY);
    doc.text("1. This is an auto-generated invoice and does not require signature.", ML, y + 14, { width: 280, lineBreak: false });
    doc.text("2. Whether Reverse Charge Applicable: No",                             ML, y + 27, { width: 280, lineBreak: false });
    doc.text("3. For any queries, contact community@trizenventures.com",              ML, y + 40, { width: 280, lineBreak: false });

    // Total block — right side, just one row
    const SUM_LABELX = RIGHT - 190;
    const SUM_LABELW = 100;
    const SUM_VALX   = RIGHT - 83;   // 8px right padding
    const SUM_VALW   = 71;

    // Total row with shaded background
    const TOTAL_BOX_X = SUM_LABELX - 10;
    const TOTAL_BOX_W = SUM_LABELW + SUM_VALW + 20;
    const TOTAL_BOX_H = 26;

    const ty = y + 8;
    doc.rect(TOTAL_BOX_X, ty - 4, TOTAL_BOX_W, TOTAL_BOX_H).fill(C_TOTBG);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C_BLACK);
    rtxt("Total:",      SUM_LABELX, ty + 3, SUM_LABELW);
    rtxt(fmt(total),    SUM_VALX,   ty + 3, SUM_VALW);

    doc.end();
  });
}
