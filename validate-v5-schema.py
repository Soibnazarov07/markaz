"""Standalone SQLite migration checks; no third-party Python dependencies."""
from pathlib import Path
import re,sqlite3
p=Path(__file__).resolve().parent.parent
c=sqlite3.connect(':memory:')
c.execute('PRAGMA foreign_keys=ON')
for filename in ['server.js','features.js','cms.js','public-quizzes.js','operations.js','academy-extensions.js','exams-v5.js']:
 s=(p/filename).read_text()
 for chunk in re.findall(r'db\.exec\(\s*`([^`]+)`\s*\)',s,re.S):
  c.executescript(chunk)
 print('parsed:',filename)
# The JS manual migration adds these columns before its create-index block.
for name,typ in [('paid_on',"TEXT NOT NULL DEFAULT ''"),('note',"TEXT NOT NULL DEFAULT ''"),('voided_at','TEXT'),('voided_by','INTEGER'),('void_reason',"TEXT NOT NULL DEFAULT ''")]:
 if name not in [x[1] for x in c.execute('PRAGMA table_info(ops_receipts)')]: c.execute(f'ALTER TABLE ops_receipts ADD COLUMN {name} {typ}')
c.execute('ALTER TABLE ops_invoices ADD COLUMN course_id INTEGER REFERENCES courses(id)')
# Validate the indexes and payment-events table which depend on additive ALTER TABLE.
s=(p/'manual-finance.js').read_text()
chunks=re.findall(r'db\.exec\(\s*`([^`]+)`\s*\)',s,re.S)
for chunk in chunks:
 if "${" in chunk:continue
 c.executescript(chunk)
for name in ('v5_profiles','v5_announcements','v5_exams','v5_exam_questions','v5_exam_attempts','v5_exam_answers','ops_payment_events'):
 assert c.execute('SELECT 1 FROM sqlite_master WHERE type=? AND name=?',('table',name)).fetchone(),name
c.execute("INSERT INTO users(name,email,password,role) VALUES ('Student','s@abc.uz','hash','student')")
c.execute("INSERT INTO users(name,email,password,role) VALUES ('Admin','a@abc.uz','hash','admin')")
c.execute("INSERT INTO ops_invoices(student_id,description,amount,due_on,created_by) VALUES (1,'Tuition',150000,'2026-11-01',2)")
c.execute("INSERT INTO ops_receipts(invoice_id,amount,method,reference,recorded_by,paid_on) VALUES (1,60000,'cash','TEST-V5-001',2,'2026-11-06')")
assert c.execute('SELECT SUM(amount) FROM ops_receipts WHERE invoice_id=1 AND voided_at IS NULL').fetchone()[0]==60000
c.execute("UPDATE ops_receipts SET voided_at=CURRENT_TIMESTAMP,void_reason='Incorrect entry' WHERE reference='TEST-V5-001'")
assert c.execute('SELECT COALESCE(SUM(amount),0) FROM ops_receipts WHERE invoice_id=1 AND voided_at IS NULL').fetchone()[0]==0
try:c.execute("INSERT INTO ops_receipts(invoice_id,amount,method,reference,recorded_by,paid_on) VALUES (1,5000,'cash','TEST-V5-001',2,'2026-11-06')")
except sqlite3.IntegrityError:pass
else:raise AssertionError('Duplicate receipts should be rejected')
try:c.execute("INSERT INTO v5_exam_questions(exam_id,type,prompt,points) VALUES (999,'unknown','Invalid type',1)")
except sqlite3.IntegrityError:pass
else:raise AssertionError('Exam type check missing')
print('PASS v5:',len(c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()),'tables; duplicate, reversal, constraints')
