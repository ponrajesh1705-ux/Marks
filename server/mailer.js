'use strict';
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration incomplete. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

async function sendEmail({ to, subject, studentName, regNo, studentResults, meta, excelBuffer, fileName }) {
  const transport = getTransporter();

  const courseName = (meta && meta.course) || '(Course not specified)';
  const coLines = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map(co => {
    const r = studentResults.coResults[co];
    const score = r.score !== null ? Math.round(r.score) : 'Incomplete';
    return `  ${co}: ${score}`;
  }).join('\n');
  const overall = studentResults.overallScore !== null
    ? Math.round(studentResults.overallScore)
    : 'Incomplete (not all COs have marks)';

  let incompleteNote = '';
  if (studentResults.hasIncompleteData && studentResults.incompleteDetails) {
    incompleteNote = '\n\nNote: Some assessment data is incomplete:\n' +
      studentResults.incompleteDetails.map(d => '  • ' + d).join('\n');
  }

  const text = `Dear ${studentName},

Please find attached your individual Course Outcome (CO) Attainment Report for ${courseName}.

Quick Summary:
${coLines}
  Overall Average: ${overall}
${incompleteNote}

The detailed report with all your individual assessment marks and attainment calculations is in the attached Excel file.

This is an automated notification from the CO Attainment Calculator.
National Engineering College, K.R. Nagar, Kovilpatti – 628503
Department of Science and Humanities`;

  const info = await transport.sendMail({
    from: `"CO Attainment Calculator" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    attachments: [{
      filename: fileName,
      content: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }]
  });

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

module.exports = {
  sendEmail,
  getTransporter,
  verifyConnection: async () => {
    const transport = getTransporter();
    return transport.verify();
  }
};

