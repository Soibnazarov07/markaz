"""Additive schema verification using stdlib SQLite only (no npm dependencies)."""
from pathlib import Path
import sqlite3,re
root=Path(__file__).resolve().parent.parent
conn=sqlite3.connect(':memory:')
conn.execute('PRAGMA foreign_keys=ON')
for name in ['server.js','features.js','cms.js','public-quizzes.js','operations.js','academy-extensions.js','exams-v5.js']:
 s=(root/name).read_text()
 for sql in re.findall(r'db\.exec\(\s*`([^`]+)`\s*\)',s,re.S):conn.executescript(sql)
# v5 runtime migrations must occur before v6 references.
for col,typ in [('paid_on',"TEXT NOT NULL DEFAULT ''"),('note',"TEXT NOT NULL DEFAULT ''"),('voided_at','TEXT'),('voided_by','INTEGER'),('void_reason',"TEXT NOT NULL DEFAULT ''")]:
 if col not in [x[1] for x in conn.execute('PRAGMA table_info(ops_receipts)')]:conn.execute(f'ALTER TABLE ops_receipts ADD COLUMN {col} {typ}')
if 'course_id' not in [x[1] for x in conn.execute('PRAGMA table_info(ops_invoices)')]:conn.execute('ALTER TABLE ops_invoices ADD COLUMN course_id INTEGER REFERENCES courses(id)')
s=(root/'manual-finance.js').read_text()
for sql in re.findall(r'db\.exec\(\s*`([^`]+)`\s*\)',s,re.S):
 if '${' not in sql:conn.executescript(sql)
for name in ['v6-core.js','v6-extras.js','v6-mfa.js']:
 s=(root/name).read_text()
 for sql in re.findall(r'db\.exec\(\s*`([^`]+)`\s*\)',s,re.S):conn.executescript(sql)
 print('PASS migration:',name)
conn.executescript("""
INSERT INTO users(name,email,password,role) VALUES('Admin','admin@example.com','hash','admin'),('Teacher','teacher@example.com','hash','teacher'),('Student','student@example.com','hash','student'),('Parent','parent@example.com','hash','parent'),('Manager','manager@example.com','hash','branch_manager');
INSERT INTO courses(title,price,teacher_id) VALUES('Test course',300000,2);
INSERT INTO cms_branches(name) VALUES('Filial A');
INSERT INTO study_groups(name,course_id,teacher_id,branch_id,capacity) VALUES('G-1',1,2,1,20);
INSERT INTO v6_staff_branches(user_id,branch_id) VALUES(5,1);
INSERT INTO group_students(group_id,student_id) VALUES(1,3);
INSERT INTO class_sessions(group_id,session_date,topic) VALUES(1,'2026-11-07','Lesson A');
INSERT INTO attendance_records(session_id,student_id,status,marked_by) VALUES(1,3,'present',2);
UPDATE attendance_records SET status='late',marked_by=1 WHERE session_id=1 AND student_id=3;
""")
changes=conn.execute('SELECT old_status,new_status FROM v6_attendance_change ORDER BY id').fetchall()
assert changes==[(None,'present'),('present','late')],changes
try:conn.execute('INSERT INTO v6_staff_branches(user_id,branch_id) VALUES(5,1)')
except sqlite3.IntegrityError:pass
else:raise AssertionError('Duplicate manager assignment allowed')
try:conn.execute('INSERT INTO v6_student_achievements(student_id,code,points) VALUES(3,\'first_exam\',-5)')
except sqlite3.IntegrityError:pass
else:raise AssertionError('Negative XP allowed')
conn.execute("INSERT INTO v6_student_achievements(student_id,code,points) VALUES(3,'first_exam',120)")
assert conn.execute('SELECT points FROM v6_student_achievements WHERE student_id=3').fetchone()[0]==120
print('PASS v6:',conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()[0],'tables; attendance audit, branches, XP constraints')
