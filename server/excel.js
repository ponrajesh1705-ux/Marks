'use strict';
const ExcelJS = require('exceljs');
const { COS, TOOLS, W, TARGET, THRESHOLD } = require('./compute');

async function generateStudentExcel(regNo, studentName, results, meta) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CO Attainment Calculator';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('CO Attainment Report');

  sheet.columns = [
    { width: 22 }, // A
    { width: 18 }, // B
    { width: 14 }, // C
    { width: 14 }, // D
  ];

  const titleFont = { bold: true, size: 14 };
  const headerFont = { bold: true, size: 11 };
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDE5E0' } };
  const calcFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEEA' } };
  const thinBorder = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' }
  };

  let row = 1;
  const r1 = sheet.getRow(row);
  r1.getCell(1).value = 'NATIONAL ENGINEERING COLLEGE, K.R. NAGAR, KOVILPATTI - 628503';
  r1.getCell(1).font = titleFont;
  row++;

  const r2 = sheet.getRow(row);
  r2.getCell(1).value = 'Individual CO Attainment Report';
  r2.getCell(1).font = titleFont;
  row += 2;

  const infoRows = [
    ['Course', (meta && meta.course) || '(not specified)'],
    ['Year / Semester / Section', (meta && meta.year) || 'I CSE - B'],
    ['Registration Number', regNo],
    ['Student Name', studentName],
  ];
  for (const [label, value] of infoRows) {
    const r = sheet.getRow(row);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true };
    r.getCell(2).value = value;
    r.getCell(1).border = thinBorder;
    r.getCell(2).border = thinBorder;
    row++;
  }
  row++;

  // CO detail table header
  const hdr = sheet.getRow(row);
  ['Assessment', 'Tool', 'Weight (%)', 'Mark (%)'].forEach((h, i) => {
    const c = hdr.getCell(i + 1);
    c.value = h;
    c.font = headerFont;
    c.fill = headerFill;
    c.border = thinBorder;
    c.alignment = { horizontal: 'center', wrapText: true };
  });
  row++;

  for (const co of COS) {
    const coData = results.coResults[co];

    for (let i = 0; i < 3; i++) {
      const r = sheet.getRow(row);
      if (i === 0) {
        r.getCell(1).value = co;
        r.getCell(1).font = { bold: true };
      }
      r.getCell(1).border = thinBorder;
      r.getCell(2).value = coData.marks[i].tool;
      r.getCell(2).border = thinBorder;
      r.getCell(3).value = coData.marks[i].weight;
      r.getCell(3).border = thinBorder;
      r.getCell(3).alignment = { horizontal: 'center' };
      r.getCell(4).value = coData.marks[i].value !== null ? coData.marks[i].value : '\u2013';
      r.getCell(4).border = thinBorder;
      r.getCell(4).alignment = { horizontal: 'center' };
      if (coData.marks[i].status !== 'ok') {
        r.getCell(4).font = { color: { argb: 'FFB3261E' }, italic: true };
      }
      row++;
    }

    // CO attainment row
    const attRow = sheet.getRow(row);
    attRow.getCell(1).value = `${co} Attainment`;
    attRow.getCell(1).font = headerFont;
    attRow.getCell(1).border = thinBorder;
    attRow.getCell(2).border = thinBorder;
    attRow.getCell(3).border = thinBorder;
    attRow.getCell(4).value = coData.score !== null ? Math.round(coData.score * 100) / 100 : 'Incomplete';
    attRow.getCell(4).border = thinBorder;
    attRow.getCell(4).fill = calcFill;
    attRow.getCell(4).font = coData.score !== null ? { bold: true } : { bold: true, color: { argb: 'FFB3261E' } };
    attRow.getCell(4).alignment = { horizontal: 'center' };
    row++;
    row++; // spacer
  }

  // Overall summary
  row++;
  const summaryHeader = sheet.getRow(row);
  summaryHeader.getCell(1).value = 'Overall Attainment Summary';
  summaryHeader.getCell(1).font = titleFont;
  row += 2;

  const sumHdr = sheet.getRow(row);
  ['CO', 'Attainment Score', 'Target', 'Status'].forEach((h, i) => {
    const c = sumHdr.getCell(i + 1);
    c.value = h;
    c.font = headerFont;
    c.fill = headerFill;
    c.border = thinBorder;
    c.alignment = { horizontal: 'center' };
  });
  row++;

  for (const co of COS) {
    const coData = results.coResults[co];
    const r = sheet.getRow(row);
    r.getCell(1).value = co;
    r.getCell(1).border = thinBorder;
    r.getCell(1).font = { bold: true };
    r.getCell(2).value = coData.score !== null ? Math.round(coData.score * 100) / 100 : 'Incomplete';
    r.getCell(2).border = thinBorder;
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(3).value = TARGET;
    r.getCell(3).border = thinBorder;
    r.getCell(3).alignment = { horizontal: 'center' };
    let status = 'Incomplete';
    if (coData.score !== null) {
      status = coData.score > THRESHOLD ? 'Attained' : 'Not Attained';
    }
    r.getCell(4).value = status;
    r.getCell(4).border = thinBorder;
    r.getCell(4).alignment = { horizontal: 'center' };
    if (status === 'Attained') {
      r.getCell(4).font = { color: { argb: 'FF1F5D4A' }, bold: true };
    } else if (status === 'Not Attained') {
      r.getCell(4).font = { color: { argb: 'FFB3261E' } };
    } else {
      r.getCell(4).font = { italic: true, color: { argb: 'FF999999' } };
    }
    row++;
  }

  row++;
  const overallRow = sheet.getRow(row);
  overallRow.getCell(1).value = 'Overall Average';
  overallRow.getCell(1).font = { bold: true, size: 12 };
  overallRow.getCell(1).border = thinBorder;
  overallRow.getCell(2).value = results.overallScore !== null
    ? Math.round(results.overallScore * 100) / 100
    : 'Incomplete (not all COs have marks)';
  overallRow.getCell(2).font = { bold: true, size: 12 };
  overallRow.getCell(2).border = thinBorder;
  overallRow.getCell(2).fill = calcFill;
  overallRow.getCell(2).alignment = { horizontal: 'center' };
  overallRow.getCell(3).border = thinBorder;
  overallRow.getCell(4).border = thinBorder;

  row += 2;
  if (results.hasIncompleteData && results.incompleteDetails) {
    const warnRow = sheet.getRow(row);
    warnRow.getCell(1).value = 'Note: Some data is incomplete:';
    warnRow.getCell(1).font = { italic: true, color: { argb: 'FFB3261E' } };
    row++;
    for (const detail of results.incompleteDetails) {
      const dRow = sheet.getRow(row);
      dRow.getCell(1).value = '  \u2022 ' + detail;
      dRow.getCell(1).font = { italic: true, color: { argb: 'FF999999' } };
      row++;
    }
  }

  row += 2;
  const footRow = sheet.getRow(row);
  footRow.getCell(1).value = `Generated on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
  footRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF999999' } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { generateStudentExcel };

