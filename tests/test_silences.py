import copy
from fractions import Fraction
import http.client
import json
import math
from pathlib import Path
import struct
import tempfile
from threading import Event, Thread
import time
import unittest
import wave
import xml.etree.ElementTree as ET
from service.auto_editor import TICKS, analyze, engine_info, export_premiere, parse_proposals, reviewed_timeline, validate_request
from service.jobs import Jobs
from service.server import make_server


def fixture(path):
    with wave.open(str(path), 'wb') as output:
        output.setparams((1, 2, 16000, 0, 'NONE', 'not compressed'))
        # Tone 0..1, silence 1..3, tone 3..4, silence 4..5.
        output.writeframes(b''.join(struct.pack('<h', int(12000*math.sin(2*math.pi*440*i/16000)) if i < 16000 or 48000 <= i < 64000 else 0) for i in range(80000)))


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.options = {'path': '/tmp/example.wav', 'frameRate': '25', 'sourceInTicks': '0', 'sourceOutTicks': None, 'sequenceStartTicks': str(10*TICKS), 'minSilenceMs': 400, 'beforeMs': 120, 'afterMs': 120}
        self.timeline = {'version': '2', 'source': '/tmp/example.wav', 'tb': '25/1', 'effects': ['cut','nil'], 'clips': [[0,25,1],[25,75,0],[75,100,1],[100,125,0]]}

    def test_margins_and_source_sequence_mapping(self):
        plan = parse_proposals(self.timeline, self.options)
        self.assertEqual([(x['startFrame'], x['endFrame']) for x in plan['operations']], [(28,72),(103,125)])
        self.assertEqual(plan['operations'][0]['sequenceRange']['startTicks'], str(10*TICKS + 28*TICKS//25))

    def test_minimum_and_trimmed_source(self):
        self.options.update(minSilenceMs=1500, sourceInTicks=str(2*TICKS), sourceOutTicks=str(4*TICKS))
        self.assertEqual(parse_proposals(self.timeline, self.options)['operations'], [])

    def test_rejected_cut_is_restored_on_export(self):
        plan = parse_proposals(self.timeline, self.options)
        reviewed = reviewed_timeline(plan, ['cut-1'])
        self.assertEqual(reviewed['clips'][-1], [72,125,1])
        with self.assertRaises(ValueError): reviewed_timeline(plan, ['invented-cut'])
        with self.assertRaises(ValueError): reviewed_timeline(plan, ['cut-1','cut-1'])

    def test_fractional_rate_keeps_exact_ticks(self):
        self.timeline['tb'] = self.options['frameRate'] = '30000/1001'
        plan = parse_proposals(self.timeline, self.options)
        frame = plan['operations'][0]['startFrame']
        self.assertEqual(int(plan['operations'][0]['sourceRange']['startTicks']), frame*TICKS*1001//30000)

    def test_all_silence_cannot_export_empty_sequence(self):
        self.timeline['clips'] = [[0,125,0]]
        plan = parse_proposals(self.timeline, self.options)
        with self.assertRaises(ValueError): reviewed_timeline(plan, ['cut-1'])

    def test_deny_remote_or_invalid_source(self):
        for path in ('https://example.org/video.mp4', '/does-not-exist.wav'):
            with self.assertRaises(ValueError): validate_request({'path':path})


@unittest.skipUnless(engine_info()['available'], 'Moteur officiel auto-editor non installé')
class EngineTests(unittest.TestCase):
    def test_cancellation_before_processing(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            media = directory/'source.wav'
            fixture(media)
            cancelled = Event(); cancelled.set()
            with self.assertRaises(InterruptedError):
                analyze(validate_request({'path':str(media)}), directory/'analysis', cancelled)
            self.assertFalse((directory/'analysis'/'analysis.v2').exists())

    def test_real_binary_analysis_review_and_xml(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            media = directory/'source.wav'
            fixture(media)
            options = validate_request({'path':str(media)})
            plan = analyze(options, directory/'analysis')
            self.assertEqual([(x['startFrame'],x['endFrame']) for x in plan['operations']], [(28,72),(103,125)])
            path = export_premiere(plan, ['cut-1'], directory/'export')
            xml = ET.parse(path)
            self.assertEqual(int(xml.find('.//sequence/duration').text), 81)
            self.assertEqual(xml.find('.//sequence/rate/timebase').text, '25')
            self.assertTrue(media.exists())

    def test_real_job_persistence_and_export(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            media = directory/'source.wav'
            fixture(media)
            jobs = Jobs(directory/'jobs')
            try:
                record = jobs.create({'path':str(media)})
                deadline = time.monotonic()+15
                while record['status'] in ('queued','running') and time.monotonic() < deadline:
                    time.sleep(.05)
                    record = jobs.get(record['id'])
                self.assertEqual(record['status'], 'complete', record)
                result = jobs.export(record['id'], [])
                self.assertTrue(Path(result['path']).is_file())
            finally: jobs.close()
            restored = Jobs(directory/'jobs')
            try: self.assertEqual(restored.get(record['id'])['result'], record['result'])
            finally: restored.close()


class HttpTests(unittest.TestCase):
    @unittest.skipUnless(engine_info()['available'], 'Moteur officiel auto-editor non installé')
    def test_real_http_analysis_review_export(self):
        with tempfile.TemporaryDirectory() as temp:
            media = Path(temp)/'source.wav'; fixture(media)
            server = make_server(0, Path(temp)/'jobs')
            Thread(target=server.serve_forever, daemon=True).start()
            client = http.client.HTTPConnection('127.0.0.1', server.server_port)
            headers = {'Content-Type':'application/json','X-Nocturnz-Client':'premiere-panel'}
            try:
                client.request('POST','/api/v1/silences/analyze',json.dumps({'path':str(media)}),headers)
                response = client.getresponse(); self.assertEqual(response.status, 202)
                record = json.loads(response.read()); job_id = record['id']
                deadline = time.monotonic()+15
                while record['status'] in ('queued','running') and time.monotonic()<deadline:
                    time.sleep(.05)
                    client.request('GET',f'/api/v1/jobs/{job_id}',headers=headers)
                    response=client.getresponse(); self.assertEqual(response.status,200)
                    record=json.loads(response.read())
                self.assertEqual(record['status'],'complete',record)
                client.request('POST',f'/api/v1/jobs/{job_id}/export',json.dumps({'acceptedIds':['cut-1']}),headers)
                response=client.getresponse(); self.assertEqual(response.status,200)
                exported=json.loads(response.read())
                self.assertEqual(int(ET.fromstring(exported['xml']).find('.//sequence/duration').text),81)
                self.assertEqual(exported['scope'],'source-only')
            finally:
                client.close(); server.shutdown(); server.jobs.close(); server.server_close()

    def test_origin_and_client_protection(self):
        with tempfile.TemporaryDirectory() as temp:
            server = make_server(0, temp)
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            client = http.client.HTTPConnection('127.0.0.1', server.server_port)
            try:
                client.request('GET','/health')
                response = client.getresponse()
                self.assertEqual(response.status, 200)
                payload = json.loads(response.read())
                self.assertEqual(payload['mediaProcessing'], engine_info()['available'])
                client.request('POST','/api/v1/silences/analyze','{}',headers={'Content-Type':'application/json','Origin':'https://evil.example','X-Nocturnz-Client':'premiere-panel'})
                response = client.getresponse()
                self.assertEqual(response.status, 403)
                self.assertIsNone(response.getheader('Access-Control-Allow-Origin'))
                response.read()
                client.request('GET','/api/v1/jobs/'+'a'*32)
                response = client.getresponse()
                self.assertEqual(response.status, 403)
                response.read()
            finally:
                client.close(); server.shutdown(); server.jobs.close(); server.server_close()
