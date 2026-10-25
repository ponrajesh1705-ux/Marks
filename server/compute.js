'use strict';

var COS = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'];
var W = { CO1: [60, 30, 10], CO2: [60, 30, 10], CO3: [60, 20, 20], CO4: [60, 20, 20], CO5: [60, 30, 10] };
var TARGET = 100;
var THRESHOLD = 70;

var TOOLS = {
  CO1: ['CAT', 'MCQ (Cognitive)', 'Viva (Affective)'],
  CO2: ['CAT', 'Assignment (Cognitive)', 'Viva (Affective)'],
  CO3: ['CAT', 'MCQ (Cognitive)', 'Presentation'],
  CO4: ['CAT', 'Assignment (Cognitive)', 'Presentation'],
  CO5: ['CAT', 'Assignment (Cognitive)', 'Viva (Affective)']
};

function parse(v) {
  if (v === null || v === undefined || String(v).trim() === '') return { s: 'blank' };
  var n = Number(String(v).trim());
  if (!isFinite(n) || n < 0 || n > 100) return { s: 'invalid' };
  return { s: 'ok', n: n };
}

function coScore(co, marks) {
  var w = W[co];
  var p = [parse(marks[0]), parse(marks[1]), parse(marks[2])];
  for (var i = 0; i < 3; i++) {
    if (p[i].s !== 'ok') return null;
  }
  return ((p[0].n / 100) * w[0]) + ((p[1].n / 100) * w[1]) + ((p[2].n / 100) * w[2]);
}

function hasStudent(studentMap, regNo) {
  if (studentMap && typeof studentMap.has === 'function') {
    return studentMap.has(regNo);
  }
  return !!(studentMap && (regNo in studentMap || studentMap[regNo]));
}

function validatePayload(marks, studentMap) {
  var errors = [];
  if (!marks || typeof marks !== 'object') {
    errors.push('marks must be an object with CO keys.');
    return { errors: errors };
  }
  for (var c = 0; c < COS.length; c++) {
    var co = COS[c];
    if (marks[co] && typeof marks[co] === 'object') {
      var keys = Object.keys(marks[co]);
      for (var k = 0; k < keys.length; k++) {
        var regNo = keys[k];
        var vals = marks[co][regNo];
        if (!hasStudent(studentMap, regNo)) {
          errors.push('Unknown registration number "' + regNo + '" in ' + co + '.');
        }
        if (!Array.isArray(vals) || vals.length !== 3) {
          errors.push(co + '/' + regNo + ': marks must be an array of 3 values.');
        } else {
          for (var i = 0; i < 3; i++) {
            var p = parse(vals[i]);
            if (p.s === 'invalid') {
              errors.push(co + '/' + regNo + '[' + i + ']: invalid mark value "' + vals[i] + '".');
            }
          }
        }
      }
    }
  }
  return { errors: errors };
}

function computeStudentResults(regNo, marks) {
  var coResults = {};
  var incompleteDetails = [];
  var hasIncompleteData = false;

  for (var c = 0; c < COS.length; c++) {
    var co = COS[c];
    var studentMarks = (marks[co] && marks[co][regNo]) || ['', '', ''];
    var tools = TOOLS[co];
    var weights = W[co];
    var score = coScore(co, studentMarks);

    var parsedMarks = studentMarks.map(function (m, i) {
      var p = parse(m);
      return {
        tool: tools[i],
        weight: weights[i],
        rawValue: m,
        value: p.s === 'ok' ? p.n : null,
        status: p.s
      };
    });

    if (score === null) {
      hasIncompleteData = true;
      var missing = parsedMarks.filter(function (m) { return m.status !== 'ok'; }).map(function (m) { return m.tool; });
      incompleteDetails.push(co + ': missing or invalid marks for ' + missing.join(', '));
    }

    coResults[co] = {
      marks: parsedMarks,
      score: score,
      scoreRounded: score !== null ? Math.round(score) : null
    };
  }

  var allScores = COS.map(function (co) { return coResults[co].score; });
  var overallScore = allScores.every(function (s) { return s !== null; })
    ? allScores.reduce(function (a, b) { return a + b; }, 0) / allScores.length
    : null;

  return {
    coResults: coResults,
    overallScore: overallScore,
    overallScoreRounded: overallScore !== null ? Math.round(overallScore) : null,
    hasIncompleteData: hasIncompleteData,
    incompleteDetails: incompleteDetails.length > 0 ? incompleteDetails : null,
    target: TARGET,
    threshold: THRESHOLD
  };
}

module.exports = {
  COS: COS,
  W: W,
  TARGET: TARGET,
  THRESHOLD: THRESHOLD,
  TOOLS: TOOLS,
  parse: parse,
  coScore: coScore,
  validatePayload: validatePayload,
  computeStudentResults: computeStudentResults
};

