import gzip
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from service.timeline_labels import read_timeline_labels, _palette

GUID = '641f8316-a302-48a6-81de-fc8a07de11e2'


def project_xml():
    clips = ''
    for index, label in enumerate((6, 7, 6)):
        clips += f'''<VideoClipTrackItem ObjectID="item{index}"><ClipTrackItem>
          <SubClip ObjectRef="sub{index}"/><TrackItem><Start>{index*100}</Start><End>{(index+1)*100}</End></TrackItem>
          </ClipTrackItem></VideoClipTrackItem>
          <SubClip ObjectID="sub{index}"><Name>same.png</Name><Clip ObjectRef="clip{index}"/></SubClip>
          <VideoClip ObjectID="clip{index}"><Clip><Node><Properties>
          <asl.clip.label.name>BE.Prefs.LabelColors.{label}</asl.clip.label.name>
          </Properties></Node><Source ObjectRef="source"/><InPoint>{index*100}</InPoint>
          <OutPoint>{(index+1)*100}</OutPoint></Clip></VideoClip>'''
    return f'''<PremiereData><Sequence ObjectUID="{GUID}"><Name>Fixture</Name><TrackGroups><TrackGroup>
      <Second ObjectRef="group"/></TrackGroup></TrackGroups></Sequence>
      <VideoTrackGroup ObjectID="group"><FrameRect>0,0,1920,1080</FrameRect><TrackGroup><FrameRate>10</FrameRate>
      <Tracks><Track ObjectRef="track"/></Tracks></TrackGroup></VideoTrackGroup>
      <VideoTrack ObjectID="track"><ClipTrack><Track><Index>0</Index><IsLocked>false</IsLocked></Track>
      <ClipItems><TrackItems>{''.join(f'<TrackItem ObjectRef="item{i}"/>' for i in range(3))}</TrackItems></ClipItems>
      </ClipTrack></VideoTrack><VideoMediaSource ObjectID="source"><MediaSource><Media ObjectRef="media"/></MediaSource></VideoMediaSource>
      <Media ObjectID="media"><FilePath>/tmp/same.png</FilePath></Media>{clips}</PremiereData>'''


class TimelineLabelsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'fixture.prproj'
        self.xml = project_xml()

    def read(self, xml=None, compressed=False, **payload):
        raw = (xml or self.xml).encode()
        self.path.write_bytes(gzip.compress(raw) if compressed else raw)
        return read_timeline_labels({'path': str(self.path), 'sequenceId': GUID, **payload})

    def test_occurrences_keep_distinct_labels_for_same_media(self):
        result = self.read(compressed=True)
        self.assertEqual([label['clipCount'] for label in result['labels']], [2, 1])
        self.assertEqual(len({clip['mediaPath'] for clip in result['clips']}), 1)
        self.assertEqual([clip['startTicks'] for clip in result['clips']], ['0', '100', '200'])
        self.assertTrue(all(clip['supported'] for clip in result['clips']))
        self.assertFalse(result['paletteResolved'])
        self.assertEqual(len(result['projectSha256']), 64)

    def test_never_falls_back_to_master_label(self):
        import re
        xml = re.sub(r'<asl.clip.label.name>.*?</asl.clip.label.name>', '', self.xml)
        xml = xml.replace('</PremiereData>', '<MasterClip ObjectID="master"><asl.clip.label.name>BE.Prefs.LabelColors.1</asl.clip.label.name></MasterClip></PremiereData>')
        result = self.read(xml)
        self.assertEqual(result['labels'], [])
        self.assertTrue(all(clip['labelKey'] is None for clip in result['clips']))

    def test_locked_or_retimed_clips_are_unsupported(self):
        locked = self.read(self.xml.replace('<IsLocked>false', '<IsLocked>true'))
        self.assertTrue(all(not clip['supported'] for clip in locked['clips']))
        retimed = self.read(self.xml.replace('<InPoint>100', '<PlaybackSpeed>2</PlaybackSpeed><InPoint>100'))
        self.assertEqual([clip['supported'] for clip in retimed['clips']], [True, False, True])

    def test_rejects_wrong_sequence_ambiguous_ids_and_xml_entities(self):
        for xml in (self.xml.replace(GUID, '11111111-1111-1111-1111-111111111111'),
                    self.xml.replace('</PremiereData>', '<Media ObjectID="media"/></PremiereData>'),
                    '<!DOCTYPE PremiereData [<!ENTITY x "test">]>' + self.xml):
            with self.subTest(xml=xml[:50]), self.assertRaises(ValueError):
                self.read(xml)

    def test_palette_decodes_bgr_and_refuses_ambiguous_profiles(self):
        profile = Path(self.temp.name) / 'Documents/Adobe/Premiere Pro (Beta)/27.0/Profile-adam'
        profile.mkdir(parents=True)
        prefs = b'<PremiereData><Preferences><Properties><BE.Prefs.LabelColors.6>3474060</BE.Prefs.LabelColors.6><BE.Prefs.LabelNames.6>Rose</BE.Prefs.LabelNames.6></Properties></Preferences></PremiereData>'
        (profile / 'Adobe Premiere Pro (Beta) Prefs').write_bytes(prefs)
        with patch('service.timeline_labels.Path.home', return_value=Path(self.temp.name)):
            self.assertEqual(_palette('27.0.0')[6], {'displayName': 'Rose', 'colorHex': '#8c0235'})
            self.assertEqual(_palette('../27'), {})
            second = profile.parent / 'Profile-second'
            second.mkdir()
            (second / 'Adobe Premiere Pro (Beta) Prefs').write_bytes(prefs)
            self.assertEqual(_palette('27.0.0'), {})

    def test_stored_color_is_used_without_profile(self):
        result = self.read(self.xml.replace('</asl.clip.label.name>', '</asl.clip.label.name><asl.clip.label.color>3474060</asl.clip.label.color>'))
        self.assertEqual(result['labels'][0]['colorHex'], '#8c0235')


if __name__ == '__main__':
    unittest.main()
