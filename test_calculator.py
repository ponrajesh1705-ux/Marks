import re
import unittest
from pathlib import Path

import js2py


ROOT = Path(__file__).resolve().parent
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')


def load_context():
    scripts = re.findall(r'<script>([\s\S]*?)</script>', HTML)
    if len(scripts) < 2:
        raise AssertionError('Expected at least two script blocks in index.html')
    ctx = js2py.EvalJs()
    ctx.execute('var window = this; var globalThis = this; var module = { exports: {} };')
    for script in scripts[:2]:
        ctx.execute(script)
    return ctx


class CalculatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = load_context()

    def test_students_list_loaded(self):
        students = self.ctx.eval('STUDENTS')
        self.assertGreater(len(students), 20)
        self.assertEqual(students[0][0], '26104043')
        self.assertEqual(students[0][1], 'PON RAJESH M')

    def test_parse_handles_blank_invalid_and_valid_inputs(self):
        self.assertEqual(self.ctx.eval("CO.parse('')")['s'], 'blank')
        self.assertEqual(self.ctx.eval("CO.parse('   ' )")['s'], 'blank')
        self.assertEqual(self.ctx.eval("CO.parse('42')")['s'], 'ok')
        self.assertEqual(self.ctx.eval("CO.parse('42')")['n'], 42)
        self.assertEqual(self.ctx.eval("CO.parse('101')")['s'], 'invalid')
        self.assertEqual(self.ctx.eval("CO.parse('-1')")['s'], 'invalid')
        self.assertEqual(self.ctx.eval("CO.parse('abc')")['s'], 'invalid')

    def test_co_score_matches_weight_formula(self):
        self.assertEqual(self.ctx.eval("CO.coScore('CO1', [80, 60, 30])"), 69)
        self.assertEqual(self.ctx.eval("CO.coScore('CO3', [100, 50, 20])"), 74)
        self.assertEqual(self.ctx.eval("CO.coScore('CO5', [90, 40, 10])"), 67)
        self.assertIsNone(self.ctx.eval("CO.coScore('CO2', [80, 'oops', 25])"))
        self.assertIsNone(self.ctx.eval("CO.coScore('CO4', [120, 40, 50])"))

    def test_stats_matches_threshold_and_average_logic(self):
        result = self.ctx.eval("CO.stats([10, 80, 95, 70, 80])")
        self.assertEqual(result['n'], 5)
        self.assertEqual(result['avg'], 67)
        self.assertEqual(result['count'], 3)
        self.assertEqual(result['pct'], 60)
        self.assertEqual(result['rel'], 67)

    def test_overall_stats_and_student_average_work(self):
        self.assertEqual(self.ctx.eval("CO.overallStudent([75, 82, 90, 68, 74])"), 77.8)
        overall = self.ctx.eval("CO.overallStats([{ avg: 67, count: 3, pct: 60, rel: 67 }, { avg: 72, count: 4, pct: 80, rel: 72 }, { avg: 64, count: 2, pct: 40, rel: 64 }, { avg: 70, count: 3, pct: 60, rel: 70 }, { avg: 76, count: 4, pct: 80, rel: 76 }])")
        self.assertEqual(overall['avg'], 69.8)
        self.assertEqual(overall['target'], 100)
        self.assertEqual(overall['threshold'], 70)
        self.assertEqual(overall['count'], 3.2)
        self.assertEqual(overall['pct'], 64)
        self.assertEqual(overall['rel'], 69.8)


if __name__ == '__main__':
    unittest.main(verbosity=2)
