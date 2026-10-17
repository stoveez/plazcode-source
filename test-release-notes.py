import unittest
from publish_release import notes, checked_release_body

class ReleaseNotesTests(unittest.TestCase):
    def test_limit_includes_markdown_and_newlines(self):
        self.assertEqual(checked_release_body('a'*1999),'a'*1999)
        for text in ['a'*2000, '\U0001f600'*1000]:
            with self.assertRaises(ValueError):
                checked_release_body(text)

    def test_format_and_separate_short_release_copy(self):
        entry={'version':'9.9.9','title':'Update','summary':'x'*5000,
               'added':['x'*5000],'improved':['x'*5000],
               'fixed':['x'*5000],'notes':['x'*5000],
               'github':{'summary':'Brief summary.','added':['New feature.'],
                         'improved':['Improvement.'],'fixed':['Fix.'],
                         'notes':['Live checks unavailable.']}}
        title,body=notes({'version':'9.9.9','release_notes':[entry]})
        self.assertLess(len(body.encode('utf-16-le'))//2,2000)
        self.assertEqual(title,'PlazCode 9.9.9: Update')
        for text in ['## ✨ PlazCode 9.9.9','### ✨ New features',
                     '### 💡 Improvements','### 🛠️ Fixes',
                     '### 🧪 Checks','### 📥 How to update',
                     'PlazCode-9.9.9.zip','PlazCode-macOS-9.9.9.zip',
                     'PlazCode-Firefox-9.9.9.zip']:
            self.assertIn(text,body)
        self.assertEqual(len(entry['summary']),5000)
        del entry['github']
        with self.assertRaises(ValueError):
            notes({'version':'9.9.9','release_notes':[entry]})

if __name__=='__main__':
    unittest.main()
