"""Installer fixture completion must wait for readable, complete JSON."""
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parent/'test-support'))
from update_marker import read_complete_marker

class MarkerTests(unittest.TestCase):
 def test_missing_partial_and_complete_bom_file(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/'installer-called.json'
   self.assertIsNone(read_complete_marker(path))
   path.write_text('{"version":')
   self.assertIsNone(read_complete_marker(path))
   path.write_text('{"version":"1.24.7","sha256":"verified"}',encoding='utf-8-sig')
   self.assertEqual(read_complete_marker(path),{'version':'1.24.7','sha256':'verified'})
 def test_windows_writer_lock_then_complete_result(self):
  path=Mock();path.read_text.side_effect=[PermissionError('writer owns file'),'{"version":"1.24.7"}']
  self.assertIsNone(read_complete_marker(path))
  self.assertEqual(read_complete_marker(path),{'version':'1.24.7'})
  self.assertEqual(path.read_text.call_count,2,'One read per caller poll, no internal indefinite wait')

if __name__=='__main__':unittest.main()
