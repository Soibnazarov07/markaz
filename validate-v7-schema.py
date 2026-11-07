"""Run all v6 migrations first, then v7 migration, with SQLite integrity checks."""
from pathlib import Path
import runpy,re,sqlite3
root=Path(__file__).resolve().parent.parent
context=runpy.run_path(str(root/'scripts'/'validate-v6-schema.py'))
conn=context['conn']
s=(root/'v7-improvements.js').read_text()
sql=re.search(r' db\.exec\(`([\s\S]*?)`\);',s)
assert sql,'v7 migration not found'
conn.executescript(sql.group(1))
conn.execute("INSERT INTO v7_holidays(day,name,created_by) VALUES('2026-11-07','Ta’til',1)")
conn.execute("INSERT INTO results(test_id,user_id,score,total) VALUES(1,3,1,1)") if conn.execute('SELECT 1 FROM tests WHERE id=1').fetchone() else None
try:conn.execute("INSERT INTO v7_xp_events(student_id,source,source_id,points) VALUES(3,'test',3,-1)")
except sqlite3.IntegrityError:pass
else:raise AssertionError('Negative XP permitted')
assert conn.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print('PASS v7 tables:',conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0], 'constraints + database integrity (QR o‘chirildi)')
