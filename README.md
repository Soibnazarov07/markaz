# Academy Pro — O‘quv markazi platformasi v2

Node.js + Express + Socket.IO + SQLite + WebRTC + Payme Business Merchant API. Ko‘p sahifali premium dashboard: talabalar, o‘qituvchi va administrator; kurslar, matnli/video darslar, testlar, jonli dars xonalari, real vaqt xabarlari, shaxsiy xabarlar, bildirishnomalar va server tomonidan tasdiqlanadigan to‘lovlar.

## 1. Ishga tushirish (Windows / Linux / macOS)

Node.js **20 yoki 22 LTS** va npm o‘rnating. Barcha loyiha fayllarini bitta papkaga chiqaring. VS Code terminali:

```bash
npm ci
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm start
```

Brauzer: **http://localhost:3000**. `.env` faylida kalitlarni sozlang. `npm test` testlar serverni alohida vaqtinchalik SQLite bazada ishga tushiradi.

**Faqat development rejimidagi dastlabki namuna hisoblar** (birinchi marta bo‘sh bazada): `admin@markaz.uz / admin12345` va `teacher@markaz.uz / teacher123`. Production rejimida namuna kurslar/teacher hisob yaratilmaydi. Admin uchun `ADMIN_EMAIL` va kuchli `ADMIN_PASSWORD` ni *birinchi ishga tushirishdan oldin* sozlang. **Production** majburiy: `NODE_ENV=production`, `JWT_SECRET` kamida 32 belgi va `ADMIN_PASSWORD` kamida 12 belgi; yangi, bo‘sh baza yoki tozalangan test akkauntlardan foydalaning.

## 2. Haqiqiy Payme to‘lovlari (demo emas)

Payme Business bilan merchant shartnomasi va **Merchant API** veb-kassasi talab etiladi.

1. Payme Business da billing/kassa yarating va **merchant ID** hamda **secret key** oling.
2. Payme kassa `account` maydoni nomini **`order_id`** qilib sozlang.
3. Tashqi HTTPS billing endpointini **`https://YOUR-DOMAIN/api/payments/payme`** qilib o‘rnating.
4. `.env` ichida `PAYME_MERCHANT_ID`, `PAYME_MERCHANT_KEY`, `PUBLIC_URL` ni sozlang, serverni qayta ishga tushiring. Kalitlar serverda qoladi.
5. Platforma buyurtma yaratadi, foydalanuvchini `checkout.paycom.uz` ga yo‘naltiradi. **To‘lov tasdiqlangani faqat Payme serveri `PerformTransaction` yuborganida va uning BasicAuth tekshiruvi muvaffaqiyatli bo‘lganda** qayd etiladi. Qaytish/redirect hech qachon kursga avtomatik kirish bermaydi.
6. Merchant APIda `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction` va `GetStatement` endpointlari mavjud. To‘lov summalari Payme uchun **tiyin**ga aylantiriladi. Bir xil so‘rov qayta kelsa ikki marta enroll qilinmaydi.

**Eslatma:** Real pul qabul qilishni faollashtirish uchun haqiqiy merchant hisob va production key kerak. Kalitlar berilmasa, to‘lov tugmasi xavfsiz tarzda **503 — merchant sozlanmagan** javobini qaytaradi, pullik kursni tekinga ochmaydi. Soliq/fiskal cheklar, qaytarish siyosati, provayder sertifikatsiyasi va shartnoma tekshiruvlarini o‘zingizning biznes jarayoningizga moslashtiring. To‘lov provayderining sandbox sinovlaridan o‘ting.

## 3. Zoomga o‘xshash jonli videodarslar

O‘qituvchi kursga bog‘langan darsni rejalaydi, boshlaydi va yakunlaydi. Kursga yozilgan talabalar va mas’ul o‘qituvchi videoxonaga kirishi mumkin. Kamera/mikrofonni yoqish-o‘chirish, ekran ulashish, real vaqtli video/audio, kurs chatlari bor. Socket.IO faqat ruxsatli ishtirokchilar uchun **WebRTC signaling**ni uzatadi.

**Texnik cheklov:** Bu to‘liq Zoom infratuzilmasi yoki katta konferensiya serveri emas. WebRTC P2P mesh **8 ishtirokchigacha** cheklangan. Mahalliy `localhost` yoki haqiqiy HTTPS manzilda kamera ishlaydi; mobil tarmoqlar va NAT ortida ishonchli ishlashi uchun `.env` ga **TURN server** (`TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`) qo‘shing. 20–100+ qatnashchi, video yozuv va sifatli ko‘p foydalanuvchili konferensiya uchun alohida SFU (LiveKit/Jitsi/mediasoup) kerak bo‘ladi. Ekran ulashish brauzer ruxsatiga bog‘liq.

## 4. Xabarlar, statistika, admin

- Onlayn hisoblagich Socket.IO dagi noyob avtorizatsiyalangan foydalanuvchilar va mehmon sessiyalarini sanaydi (har bir ochiq brauzer tabiiy ravishda bitta mehmon seansi).
- Kurs guruh chatlari faqat shu kurs a'zolariga ochiq. Shaxsiy chatlar adminlar yoki bir kursga aloqador talabalar/o‘qituvchilar orasida ishlaydi. Xabarlar va bildirishnomalar SQLite da saqlanadi.
- Admin panelda kurslar, rollar, yangi akkauntlar, real to‘lov holatlari, foydalanuvchilar va rejalashtirilgan videodarslarni ko‘rish/boshqarish bor. Daromad sonlari faqat server tasdiqlagan `paid` buyurtmalardan hisoblanadi.
- Mavjud test topshirish, dars progressi, AI yordamchi va kurslarni boshqarish imkoniyatlari saqlangan. `GEMINI_API_KEY` berilsa AI test generatori ishlaydi, kalitsiz foydalanilganda foydalanuvchiga ochiq xabar qaytadi.

## 5. Railway deploy

GitHubga yuklashdan oldin `.env` va `data/` gitga qo‘shilmaganini tekshiring. Railway → New Project → Deploy from GitHub. Variablesga `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PAYME_MERCHANT_ID`, `PAYME_MERCHANT_KEY`, `PUBLIC_URL` va zarur TURN/Gemini kalitlarini qo‘ying. Railway Volume ulab **`DATA_DIR=/data`** sozlang. HTTPS domenni yoqing. Database backup va monitoringni alohida sozlang. Bir serverli SQLite + Socket.IO tuzilmasi ko‘p serverli gorizontal masshtablash uchun mos emas; scale qilish uchun PostgreSQL va Redis adapter talab qilinadi.

## 6. Testlar va cheklovlar

```bash
npm ci
npm test
```

Testlar pullik kursga to‘lovsiz kirib bo‘lmasligi, Payme noto‘g‘ri kalitni rad etishi, tranzaksiya qayta kelsa idempotent javob qaytarishi, tasdiqlangan to‘lovdan keyin kurs ochilishi, xabarlar saqlanishi va jonli dars APIlarini tekshiradi. Real Payme sandbox/production pul aylanishi, WebRTC ning ikki haqiqiy qurilma bilan ishlashi va brauzer interfeysini **alohida tekshirish shart**. 100% xatosizlik kafolati emas.

## Muhim xavfsizlik tavsiyalari

`.env`ni hech kimga yubormang, maxfiy keylarni repositoriyga joylamang. Production ishga tushirishdan oldin domen HTTPS, Payme sandbox, TURN, to‘lovlar boʻyicha reconciliation, email tasdiqlash / parol tiklash, trafikni cheklash, zaxira nusxalar, jurnal/audit, asosiy administrator akkaunti uchun MFA va security auditni bajaring. Bu loyiha MVP bo‘lib, tijoriy muhitga chiqarishda qo‘shimcha operatsion nazorat talab etiladi.
