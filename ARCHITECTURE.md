# MUHIM (v8)

Ushbu hujjat tarixiy v3-v7 arxitektura rejasidir. **v8 uchun amal qiladigan parol va QR/Telegram siyosati** `README.md` va `SECURITY_AND_LIMITATIONS.md`da yozilgan: QR davomat va Telegram bot yo‘q, parolni faqat admin almashtiradi.

---

# EduSphere Pro — me'moriy xarita va bosqichlar

**Manba:** `Pasted text(4).txt` (37 bo‘limli talablar), `oquv-markaz-pro-v2` mavjud Node.js loyihasi.

## Muhim qaror: amaldagi Railway ma'lumotlari yo‘qolmasin

Mavjud Railway xizmatida Node.js/Express/Socket.IO/SQLite va Payme Merchant API ishlatiladi. Topshiriqda esa Next.js/React/TypeScript + NestJS + PostgreSQL/Prisma/Redis arxitekturasi so‘ralgan. **Ular bir xil stack emas**. Ushbu v3.0 — mavjud serverni to‘xtatmasdan bir necha ishlaydigan modul bilan kengaytiruvchi bosqich, yakuniy Next.js/NestJS migratsiyasi emas.

### Hozirgi ishga tushadigan tuzilma

```text
Visitor/Student/Teacher/Admin
         │ HTTPS
         ▼
    Express server (server.js)
         ├── existing auth / courses / tests / admin / Gemini
         ├── features.js (Payme, chat, WebRTC signaling, live classes)
         ├── cms.js (public site settings, uploads, articles, ads, branches, leads, groups, attendance)
         └── public-quizzes.js (public/guest quizzes and attempt records)
                   │
            SQLite: DATA_DIR/markaz.db  + DATA_DIR/media/
         ▲
Socket.IO realtime notifications ── public/app.js, features-ui.js, cms-ui.js
```

### Jadvallar va bog‘lanishlar

Mavjud jadvallar (saqlanadi): `users`, `courses`, `lessons`, `enrollments`, `tests`, `questions`, `results`, `settings`, `orders`, `payme_transactions`, `messages`, `notifications`, `live_lessons`.

Qo‘shilgan jadvallar (CREATE TABLE IF NOT EXISTS):

- `cms_articles` → `users(author_id)`; maqola nashri va rasm URI.
- `cms_ads` → placement, start/end, aggregate clicks/impressions.
- `cms_branches` → filial kontakti.
- `cms_leads` → `courses(course_id)`; kurs arizalari.
- `cms_audit` → `users(actor_id)`; CRUD amallari jurnali.
- `study_groups` → `courses(course_id)`, `users(teacher_id)`, `cms_branches(branch_id)`.
- `group_students` → `study_groups(group_id)` va `users(student_id)`.
- `class_sessions` → `study_groups(group_id)`.
- `attendance_records` → `class_sessions(session_id)`, `users(student_id)`, `users(marked_by)`.
- `public_quizzes` → ommaviy test konfiguratsiyasi.
- `public_quiz_questions` → `public_quizzes(quiz_id)`; to‘g‘ri javoblar faqat serverda.
- `public_quiz_attempts` → `public_quizzes(quiz_id)`, optional `users(user_id)`; tokenlar xeshi, deadline va natija.

Kursga yangi yozilish arizasi (`cms_leads`) avtomatik ravishda `enrollments` sifatida kiritilmaydi; bu marketing murojaati. Pullik kursga faqat haqiqiy Payme tasdig‘i huquq beradi (mavjud v2 mexanizm).

### Ruxsatlar

- `admin`: barcha yangi CMS CRUD, brending, reklama, lead statuslari, ommaviy test builder, guruh va davomat.
- `teacher`: faqat o‘ziga biriktirilgan kursdagi guruhlar va davomat. Admin kontentini tahrirlay olmaydi.
- `student`: kurs/testlar va **faqat o‘z** davomati; boshqa o‘quvchilar ro‘yxati olinmaydi.
- `guest`: published maqolalar/reklamalar/filiallar/testlar, admin ruxsat bergan guest quiz, kursga yozilish arizasi.

Ommaviy testlarda ulangan sessiya foydalanuvchisi bitta urinishga bog‘lanadi; mehmon urinishlari tasodifiy server tokenlari bilan himoyalangan. Bu to‘liq proktorlik yoki odamga bog‘langan urinish limitini bermaydi.

## Maqsad arxitektura (topshiriqdagi versiya)

```text
Browser (Next.js App Router, React, TypeScript, Tailwind, shadcn/ui)
         │ HTTPS REST / WebSockets
NestJS TypeScript API (OpenAPI, RBAC, DTO validation)
    ├─ Auth/Users/Parents/Permissions
    ├─ LMS/Courses/Groups/Schedules/Attendance/Assignments/Exams
    ├─ Billing/Payme/Click/Uzum Adapter; invoice ledger
    ├─ Public CMS/Ads/Articles/Brand/CRM
    ├─ Chat/Notifications/Files/Certificates
    └─ Reporting/Payroll/Branches/Audit
         │                          │
PostgreSQL/Prisma migrations     Redis/BullMQ/Socket Adapter
         │                          │
    Private S3 object storage    Email/SMS/Telegram service
         │
  WebRTC via Jitsi/LiveKit for large groups
```

Bu *rejalashtirilgan* arxitektura, mavjud v3 ZIP ichidagi ishga tushgan stack deb ko‘rsatilmaydi.

## Ish holatlari

| Modul | v3.0 holati | Muhim cheklov |
|---|---|---|
| Qora/apelsin public dizayn | Amalga oshirilgan | Sahifalar SPA/hash routingda, Next.js SSR emas |
| Responsive public header/footer | Amalga oshirilgan | CSS responsive, accessibility audit talab |
| Logo/favicon/telefon/Telegram CMS | Amalga oshirilgan | Admin media lokal persistent Volume'da |
| Maqolalar / category / publish | Amalga oshirilgan | Plain-text, rich-text editor va scheduled job hali yo‘q |
| Rasmli reklama, muddat, placement | Asosiy qismi | 3 ta joyda ko‘rsatiladi, boshqalari API tayyor, CTR taxminiy |
| Filial CMS va xarita linklari | Amalga oshirilgan | Xarita embed o‘rniga URL |
| CRM kurs arizasi va status | Amalga oshirilgan | Lead managerga avtomatik vazifa yo‘q |
| Ommaviy 4-variantli testlar | Amalga oshirilgan | Murakkab savollar/import/limit/keng test engine keyin |
| Kurslar / videodarslar | v2 dan saqlangan | Katta konferensiya uchun SFU yo‘q |
| Real-time xabar | v2 dan saqlangan | Media/fayl attachment va search keyin |
| Payme Merchant | v2 dan saqlangan | Merchant keys, real sandbox + fiskal audit shart |
| Guruhlar / dars davomati | Asosiy qismi | QR, oylik rejalash, ota-ona xabarlari keyin |
| Parent/accountant/branch manager | **Bajarilmagan** | Faqat qo‘shimcha reja |
| Next.js/NestJS/PostgreSQL migratsiya | **Bajarilmagan** | Alohida ko‘chirish va ma’lumot tekshiruvi kerak |
| Invoice/debt/expenses/payroll | **Bajarilmagan** | Mavjud kurs Payme buyurtmalari bundan alohida |
| CSRF/MFA/refresh token/Argon2id | **Bajarilmagan** | Hozir JWT localStorage/bcrypt asosida |

## Keyingi aniq bosqichlar

1. **Migrations & backup:** Railway Volume snapshot, eski SQLite bazasining eksporti, shadow PostgreSQL schema va to‘g‘ri moslashuv (users, courses, orders, payme transaction). Ikkita tizim ishlayotgan paytda **dual-write** yoki maintenance window rejalash.
2. **Identity/RBAC:** Next.js + NestJS, Argon2id, httpOnly-cookie sessiya, email verification/reset/MFA, Super Admin, Parent, Accountant, Branch Manager rollari, audit.
3. **Education:** dars jadvali va konfliktlar, QR attendance, assignments, grades, parent-child relations.
4. **Finance:** invoice, qarzdorlik, chegirma, refund ledger, Click/Uzum adapterlari, Payme sandbox certification.
5. **Communication:** scalable Socket.IO Redis adapter, private file attachments, Zoom/Meet/Jitsi integration, rate limits.
6. **Operation:** queue, email/SMS, object storage, Sentry/logging, E2E browser tests, perf & security penetration tests.

Har bir bosqichdagi ishni staging muhitda sinab, keyin ma'lumotni saqlagan holda ishlab chiqarish muhitiga olib chiqing.
