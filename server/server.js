'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { validatePayload, computeStudentResults } = require('./compute');
const { generateStudentExcel } = require('./excel');
const { sendEmail } = require('./mailer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to dry-run true for safety
const API_KEY = process.env.API_KEY ;

// Hardcoded server-side allowlist - ONLY these 6 students can receive emails
const ALLOWED_REG_NOS = new Set(['26104043', '26104050', '26104070', '26104059', '26104073', '26104079']);

// Full student list for registration and name validation
const STUDENTS = [
  ['26104043', 'PON RAJESH M'], ['26104045', 'MEENU ROSHINI M P'], ['26104046', 'LEVINA AINSLEY N'],
  ['26104047', 'PREETHIGAA V'], ['26104048', 'HARINI P'], ['26104049', 'NAVRUDHAA S'],
  ['26104050', 'ADHI HARIJITH S K'], ['26104051', 'BEAULAH P'], ['26104052', 'KAMALINATCHIYAR R'],
  ['26104053', 'BHARGAVI M'], ['26104054', 'MUTHUMARI L'], ['26104055', 'ROOHI P S'],
  ['26104056', 'MUTHUVARSHA C'], ['26104057', 'RISHITH C R'], ['26104058', 'MAHALAKSHMI S'],
  ['26104059', 'SAMUVEL M'], ['26104060', 'RENUJA R'], ['26104061', 'MANORANJANI DEVI S'],
  ['26104062', 'RIMONA V'], ['26104063', 'HUMAIRAH FATEMA S'], ['26104064', 'ABHINAYAA A'],
  ['26104065', 'ANEKSHA PRABHAKAR'], ['26104066', 'POORNIMA DEVI G'], ['26104067', 'AJAY U'],
  ['26104068', 'KULANDAI ANANTHAN R'], ['26104069', 'DEVI SRI S'], ['26104070', 'SAKTHEESH M'],
  ['26104071', 'KIRUTHIKA P'], ['26104072', 'NEHA SHREE A'], ['26104073', 'SERANTHAYAN A'],
  ['26104074', 'VANI S'], ['26104075', 'RENUKASRI R S'], ['26104076', 'NELASREE S'],
  ['26104077', 'INDHUDEVI S'], ['26104078', 'SHREEJA S'], ['26104079', 'MANOJKUMAR V'],
  ['26104080', 'SUBA LAKSHMI R'], ['26104081', 'LAKSHITHA K'], ['26104082', 'KARPAGASELVI N'],
  ['26104083', 'CHANDRU S'], ['26104084', 'JAYASHREE K'], ['26104128', 'DHARUN KANNAN A']
];
const STUDENT_MAP = new Map(STUDENTS.map(s => [s[0], s[1]]));

// Security & utility middleware
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

// Rate limit: max 5 email requests per 15 minutes per IP
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many email requests. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// In-flight concurrency lock to prevent duplicate sends caused by double clicking
let sendInProgress = false;

// API key authentication middleware
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!API_KEY) {
    return res.status(500).json({ error: 'Server API_KEY is not configured.' });
  }
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key.' });
  }
  next();
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dryRun: DRY_RUN,
    allowedRecipients: Array.from(ALLOWED_REG_NOS).map(reg => `${reg}@nec.edu.in`)
  });
});

// POST /api/send-emails
app.post('/api/send-emails', emailLimiter, requireApiKey, async (req, res) => {
  if (sendInProgress) {
    return res.status(429).json({ error: 'An email send operation is currently in progress. Please wait.' });
  }
  sendInProgress = true;

  try {
    
const { marks, meta, testRecipient } = req.body;

// If testRecipient is provided, allow only an approved registration number.
if (
  testRecipient !== undefined &&
  !ALLOWED_REG_NOS.has(String(testRecipient))
) {
  return res.status(400).json({
    error: 'Invalid testRecipient. Use one of the approved registration numbers.'
  });
}

const recipientsToProcess = testRecipient !== undefined
  ? [String(testRecipient)]
  : ALLOWED_REG_NOS;


    // Validate request body
    const validation = validatePayload(marks, STUDENT_MAP);
    if (validation.errors.length > 0) {
      return res.status(400).json({ error: 'Payload validation failed', details: validation.errors });
    }

    const results = [];

    // Strictly process ONLY the 6 allowed students
    for (const regNo of recipientsToProcess) { 
      const studentName = STUDENT_MAP.get(regNo);
      if (!studentName) {
        results.push({
          regNo,
          status: 'error',
          message: `Registration number ${regNo} does not match any student in the official name list. Email halted.`
        });
        continue;
      }

      const email = `${regNo}@nec.edu.in`;

      try {
        // Compute this student's results using exact calculator formulas
        const studentResults = computeStudentResults(regNo, marks);

        // Generate isolated, individual Excel file containing ONLY this student's data
        const excelBuffer = await generateStudentExcel(regNo, studentName, studentResults, meta);

        if (DRY_RUN) {
          // Dry-run mode: Save to dry-run-output/ directory for inspection without sending email
          const outDir = path.join(__dirname, 'dry-run-output');
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          const safeName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
          const filePath = path.join(outDir, `${regNo}_${safeName}.xlsx`);
          fs.writeFileSync(filePath, excelBuffer);

          results.push({
            regNo,
            name: studentName,
            email,
            status: 'dry-run',
            message: `Dry-run preview: Excel generated and saved locally to server/dry-run-output/ (no email sent).`,
            filePath: path.relative(path.resolve(__dirname, '..'), filePath),
            hasIncompleteData: studentResults.hasIncompleteData,
            incompleteDetails: studentResults.incompleteDetails || null
          });
        } else {
          // Live send mode
          const sendResult = await sendEmail({
            to: email,
            subject: `CO Attainment Report – ${(meta && meta.course) || 'Course'} – ${studentName}`,
            studentName,
            regNo,
            studentResults,
            meta,
            excelBuffer,
            fileName: `CO-Attainment-${regNo}.xlsx`
          });

          results.push({
            regNo,
            name: studentName,
            email,
            status: 'sent',
            message: `Submitted to SMTP server (MessageId: ${sendResult.messageId}). Note: Successful SMTP submission indicates acceptance by provider, not guaranteed inbox delivery.`,
            hasIncompleteData: studentResults.hasIncompleteData,
            incompleteDetails: studentResults.incompleteDetails || null
          });
        }
      } catch (err) {
        results.push({
          regNo,
          name: studentName,
          email,
          status: 'error',
          message: `Processing failed: ${err.message}`
        });
      }
    }

    res.json({
      dryRun: DRY_RUN,
      timestamp: new Date().toISOString(),
      recipientCount: results.length,
      results
    });
  } catch (err) {
    console.error('send-emails error:', err.message);
    res.status(500).json({ error: 'Internal server error processing email request.' });
  } finally {
    sendInProgress = false;
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`CO Attainment Email Server running on http://localhost:${PORT}`);
    console.log(`Dry-run mode: ${DRY_RUN}`);
    console.log(`Allowed test recipients (${ALLOWED_REG_NOS.size}): ${Array.from(ALLOWED_REG_NOS).map(r => r + '@nec.edu.in').join(', ')}`);
  });
}

module.exports = { app, ALLOWED_REG_NOS, STUDENT_MAP, STUDENTS };

