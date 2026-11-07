"""No external dependencies. Validates additive SQLite schemas against v3 table setup."""
from pathlib import Path
import re,sqlite3
root=Path(__file__).resolve().parent.parent
conn=sqlite3.connect(':memory:')
conn.execute('PRAGMA foreign_keys=ON')
for f in ['server.js','features.js','cms.js','public-quizzes.js','operations.js']:
    s=(root/f).read_text()
    chunks=re.findall(r'db\.exec\(\s*`([^`]+)`\s*\)',s,re.S)
    for sql in chunks:
        try: conn.executescript(sql)
        except sqlite3.Error as e: raise SystemExit(f'{f}: {e}')
    print(f, 'SQL chunks:',len(chunks))
rows=[x[0] for x in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
assert len(rows)>=30,rows
for expected in ['users','courses','orders','cms_articles','study_groups','attendance_records','ops_parent_links','ops_assignments','ops_schedule','ops_invoices','ops_receipts','ops_expenses','ops_salary_config','ops_certificates','ops_tickets']:
    assert expected in rows,expected
conn.executescript("INSERT INTO users(name,email,password,role) VALUES ('Student','s@example.com','hash','student'),('Parent','p@example.com','hash','parent'),('Admin','a@example.com','hash','admin');")
conn.execute('INSERT INTO ops_parent_links(parent_id,student_id) VALUES (?,?)',(2,1))
try: conn.execute('INSERT INTO ops_parent_links(parent_id,student_id) VALUES (?,?)',(2,1))
except sqlite3.IntegrityError: pass
else: raise AssertionError('Duplicate parent/student link should be blocked')
try: conn.execute("INSERT INTO ops_invoices(student_id,description,amount,due_on) VALUES (1,'Fee',-1,'2026-11-30')")
except sqlite3.IntegrityError: pass
else: raise AssertionError('Negative invoice should be blocked')
print('PASS:',len(rows),'tables / migration + constraints')
