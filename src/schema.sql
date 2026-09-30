-- =====================================================
-- سامانه جامع مدیریت منابع انسانی | HRM Pro
-- Schema (SQLite) - نسخه 1.0.0
-- =====================================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT DEFAULT '',
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  employee_id INTEGER,
  is_active INTEGER DEFAULT 1,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  reset_token TEXT,
  reset_expires TEXT,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER,
  manager_id INTEGER,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS designations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department_id INTEGER,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  father_name TEXT DEFAULT '',
  national_id TEXT DEFAULT '',
  gender TEXT DEFAULT 'male',
  birth_date TEXT,
  marital_status TEXT DEFAULT 'single',
  children_count INTEGER DEFAULT 0,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  department_id INTEGER,
  designation_id INTEGER,
  branch_id INTEGER,
  manager_id INTEGER,
  shift_id INTEGER,
  hire_date TEXT,
  contract_type TEXT DEFAULT 'full_time',
  contract_end TEXT,
  base_salary REAL DEFAULT 0,
  status TEXT DEFAULT 'active',
  bank_name TEXT DEFAULT '',
  bank_account TEXT DEFAULT '',
  insurance_no TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  terminated_at TEXT,
  termination_reason TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS employee_education (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  degree TEXT DEFAULT '',
  field TEXT DEFAULT '',
  institute TEXT DEFAULT '',
  year TEXT DEFAULT '',
  gpa TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS employee_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  skill TEXT NOT NULL,
  level INTEGER DEFAULT 3,
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS employee_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  relation TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  is_emergency INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  file_path TEXT DEFAULT '',
  issue_date TEXT,
  expiry_date TEXT,
  note TEXT DEFAULT '',
  uploaded_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'full_time',
  start_date TEXT,
  end_date TEXT,
  salary REAL DEFAULT 0,
  file_path TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS job_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  department_id INTEGER,
  from_date TEXT,
  to_date TEXT,
  salary REAL DEFAULT 0,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_time TEXT DEFAULT '09:00',
  end_time TEXT DEFAULT '17:00',
  break_minutes INTEGER DEFAULT 60,
  grace_minutes INTEGER DEFAULT 15,
  work_days TEXT DEFAULT '0,1,2,3,4'
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  status TEXT DEFAULT 'present',
  late_minutes INTEGER DEFAULT 0,
  early_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  worked_minutes INTEGER DEFAULT 0,
  source TEXT DEFAULT 'manual',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS overtime_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  hours REAL DEFAULT 1,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  approver_id INTEGER,
  decision_note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  annual_quota REAL DEFAULT 26,
  is_paid INTEGER DEFAULT 1,
  color TEXT DEFAULT '#0d6efd',
  requires_doc INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  leave_type_id INTEGER NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  days REAL DEFAULT 1,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  approver_id INTEGER,
  decision_note TEXT DEFAULT '',
  attachment TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payrolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  base REAL DEFAULT 0,
  worked_days REAL DEFAULT 0,
  overtime_hours REAL DEFAULT 0,
  overtime_amount REAL DEFAULT 0,
  allowances REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  insurance REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  loan_deduction REAL DEFAULT 0,
  net REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  note TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  amount REAL DEFAULT 0,
  kind TEXT DEFAULT 'allowance'
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  total_amount REAL DEFAULT 0,
  installment_count INTEGER DEFAULT 1,
  installment_amount REAL DEFAULT 0,
  start_month TEXT,
  paid_installments INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  month TEXT,
  amount REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  weight INTEGER DEFAULT 20,
  due_date TEXT,
  progress INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in_progress',
  period TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS appraisal_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  from_date TEXT,
  to_date TEXT,
  status TEXT DEFAULT 'open',
  criteria TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS appraisals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  reviewer_id INTEGER,
  scores TEXT DEFAULT '{}',
  total REAL DEFAULT 0,
  strengths TEXT DEFAULT '',
  improvements TEXT DEFAULT '',
  final_comment TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS job_postings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  department_id INTEGER,
  location TEXT DEFAULT '',
  employment_type TEXT DEFAULT 'full_time',
  vacancies INTEGER DEFAULT 1,
  description TEXT DEFAULT '',
  requirements TEXT DEFAULT '',
  salary_min REAL DEFAULT 0,
  salary_max REAL DEFAULT 0,
  status TEXT DEFAULT 'open',
  open_date TEXT,
  close_date TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  posting_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  source TEXT DEFAULT 'website',
  stage TEXT DEFAULT 'new',
  rating INTEGER DEFAULT 0,
  expected_salary REAL DEFAULT 0,
  resume_path TEXT DEFAULT '',
  cover_note TEXT DEFAULT '',
  note TEXT DEFAULT '',
  applied_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  stage TEXT DEFAULT 'interview',
  date TEXT,
  time TEXT,
  interviewer_id INTEGER,
  location TEXT DEFAULT '',
  result TEXT DEFAULT 'pending',
  score INTEGER DEFAULT 0,
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trainings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  provider TEXT DEFAULT '',
  category TEXT DEFAULT '',
  from_date TEXT,
  to_date TEXT,
  cost REAL DEFAULT 0,
  capacity INTEGER DEFAULT 0,
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'planned'
);

CREATE TABLE IF NOT EXISTS training_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  training_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  status TEXT DEFAULT 'enrolled',
  score INTEGER DEFAULT 0,
  certificate_path TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'it',
  brand TEXT DEFAULT '',
  serial TEXT DEFAULT '',
  purchase_date TEXT,
  value REAL DEFAULT 0,
  condition TEXT DEFAULT 'new',
  status TEXT DEFAULT 'available',
  location TEXT DEFAULT '',
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  assigned_date TEXT,
  due_date TEXT,
  returned_date TEXT,
  condition_out TEXT DEFAULT '',
  condition_in TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  amount REAL DEFAULT 0,
  date TEXT,
  description TEXT DEFAULT '',
  receipt_path TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  approver_id INTEGER,
  decision_note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  user_id INTEGER NOT NULL,
  employee_id INTEGER,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  audience TEXT DEFAULT 'all',
  department_id INTEGER,
  publish_date TEXT,
  expire_date TEXT,
  pinned INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'event',
  date TEXT NOT NULL,
  time TEXT DEFAULT '',
  location TEXT DEFAULT '',
  description TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  file_path TEXT DEFAULT '',
  version TEXT DEFAULT '1.0',
  expiry_date TEXT,
  visibility TEXT DEFAULT 'all',
  uploaded_by INTEGER,
  downloads INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT DEFAULT '',
  entity_id INTEGER,
  details TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS onboarding_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  phase TEXT DEFAULT 'onboarding',
  title TEXT NOT NULL,
  assignee TEXT DEFAULT '',
  due_date TEXT,
  done INTEGER DEFAULT 0,
  done_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendance(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_month ON payrolls(month);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_logs_time ON activity_logs(created_at);
