# EduSphere Pro 8.2 — release verification package

**Qadamlar:** `npm ci`, `npm run test:release`, then check `REAL_TEST_RESULTS.md` and `RAILWAY_FINAL_CHECKLIST.md`.

This release contains additional **tests** for the existing EduSphere Pro 8.1 application. It has not been deployed to Railway or fully certified. All HTTP, video signaling and load tests run with an isolated database; they are not intended for a live production server.

For the school center: QR attendance, Telegram bots and email password recovery are intentionally not included. Passwords are reset by authorized administrators. Tuition is entered manually by admins/accounting staff; no Click/Uzum/Payme integration is required. Light/dark modes are retained.

# EduSphere Pro v8.1 — markazga topshirish uchun tekshirilgan kod to‘plami

**Birinchi o‘qiladigan fayl:** [`TOPSHIRISH_OLDIDAN.md`](TOPSHIRISH_OLDIDAN.md). V8.1 tuzatishlari: [`RELEASE_NOTES.md`](RELEASE_NOTES.md).

## V8 dan saqlangan modullar

Bu **mavjud v7 tizimining yangilangan kodi**, Railway'dagi o‘quvchilar, guruhlar, kurslar va to‘lovlar bazasini o‘chirishni talab qilmaydi. **Hamma modul production sinovdan o‘tgan deb hisoblanmaydi** (`BUILD_STATUS.md`).

## Siz so‘ragan yakuniy tartib

- **QR davomat olib tashlandi:** v7 QR ekranlari va `/api/v7/attendance/qr/*` APIlari ishlatilmaydi. O‘qituvchi odatdagi davomat panelida kelgan/kelmagan/kechikkan holatlarini belgilaydi. Oldindan bazada yaratilgan QR jadvallar xavfsizlik uchun **o‘chirib yuborilmaydi**, lekin yangi kod ularga murojaat qilmaydi.
- **Telegram bot integratsiyasi yo‘q:** monitoring botiga xabar yuborish kodi va muhit o‘zgaruvchilari olib tashlandi. Sayt ichidagi bildirishnomalar saqlanadi. Marketing uchun admin kiritgan **Telegram kontakt havolasi** saqlangan — bu bot/API integratsiyasi emas.
- **Email orqali parol tiklash yo‘q:** `Forgot password` xizmati yo‘q va yaratilmadi. O‘quvchi/o‘qituvchi/ota-ona/buxgalter o‘z parolini mustaqil tiklay olmaydi. **Admin panel → Foydalanuvchilar → Parolni tiklash** orqali administrator o‘zgartiradi.
- **Qo‘lda to‘lov:** admin/buxgalter qabul qilgan to‘lov summasi, sanasi, turi va izohini mavjud v5 modulga kiritadi. Click, Uzum va Payme kalitlari shart emas.
- **Oq/qora dizayn**, kurslar, guruhlar, testlar, chat, jonli dars va boshqa v7 modullari saqlangan.

## Administrator parolni qanday o‘zgartiradi?

1. Admin akkauntingiz bilan saytga kiring.
2. **Admin → Foydalanuvchilar** bo‘limini oching.
3. Foydalanuvchi yonidagi **Parolni tiklash** tugmasini bosing.
4. Administratorning **joriy paroli**ni, foydalanuvchining **yangi parolini (12–128 belgi)** va tasdiqni kiriting.
5. Agar foydalanuvchi Authenticator kodini ham yo‘qotgan bo‘lsa, tegishli 2FA tiklash katagini belgilang; aks holda uni belgilamang.
6. **Parolni almashtirish**ni bosing. Yangi parol xesh ko‘rinishida bazaga saqlanadi, oldingi JWT sessiyalar versiyasi bekor qilinadi va faol socket aloqalari uziladi. Amal audit jurnaliga yoziladi.

Huquqlar: admin odatiy foydalanuvchilar parolini o‘zgartiradi, **boshqa admin parolini faqat super admin o‘zgartiradi**. Hech kim boshqa super admin parolini reset qilmaydi. Administrator o‘z parolini o‘zgartirsa, qayta kirishi kerak.

Agar **asosiy adminning paroli unutilgan** bo‘lsa, saytdan kirib reset qilishning iloji yo‘q. Railway Volume backup oling va CLI'dagi `npm run admin:reset` skriptini faqat mavjud DB va to‘g‘ri `DATA_DIR` bilan ishlating. Bu bir dona admin akkaunti uchun mo‘ljallangan. `.env`dagi `ADMIN_PASSWORD`ni almashtirish **mavjud admin DB parolini o‘zi o‘zgartirmaydi**.

## Ishga tushirish

Node.js >=20 tavsiya etiladi:

```bash
npm ci
cp .env.example .env   # Windows'da faylni qo‘lda nusxalang
npm start
```

Brauzer: `http://localhost:3000`. Production uchun `NODE_ENV=production`, kamida 32 belgili **mavjud** `JWT_SECRET`, `ADMIN_EMAIL`, 12+ belgili `ADMIN_PASSWORD`, `DATA_DIR` va Railway Volume pathni tekshiring. `.env`, `data`, `node_modules` GitHubga joylanmasin.

## Tekshiruv

```bash
npm run test:schema
npm run test:static
npm run test:credentials
npm test
```

`test:schema` va `test:static` Node/Python utilitalari bilan ishlaydi. `test:credentials` administrator parolini tiklashdagi ruxsatlar, audit, sessiya versiyasi va rad etish holatlarini izolyatsiyalangan testda tekshiradi. `npm test` esa **haqiqiy HTTP integratsion testlarni** bajarish uchun `npm ci` va serverni ishga tushiruvchi paketlar talab qiladi.

## Railway — asosiy saytni buzmaslik

1. Oldingi `markaz` GitHub branch va Railway xizmatining Source bog‘lanishini aniqlang.
2. **Railway Volume /data bazasidan backup yarating.** Ma’lumotlar saqlanayotgan mount pathga mos `DATA_DIR`ni saqlang.
3. V8 ni avval alohida staging servis/ma’lumotlar bazasi nusxasiga deploy qiling.
4. Admin login → foydalanuvchilar ro‘yxati → parolni reset → eskisi bilan login 401 → yangisi bilan login 200; qo‘lda to‘lov va davomatni tekshiring.
5. Testlar va zaxira tayyor bo‘lsa, eski repository kodini v8 bilan yangilang va Railway Deploy Logs'ni tekshiring.

**Qayd:** QR va Telegram bot tizimi UI/API kodidan olib tashlandi; eski DB jadvallari tarixiy yaxlitlik uchun saqlanadi. 

## V8.1 tekshiruv buyruqlari

```bash
npm ci
npm run test:static
npm run test:schema
npm test
npm start
# boshqa terminalda (yoki staging server BASE_URL bilan):
npm run smoke:http
```

`npm test` HTTP integratsion testlarini ishga tushiradi; buning uchun `npm ci` va internet kerak.
