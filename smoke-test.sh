#!/bin/bash
# تست دود (smoke test) سامانه — فقط برای توسعه
BASE="http://127.0.0.1:3000"
JAR="/tmp/hrm-cookies.txt"
rm -f "$JAR"

fail=0
check() {
  local url="$1" expect="$2" name="$3"
  local code
  code=$(curl -s -o /tmp/hrm-out.html -w "%{http_code}" -b "$JAR" -c "$JAR" "$BASE$url")
  if [ "$code" != "$expect" ]; then
    echo "FAIL [$name] $url → $code (expected $expect)"
    fail=1
    grep -o 'Error[^<]*' /tmp/hrm-out.html | head -2
    grep -oE 'message[^,]*' /tmp/hrm-out.html | head -2
  fi
}

echo "== نصب =="
check "/install" 200 "install page"
CSRF=$(curl -s -c "$JAR" "$BASE/install" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"//')
echo "csrf: ${CSRF:0:8}..."
code=$(curl -s -o /tmp/hrm-inst.html -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/install" \
  --data-urlencode "_csrf=$CSRF" \
  --data-urlencode "company_name=شرکت تست" \
  --data-urlencode "system_name=سامانه تست" \
  --data-urlencode "admin_username=admin" \
  --data-urlencode "admin_pass=admin123" \
  --data-urlencode "admin_pass2=admin123" \
  --data-urlencode "demo=1")
if [ "$code" != "200" ]; then echo "FAIL install POST → $code"; grep -o 'Error[^<]*' /tmp/hrm-inst.html | head -3; fail=1; else echo "install OK"; fi

echo "== ورود =="
CSRF=$(curl -s -b "$JAR" -c "$JAR" "$BASE/login" | grep -o 'name="_csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"//')
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" -c "$JAR" -X POST "$BASE/login" \
  --data-urlencode "_csrf=$CSRF" \
  --data-urlencode "username=admin" \
  --data-urlencode "password=admin123")
echo "login POST → $code (302 expected)"
if [ "$code" != "302" ]; then fail=1; fi

echo "== صفحات اصلی =="
pages=(
  "/" "داشبورد"
  "/about" "درباره"
  "/employees" "کارکنان"
  "/employees/new" "کارمند جدید"
  "/employees/1" "پرونده کارمند"
  "/employees/1?tab=job" "تب شغل"
  "/employees/1?tab=edu" "تب تحصیلات"
  "/employees/1?tab=skills" "تب مهارت"
  "/employees/1?tab=family" "تب خانواده"
  "/employees/1?tab=documents" "تب مدارک"
  "/employees/1?tab=att" "تب حضور"
  "/employees/1?tab=payroll" "تب حقوق"
  "/employees/1?tab=assets" "تب اموال"
  "/employees/1?tab=perf" "تب اهداف"
  "/employees/1?tab=checklist" "تب چک‌لیست"
  "/employees/1/edit" "ویرایش کارمند"
  "/employees/1/print" "چاپ پرونده"
  "/employees/orgchart" "چارت سازمانی"
  "/departments" "دپارتمان"
  "/departments/new" "دپارتمان جدید"
  "/designations" "سمت‌ها"
  "/branches" "شعب"
  "/contracts" "قراردادها"
  "/employee-documents" "مدارک کارکنان"
  "/attendance" "حضور روزانه"
  "/attendance/calendar?employee=1" "تقویم حضور"
  "/attendance/report" "گزارش حضور"
  "/overtime" "اضافه‌کاری"
  "/overtime/approvals" "تایید اضافه‌کاری"
  "/shifts" "شیفت‌ها"
  "/holidays" "تعطیلات"
  "/leave" "مرخصی"
  "/leave/new" "درخواست مرخصی"
  "/leave/approvals" "تایید مرخصی"
  "/leave/balances" "مانده‌ها"
  "/leave/team-calendar" "تقویم تیمی"
  "/leave-types" "انواع مرخصی"
  "/payroll" "لیست حقوق"
  "/loans" "وام"
  "/goals" "اهداف"
  "/appraisals" "ارزیابی‌ها"
  "/appraisals/new" "ارزیابی جدید"
  "/appraisal-cycles" "دوره‌های ارزیابی"
  "/postings" "آگهی‌ها"
  "/candidates" "کاندیداها"
  "/candidates?view=kanban" "کانبان"
  "/candidates/new" "کاندیدای جدید"
  "/candidates/1" "جزئیات کاندیدا"
  "/interviews" "مصاحبه‌ها"
  "/trainings" "دوره‌ها"
  "/trainings/1/detail" "جزئیات دوره"
  "/enrollments" "ثبت‌نام‌ها"
  "/assets" "دارایی‌ها"
  "/asset-assignments" "تحویل اموال"
  "/expenses" "هزینه‌ها"
  "/expenses/new" "هزینه جدید"
  "/tickets" "تیکت‌ها"
  "/tickets/new" "تیکت جدید"
  "/announcements" "مدیریت اطلاعیه"
  "/announcements/all" "اطلاعیه‌ها"
  "/announcements/view/1" "مشاهده اطلاعیه"
  "/events" "رویدادها"
  "/events/calendar" "تقویم رویداد"
  "/documents" "مخزن اسناد"
  "/directory" "دایرکتوری"
  "/directory/1" "پروفایل عمومی"
  "/reports" "مرکز گزارش"
  "/reports/headcount" "ترکیب پرسنل"
  "/reports/attendance-summary" "خلاصه حضور"
  "/reports/birthdays" "تولدها"
  "/reports/expiring" "انقضاها"
  "/reports/performance" "گزارش عملکرد"
  "/reports/training" "گزارش آموزش"
  "/reports/payroll-cost" "هزینه حقوق"
  "/reports/recruitment" "گزارش جذب"
  "/reports/expenses" "گزارش هزینه"
  "/users" "کاربران"
  "/roles" "نقش‌ها"
  "/settings" "تنظیمات"
  "/backup" "پشتیبان"
  "/activity" "لاگ"
  "/notifications" "اعلان‌ها"
  "/profile" "پروفایل من"
  "/change-password" "تغییر رمز"
  "/search?q=%D8%B9%D9%84%DB%8C" "جستجو"
  "/payroll/slip/1" "فیش حقوقی"
)
for ((i=0; i<${#pages[@]}; i+=2)); do
  url="${pages[$i]}"
  name="${pages[$((i+1))]}"
  check "$url" 200 "$name"
done

echo "== خروجی‌ها =="
check "/employees/export" 200 "CSV کارکنان"
check "/leave/balances?csv=1" 200 "CSV مانده"
check "/attendance/report?csv=1" 200 "CSV حضور"
check "/backup/download" 200 "دانلود پشتیبان"
check "/reports/headcount?csv=1" 200 "CSV ترکیب"

if [ $fail -eq 0 ]; then echo ""; echo "✅ همه تست‌ها پاس شد"; else echo ""; echo "❌ خطاهایی وجود دارد"; exit 1; fi
