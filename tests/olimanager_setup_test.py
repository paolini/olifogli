import importlib.util
import tempfile
import unittest
import contextlib
import io
import json
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "staging_setup", Path(__file__).resolve().parents[1] / "scripts/setup-olimanager.py"
)
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)

FORM = '''<form id="contest_form"><input type="hidden" name="csrfmiddlewaretoken" value="synthetic-csrf">
<input name="name" value="Gara &amp; test"><input type="checkbox" name="enabled" checked>
<input type="checkbox" name="disabled_flag"><input name="readonly" value="ignored" disabled>
<select name="state"><option value="0">Draft</option><option value="2" selected>Public</option></select>
<select name="schools" multiple><option value="1" selected>A</option><option value="2" selected>B</option></select>
<textarea name="notes">Test &lt;note&gt;</textarea>
<input name="form-TOTAL_FORMS" value="0"><input type="submit" name="_save" value="Save"></form>'''


class FormTests(unittest.TestCase):
    def test_preserves_controls_and_management_data(self):
        fields = staging.admin_form(FORM)
        self.assertEqual(fields['name'], ['Gara & test'])
        self.assertEqual(fields['state'], ['2'])
        self.assertEqual(fields['schools'], ['1', '2'])
        self.assertEqual(fields['notes'], ['Test <note>'])
        self.assertEqual(fields['enabled'], ['on'])
        self.assertEqual(fields['disabled_flag'], [])
        self.assertEqual(fields['form-TOTAL_FORMS'], ['0'])
        self.assertNotIn('_save', fields)
        self.assertNotIn('readonly', fields)

    def test_changes_only_known_controls(self):
        fields = staging.set_fields(staging.admin_form(FORM), {'enabled': False, 'state': 0})
        self.assertEqual(fields['enabled'], [])
        self.assertEqual(fields['state'], ['0'])
        self.assertEqual(fields['name'], ['Gara & test'])
        with self.assertRaisesRegex(RuntimeError, 'inatteso'):
            staging.set_fields(fields, {'unknown': 'value'})

    def test_login_page_is_not_a_model_form(self):
        with self.assertRaisesRegex(RuntimeError, 'Modulo Django'):
            staging.admin_form('<form id="login-form"></form>')


class FakeStaging(staging.Olimanager):
    def __init__(self):
        super().__init__('unused-synthetic-cookie-path')
        self.pk = None
        self.writes = []
        self.reject = False

    def find(self, model, filters, first=False):
        return self.pk

    def request(self, path, data=None, graphql=False):
        if data is None:
            return 200, FORM
        self.writes.append(data)
        if self.reject:
            return 200, '<ul class="errorlist"><li>Invalid fixture</li></ul>'
        self.pk = '123'
        return 302, ''


class SeedTests(unittest.TestCase):
    def test_preview_never_submits_forms(self):
        api = FakeStaging()
        self.assertIsNone(api.ensure('contests/contest', {}, {'name': 'test'}, False))
        self.assertEqual(api.writes, [])

    def test_repeated_execution_does_not_duplicate_or_overwrite(self):
        api = FakeStaging()
        self.assertEqual(api.ensure('contests/contest', {}, {'name': 'test'}, True), '123')
        self.assertEqual(api.ensure('contests/contest', {}, {'name': 'changed'}, True), '123')
        self.assertEqual(len(api.writes), 1)
        self.assertEqual(api.writes[0]['name'], ['test'])
        self.assertEqual(api.writes[0]['csrfmiddlewaretoken'], ['synthetic-csrf'])

    def test_failed_form_is_not_reported_as_created(self):
        api = FakeStaging()
        api.reject = True
        with self.assertRaisesRegex(RuntimeError, 'Invalid fixture'):
            api.ensure('contests/contest', {}, {'name': 'test'}, True)

    def test_unexpected_mutation_payload_is_an_error(self):
        with self.assertRaisesRegex(RuntimeError, 'permission denied'):
            staging.mutation_result({'participants': {'create': {
                '__typename': 'OperationInfo', 'messages': [{'message': 'permission denied'}]
            }}}, 'participants', 'create', 'Success')


class TransportTests(unittest.TestCase):
    def test_requests_to_origins_other_than_configured_instance_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            api = staging.Olimanager(Path(tmp) / 'cookies')
            with patch.object(staging.subprocess, 'run') as run:
                for url in ['https://olimpiadi-scientifiche.it/graphql/', 'https://evil.invalid/', 'http://staging.olimpiadi-scientifiche.it/']:
                    with self.assertRaisesRegex(RuntimeError, 'istanza Olimanager configurata'):
                        api.request(url)
                run.assert_not_called()

    def test_configurable_https_and_local_http_instances(self):
        for origin in ['https://example.invalid', 'http://localhost:8000']:
            api = staging.Olimanager('unused', origin + '/')
            response = staging.subprocess.CompletedProcess([], 0, stdout='{}\n200', stderr='')
            with patch.object(staging.subprocess, 'run', return_value=response) as run:
                self.assertEqual(api.request('/graphql/'), (200, '{}'))
                self.assertIn(origin + '/graphql/', run.call_args.args[0])

    def test_instance_url_must_not_contain_credentials_or_paths(self):
        for url in ['https://user:password@example.invalid', 'https://example.invalid/graphql/',
                    'ftp://example.invalid', 'https://example.invalid/?secret=value']:
            with self.assertRaises(ValueError):
                staging.Olimanager('unused', url)

    def test_relative_admin_links_and_ambiguous_matches(self):
        api = staging.Olimanager('unused')
        html = '<table id="result_list"><tr><td><a href="123/change/">test</a></td></tr></table>'
        with patch.object(api, 'request', return_value=(200, html)):
            self.assertEqual(api.find('students/student', {}), '123')
        html = html.replace('</table>', '<tr><td><a href="124/change/">other</a></td></tr></table>')
        with patch.object(api, 'request', return_value=(200, html)):
            with self.assertRaisesRegex(RuntimeError, 'Più oggetti'):
                api.find('students/student', {})


class CredentialTests(unittest.TestCase):
    def test_unset_or_empty_credentials_use_public_staging_account(self):
        for env in [{}, {'OLIMANAGER_SETUP_USERNAME': '', 'OLIMANAGER_SETUP_PASSWORD': ''},
                    {'OLIMANAGER_SETUP_USERNAME': '  ', 'OLIMANAGER_SETUP_PASSWORD': ''}]:
            with patch.dict(staging.os.environ, env, clear=True), \
                 patch.object(staging.sys, 'argv', ['setup-olimanager.py']), \
                 patch.object(staging, 'Olimanager') as client, \
                 patch.object(staging, 'setup'), contextlib.redirect_stdout(io.StringIO()):
                staging.main()
                client.return_value.login.assert_called_once_with('admin@olimanager.it', 'admin@olimanager.it')

    def test_explicit_credentials_are_preserved(self):
        with patch.dict(staging.os.environ, {'OLIMANAGER_SETUP_PASSWORD': 'synthetic-password'}, clear=True), \
             patch.object(staging.sys, 'argv', ['setup-olimanager.py', '--username', 'other@example.invalid']), \
             patch.object(staging, 'Olimanager') as client, \
             patch.object(staging, 'setup'), contextlib.redirect_stdout(io.StringIO()):
            staging.main()
            client.return_value.login.assert_called_once_with('other@example.invalid', 'synthetic-password')

    def test_empty_password_on_other_instance_is_rejected_before_login(self):
        with patch.dict(staging.os.environ, {'OLIMANAGER_SETUP_PASSWORD': ''}, clear=True), \
             patch.object(staging.sys, 'argv', ['setup-olimanager.py', '--url', 'http://localhost:8000']), \
             patch.object(staging, 'Olimanager') as client, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                staging.main()
            client.assert_not_called()


class FixtureAPI:
    """In-memory instance: no HTTP requests or real account data."""
    origin = 'https://example.invalid'

    def __init__(self):
        self.objects = {}
        self.creations = []
        self.calls = []
        self.participants = {}
        self.competitor = None

    def find(self, model, filters, first=False):
        if model == 'students/student':
            return '1'
        if model == 'users/user':
            return '2'
        if model == 'competitors/competitor':
            return self.competitor
        if model == 'participants/participant':
            return self.participants.get(str(filters['official_venue__id__exact']))
        raise AssertionError((model, filters))

    def fields(self, model, pk=None):
        if model == 'users/user' and pk == '2':
            return {'email': ['teacher@example.invalid'], 'name': ['Docente'], 'surname': ['Referente']}
        values = {
            'students/student': {'school': '10', 'user': '3', 'class_year': '11', 'section': 'A'},
            'schools/school': {'external_id': 'TEST0001', 'type': '4', 'location': '5'},
            'users/user': {'email': 'student@example.invalid', 'name': 'Nome', 'surname': 'Test', 'birth_date': '14/03/2010'},
        }[model]
        return {k: [v] for k, v in values.items()}

    def ensure(self, model, filters, values, apply):
        if model == 'venues/venueadmin':
            assert values.get('name') and values.get('surname'), 'Required historical name and surname missing'
        key = (model, json.dumps(filters, sort_keys=True))
        if key not in self.objects and apply:
            self.objects[key] = str(100 + len(self.objects))
            self.creations.append((model, dict(values)))
        return self.objects.get(key)

    def graphql(self, query, variables):
        self.calls.append((query, variables))
        if 'manualStudentSubscribe' in query:
            self.competitor = '21'
            return {'competitors': {'manualStudentSubscribe': {
                '__typename': 'ManualStudentSubscribeSuccess', 'competitor': {'id': 21}}}}
        if 'manualCreateParticipant' in query:
            self.participants[str(variables['venue'])] = '31'
            return {'participants': {'manualCreateParticipant': {
                '__typename': 'ManualParticipantCreateSuccess', 'participant': {'id': 31}}}}
        if 'matchOrCreateParticipant' in query:
            return {'participants': {'matchOrCreateParticipant': {
                '__typename': 'ParticipantMatchSuccess', 'participant': {'id': variables['contest'] + 1000},
                'multipleCompetitorsMatched': False}}}
        raise AssertionError(query)


class ArchimedeTests(unittest.TestCase):
    def run_setup(self, api, apply):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'manifest.json'
            args = SimpleNamespace(student='student@example.invalid', teacher='teacher@example.invalid',
                                   year=2026, apply=apply, output=output)
            with contextlib.redirect_stdout(io.StringIO()):
                staging.setup(api, args, '1')
            return json.loads(output.read_text())

    def test_preview_has_two_categories_but_does_not_create_or_call_mutations(self):
        api = FixtureAPI()
        manifest = self.run_setup(api, False)
        self.assertEqual(set(manifest['contests']), {'biennio', 'triennio'})
        self.assertEqual(api.creations, [])
        self.assertEqual(api.calls, [])

    def test_two_contests_32_problems_and_correct_participations_survive_repeat(self):
        api = FixtureAPI()
        first = self.run_setup(api, True)
        count = len(api.creations)
        second = self.run_setup(api, True)
        self.assertEqual(len(api.creations), count)
        self.assertEqual(first, second)
        contests = [v for model, v in api.creations if model == 'contests/contest']
        self.assertEqual(len(contests), 2)
        self.assertTrue(all(c['scope'] == 0 and c['state'] == 2 and c['allow_result_upload'] for c in contests))
        admins = [v for model, v in api.creations if model == 'venues/venueadmin']
        self.assertEqual(len(admins), 2)
        self.assertTrue(all(v['name'] == 'Docente' and v['surname'] == 'Referente' for v in admins))
        for category in ['biennio', 'triennio']:
            contest_id = first['contests'][category]['contestId']
            problems = [v for model, v in api.creations if model == 'contests/contestproblem' and v['contest'] == contest_id]
            self.assertEqual([p['index'] for p in problems], list(range(1, 17)))
            self.assertTrue(all(p['min_score'] == 0 and p['max_score'] == 5 for p in problems))
            self.assertEqual(first['workbookCommonData'][f'olimanager_archimede_{category}_contest_id'], contest_id)
        for row in first['rows']:
            category = 'biennio' if row['classYear'] <= 10 else 'triennio'
            self.assertEqual(row['category'], category)
            self.assertEqual(row['contestId'], first['contests'][category]['contestId'])
            self.assertEqual(row['variant'], '211' if category == 'biennio' else '311')
            self.assertEqual(int(row['olifogliData']['classYear']), row['classYear'] - 8)
            self.assertEqual('participantId' in row, row['case'] != 'nuovo-da-abbinare')
        matches = [v for q, v in api.calls if 'matchOrCreateParticipant' in q]
        self.assertTrue(all('SenzaAccount' in v['surname'] for v in matches))

    def test_resume_after_failure_creating_first_venue_admin(self):
        api = FixtureAPI()
        ensure = api.ensure
        def fail_admin(model, filters, values, apply):
            if model == 'venues/venueadmin':
                raise RuntimeError('simulated admin form rejection')
            return ensure(model, filters, values, apply)
        api.ensure = fail_admin
        with self.assertRaisesRegex(RuntimeError, 'simulated'):
            self.run_setup(api, True)
        existing = dict(api.objects)
        api.ensure = ensure
        self.run_setup(api, True)
        self.assertTrue(all(api.objects[key] == pk for key, pk in existing.items()))
        self.assertEqual(sum(model == 'contests/contest' for model, _ in api.creations), 2)
        self.assertEqual(sum(model == 'contests/contestproblem' for model, _ in api.creations), 32)

    def test_workbook_contains_provided_2025_permutations_and_scores_without_old_ids(self):
        data = self.run_setup(FixtureAPI(), True)['workbookCommonData']
        self.assertEqual(data['contest_year'], '2026')
        self.assertEqual(data['permutations_correct_2'], 'EBDACADEEBCDAEBC')
        self.assertEqual(data['permutations_correct_3'], 'CBAEAECBDCBEEDAB')
        self.assertNotIn('permutations_correct_4', data)
        self.assertNotIn('permutations_correct_5', data)
        for index in range(1, 9):
            self.assertEqual(sorted(json.loads(data[f'permutations_questions_{index}'])), list(range(1, 17)))
        for index in range(1, 6):
            self.assertEqual(sorted(data[f'permutations_answers_{index}']), list('ABCDE'))
        for answer, score in [('correct', '5'), ('wrong', '0'), ('empty', '1'), ('invalid', '0')]:
            self.assertEqual(data[f'permutations_points_{answer}'], score)

    def test_primary_school_student_rejected_before_writes(self):
        api = FixtureAPI()
        original = api.fields
        def fields(model, pk=None):
            result = original(model, pk)
            if model == 'students/student':
                result['class_year'] = ['6']
            return result
        api.fields = fields
        with self.assertRaisesRegex(RuntimeError, 'superiori'):
            self.run_setup(api, True)
        self.assertEqual(api.creations, [])

    def test_login_redirect_never_counts_as_missing_fixture(self):
        api = staging.Olimanager('unused')
        with patch.object(api, 'request', return_value=(200, '<form id="login-form"></form>')):
            with self.assertRaisesRegex(RuntimeError, 'scaduta'):
                api.find('students/student', {})


if __name__ == '__main__':
    unittest.main()
