# Railway'ni v8'ga yangilash

1. Eski saytingizning Railway → Service → Settings → Source bo‘limida ulangan `markaz` repository va branchni tekshiring.
2. Railway → Volumes → Backups orqali **mavjud `/data` bazasidan zaxira nusxa** oling. `DATA_DIR` va `JWT_SECRET`ni o‘zgartirmang.
3. ZIP ichidagi fayllarni GitHub repository ildiziga, `public` va `scripts`, `tests` papkalarini ichidagi fayllar bilan to‘g‘ri joylashtiring. `node_modules`, `.env`, `data`ni yuklamang. Eski keraksiz duplikat frontend fayllarini alohida tekshirib tozalang.
4. GitHub commit qilishdan oldin staging branch/servisda `npm ci`, `npm run test:static`, `npm run test:credentials`, `npm run test:schema` va `npm test`ni ishga tushiring.
5. Railway Variables: `NODE_ENV=production`, avvalgi `JWT_SECRET`, `DATA_DIR=/data` (faqat Volume haqiqatan `/data` bo‘lsa), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+). Monitoring Telegram keylari kerak emas.
6. Admin panel → Foydalanuvchilar → Parolni tiklash sahifasini ikki akkaunt bilan sinang. Yangi parol bilan login va eski token bilan 401 javobni tekshiring.
7. Agar administratorning o‘zi saytga kira olmasa, `.env`ni almashtirish yetarli emas. **Backup olgandan so‘ng**, `npm run admin:reset` CLI buyruqni amaldagi Volume'da ishlating. Skript yagona `admin` akkauntini tiklaydi.
8. Oddiy davomat, kurslar, chat va **admin qo‘lda to‘lov kiritish** sahifalarini ham alohida sinang.
9. Faqat stagingda hammasi to‘g‘ri ishlasa, asosiy branchga v8'ni commit qilib deploy qiling; Logs/Health tekshiring.

## Nima olib tashlandi?
- QR havola orqali davomat sahifalari va APIlari; oddiy davomat saqlanadi.
- Telegram **bot** monitoring orqali yuborish.
- Barcha foydalanuvchiga o‘z parolini mustaqil o‘zgartirish sahifasi; administrator paneli orqali parol tiklash ishlatiladi.

## Nima saqlandi?
- CMS kontaktlaridagi Telegram username/t.me linklar (ixtiyoriy oddiy reklama/kontakt havolasi).
- Oq va qora rejim, qo‘lda to‘lovlar, kurslar, testlar, chat va boshqa mavjud panellar.
