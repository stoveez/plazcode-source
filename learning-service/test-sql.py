import re,sqlite3,pathlib
root=pathlib.Path(__file__).resolve().parent
c=sqlite3.connect(':memory:')
c.executescript(next((root/'drizzle').glob('*.sql')).read_text())
sql=re.findall(r'prepare\("([^"\n]+)"\)',(root/'app/api/v1/report/route.ts').read_text());assert len(sql)==2
c.execute('INSERT INTO tickets VALUES (?,?)',('valid',100))
args=('local-edit-test','local-edit-test',1,0,'valid',99)
def submit(ticket='valid',now=99):
 with c:
  c.execute(sql[0],('local-edit-test','local-edit-test',1,0,ticket,now))
  return c.execute(sql[1],(ticket,now)).rowcount
assert submit()==1 and submit()==0
assert c.execute('SELECT successes FROM lessons').fetchone()==(1,)
c.execute('INSERT INTO tickets VALUES (?,?)',('expired',1));assert submit('expired')==0
assert c.execute('SELECT successes FROM lessons').fetchone()==(1,)
c.execute('UPDATE lessons SET retracted=1');c.execute('INSERT INTO tickets VALUES (?,?)',('new',100));assert submit('new')==1
assert c.execute('SELECT retracted,revision,successes FROM lessons').fetchone()==(1,2,2)
print('PASS actual migration and route SQL: single-use reports, expired tickets, atomic counts, persistent retraction and revisions.')
