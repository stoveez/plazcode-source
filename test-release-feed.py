import copy, json, pathlib, unittest
from release_feed import compact_feed, encode, validate, MAX_FEED_BYTES
class FeedTests(unittest.TestCase):
    def test_old_clients_and_complete_history(self):
        notes=[{'version':str(i),'summary':'多'*1000} for i in range(100)]
        feed={'version':'0','url':'immutable.zip','sha256':'checksum','platforms':{'macos':{'url':'mac.zip'}}}
        before=copy.deepcopy(notes)
        result=compact_feed(feed, notes)
        self.assertLess(len(encode(result)), MAX_FEED_BYTES)
        self.assertEqual(len(result['release_notes']),5)
        self.assertEqual(notes,before)
        for key in feed:self.assertEqual(result[key],feed[key])
    def test_drops_oldest_by_bytes_and_rejects_oversized_current(self):
        result=compact_feed({'version':'0'},[{'version':str(i),'summary':'x'*20000} for i in range(8)])
        self.assertEqual([n['version'] for n in result['release_notes']],['0','1'])
        with self.assertRaises(ValueError):compact_feed({'version':'0'},[{'version':'0','summary':'x'*65536}])
        with self.assertRaises(ValueError):validate({'version':'0','release_notes':[{'version':'1'}]})
    def test_installed_updater_boundary_and_published_feeds(self):
        f={'version':'1','release_notes':[{'version':'1'}]}
        validate(f,b' '*65536)
        with self.assertRaises(ValueError):validate(f,b' '*65537)
        for filename in ['latest.json','latest-macos.json']:
            p=pathlib.Path(filename)
            if p.exists():validate(json.loads(p.read_bytes()),p.read_bytes())
if __name__=='__main__':unittest.main()
