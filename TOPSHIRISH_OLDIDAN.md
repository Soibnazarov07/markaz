# Markazga topshirishdan oldingi majburiy tekshiruv (EduSphere Pro 8.1)

**Muhim:** Bu versiya aniq topilgan kod muammolarini tuzatadi, ammo internet cheklovi tufayli serverning to'liq HTTP/WebRTC integratsion testlari bu yerda **ishga tushirilmagan**. ZIPni sinov muhitida tekshirmasdan real o'quvchilar va to'lovlar uchun ishga tushirmang. Hech qanday dasturga 100% xatosiz ishlash kafolati berilmaydi.

## 1. Ishga tushirish

1. ZIP ichidagi fayllarni chiqarib, `server.js`, `package.json` va `public/` bitta loyiha ildizida ekanini tekshiring.
2. Node.js 20+ o'rnatilgan bo'lsin.
3. **Railway'dagi hozirgi bazani o'chirmang**. Avval Volume'dan alohida backup oling. `DATA_DIR` volume mount path (odatda `/data`) bilan mos bo'lsin.
4. Mahalliy sinov uchun `.env.example`dan `.env` nusxa qiling. `ADMIN_EMAIL`, kuchli `ADMIN_PASSWORD` (kamida 12 belgi), `JWT_SECRET` (kamida 32 belgi) yozing. Bu qiymatlarni GitHub'ga yubormang.
5. Terminal: `npm ci`, keyin `npm run test:static`, `npm run test:schema`, `npm test`.
6. `npm start` ishga tushiring. Boshqa terminalda `npm run smoke:http` bajaring. Faqat admin login bilan o'qiladigan ma'lumotlarni tekshiradi; yozuvlarni o'zgartirmaydi.
7. Railway uchun: **eski servisni o'chirmasdan**, avval alohida staging servis + bazaning nusxasi bilan sinab ko'ring. GitHub branch va Railway Source mos bo'lsin. Production'da `NODE_ENV=production`, `ADMIN_PASSWORD` 12+, `JWT_SECRET` 32+, `DATA_DIR` to'g'ri bo'lsin.

**Eslatma:** `.env`dagi `ADMIN_PASSWORD`ni yangilash eski bazada mavjud administrator parolini o'zgartirmaydi. Parolni tiklash uchun tizimdagi super admin yoki backup va mavjud baza bilan `npm run admin:reset` usulidan foydalaning. O'quvchilar parolini faqat administrator almashtiradi.

## 2. Qo'l bilan real tekshirish

- [ ] Administrator eski yoki tiklangan parol bilan kiradi; noto'g'ri parol rad qilinadi.
- [ ] Super admin/admin rollaridagi foydalanuvchilar tegishli panelga kira oladi.
- [ ] Admin o'quvchi yaratadi, uning parolini yangilaydi: eski token va parol rad qilinadi.
- [ ] Admin o'quvchini kursga qo'shadi, o'qituvchi guruh yaratadi, boshqa guruh ma'lumotini ko'rib bo'lmaydi.
- [ ] Admin bugungi yoki o'tgan sana bilan 50 000 so'm to'lov kiritadi; tarix va qarzdorlik yangilanadi.
- [ ] Aynan bir xil hujjat raqami bilan to'lov ikkinchi marta kiritilmaydi; ortiqcha to'lov rad qilinadi.
- [ ] Admin to'lovni sabab bilan bekor qiladi; tarix o'chmaydi, balans qayta hisoblanadi.
- [ ] O'qituvchi davomatni belgilaydi; o'quvchi va ota-ona faqat o'ziga tegishlisini ko'radi.
- [ ] Test tuzish, topshirish, natija, uy vazifasi, baholash ishlaydi.
- [ ] Ikki turli brauzerda chat va videodarsni tekshiring. WebRTC uchun `HTTPS`, kamera/mikrofon ruxsatlari va NAT ortidagi foydalanuvchilarga TURN xizmati zarur bo'lishi mumkin.
- [ ] Oq va qora rejimni telefonda va kompyuterda tekshiring.
- [ ] Backup yaratiladi va alohida muhitda **tiklab ko'riladi**.
- [ ] Railway Deploy Logs xatosiz, `/api/health` HTTP 200 qaytaradi.

## 3. Tashqi xizmatlar / cheklovlar

- **Click/Uzum/Payme integratsiyasi talab qilinmaydi:** pullar faqat xodim real qabul qilgach qo'lda qayd etiladi. Bu bank bilan sinxronlangan to'lov emas.
- **QR davomat, Telegram bot, email parol tiklash talab qilinmaydi** va tegishli foydalanuvchi oqimi mavjud emas.
- **Katta videokonferensiya** uchun STUN/TURN va professional SFU kerak bo'ladi; mavjud kichik guruh WebRTC kodi internetda barcha tarmoq sharoitlarida ishlashi kafolatlanmaydi.
- **`localStorage` JWT** kelajakda HTTP-only cookies/session va CSRF bilan almashtirilishi ma'qul. Bu ZIPda to'liq ko'chirilmadi.
- **Filial izolatsiyasi** ba'zi eski endpointlarda kompleks xavfsizlik auditidan o'tmagan. Maxfiy foydalanuvchi ma'lumotlari bilan keng joriy etishdan oldin server-side permission review zarur.
- Bu muhitda **npm paketlarini DNS tufayli o'rnatishning imkoni bo'lmadi**, shuning uchun haqiqiy HTTP va WebRTC ishlashi tasdiqlanmadi. Brauzer prototipi va statik tekshiruv real deploy o'rnini bosmaydi.

## 4. Markazga ko'rsatish usuli

Dastlab **staging** domeningizni ko'rsating, namuna o'quvchi/o'qituvchi/admin hisoblaridan foydalanib barcha cheklovlarni tushuntiring. Xodimlarning haqiqiy parollari va API kalitlarini hujjatga yozmang. Real to'lovni demo deb ko'rsatib bank tasdiqlagandek da'vo qilmang.
