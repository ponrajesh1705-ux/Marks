import re
import unittest
from pathlib import Path
import js2py

ROOT = Path(__file__).resolve().parent
COMPUTE_JS = (ROOT / 'server' / 'compute.js').read_text(encoding='utf-8')
SERVER_JS = (ROOT / 'server' / 'server.js').read_text(encoding='utf-8')

def load_compute_context():
    ctx = js2py.EvalJs()
    ctx.execute('var module = { exports: {} };')
    ctx.execute(COMPUTE_JS)
    return ctx

class BackendCalculationAndSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = load_compute_context()

    def test_parse_inputs(self):
        parse = self.ctx.eval('module.exports.parse')
        self.assertEqual(parse('')['s'], 'blank')
        self.assertEqual(parse('  ')['s'], 'blank')
        self.assertEqual(parse(None)['s'], 'blank')
        self.assertEqual(parse('85')['s'], 'ok')
        self.assertEqual(parse('85')['n'], 85)
        self.assertEqual(parse('0')['s'], 'ok')
        self.assertEqual(parse('0')['n'], 0)
        self.assertEqual(parse('100')['s'], 'ok')
        self.assertEqual(parse('100')['n'], 100)
        self.assertEqual(parse('-5')['s'], 'invalid')
        self.assertEqual(parse('105')['s'], 'invalid')
        self.assertEqual(parse('abc')['s'], 'invalid')

    def test_co_score_weights(self):
        coScore = self.ctx.eval('module.exports.coScore')
        # CO1: [60, 30, 10]
        # (80/100)*60 + (90/100)*30 + (70/100)*10 = 48 + 27 + 7 = 82
        self.assertEqual(coScore('CO1', ['80', '90', '70']), 82)
        # CO3: [60, 20, 20]
        # (50/100)*60 + (60/100)*20 + (70/100)*20 = 30 + 12 + 14 = 56
        self.assertEqual(coScore('CO3', ['50', '60', '70']), 56)
        # Incomplete mark
        self.assertIsNone(coScore('CO1', ['80', '', '70']))
        # Invalid mark
        self.assertIsNone(coScore('CO1', ['80', '150', '70']))

    def test_six_student_allowlist_in_server(self):
        # Extract ALLOWED_REG_NOS from server.js
        match = re.search(r"ALLOWED_REG_NOS\s*=\s*new Set\(\[([\s\S]*?)\]\)", SERVER_JS)
        self.assertIsNotNone(match, 'ALLOWED_REG_NOS must be defined in server.js')
        raw_regs = re.findall(r"'(\d+)'", match.group(1))
        expected_regs = ['26104043', '26104050', '26104070', '26104059', '26104073', '26104079']
        self.assertEqual(sorted(raw_regs), sorted(expected_regs), 'Must contain exactly the 6 allowed registration numbers')

    def test_student_data_isolation(self):
        compute = self.ctx.eval('module.exports.computeStudentResults')
        # Simulate entire class marks
        all_marks = {
            'CO1': {
                '26104043': ['80', '90', '70'],
                '26104050': ['60', '70', '80'],
                '26104070': ['95', '85', '75']
            },
            'CO2': {
                '26104043': ['75', '85', '65'],
                '26104050': ['55', '65', '75']
            },
            'CO3': {
                '26104043': ['70', '80', '60']
            },
            'CO4': {
                '26104043': ['60', '70', '50']
            },
            'CO5': {
                '26104043': ['90', '80', '70']
            }
        }

        # Calculate result for student 26104043
        res_43 = compute('26104043', all_marks)
        self.assertEqual(res_43['coResults']['CO1']['score'], 82)
        # Check overall score
        self.assertFalse(res_43['hasIncompleteData'])
        self.assertIsNotNone(res_43['overallScore'])

        # Calculate result for student 26104050 (who has partial marks)
        res_50 = compute('26104050', all_marks)
        self.assertTrue(res_50['hasIncompleteData'])
        self.assertIsNone(res_50['overallScore'])
        self.assertIn('CO3', str(res_50['incompleteDetails']))

        # Verify no cross-contamination: student 26104050's result should not contain 26104043's marks
        co1_marks_50 = [m['value'] for m in res_50['coResults']['CO1']['marks']]
        self.assertEqual(co1_marks_50, [60, 70, 80])

    def test_payload_validation_rejects_unknown_students(self):
        self.ctx.execute('var studentMap = { "26104043": "PON RAJESH M" };')
        res = self.ctx.eval('module.exports.validatePayload({ CO1: { "99999999": ["80", "80", "80"] } }, studentMap)')
        self.assertGreater(len(res['errors']), 0)
        self.assertIn('Unknown registration number', str(res['errors']))

    def test_payload_validation_rejects_invalid_marks(self):
        self.ctx.execute('var studentMap = { "26104043": "PON RAJESH M" };')
        res = self.ctx.eval('module.exports.validatePayload({ CO1: { "26104043": ["80", "150", "80"] } }, studentMap)')
        self.assertGreater(len(res['errors']), 0)
        self.assertIn('invalid mark value', str(res['errors']))

    def test_payload_validation_rejects_non_array(self):
        self.ctx.execute('var studentMap = { "26104043": "PON RAJESH M" };')
        res = self.ctx.eval('module.exports.validatePayload({ CO1: { "26104043": "not-an-array" } }, studentMap)')
        self.assertGreater(len(res['errors']), 0)
        self.assertIn('array of 3 values', str(res['errors']))

    def test_payload_validation_accepts_valid_payload(self):
        self.ctx.execute('var studentMap = { "26104043": "PON RAJESH M" };')
        res = self.ctx.eval('module.exports.validatePayload({ CO1: { "26104043": ["80", "90", "70"] } }, studentMap)')
        self.assertEqual(len(res['errors']), 0)

    def test_all_co_weights_sum_to_100(self):
        w = self.ctx.eval('module.exports.W')
        for co in ['CO1', 'CO2', 'CO3', 'CO4', 'CO5']:
            weights = list(w[co])
            self.assertEqual(sum(weights), 100, f'{co} weights must sum to 100')

if __name__ == '__main__':
    unittest.main(verbosity=2)
