# Xavfsizlik va cheklovlar — v8

- Faqat `admin` va `super_admin` foydalanuvchi parolini tiklash endpointiga kira oladi; har bir o‘zgarish uchun **administratorning joriy paroli** talab qilinadi.
- Oddiy administrator boshqa admin yoki super admin parolini o‘zgartirmaydi. Super admin ham boshqa super admin parolini o‘zgartira olmaydi.
- Yangi parol `bcrypt` xeshi sifatida yoziladi va avvalgi tokenlarni haqiqiylashtirishda ishlatiladigan `session_version` oshiriladi. Faol foydalanuvchi socket aloqasi uziladi. **Tugmani bosishdan oldin o‘quvchining ruxsatini va shaxsini tekshiring.**
- 2FA ni bekor qilish tanlovi xavfsizlikka ta’sir qiladi: faqat hisob egasi Authenticator'ni yo‘qotganda va shaxsi tasdiqlanganda ishlating.
- Xatolik holatlarida audit logga maxfiy parollar yozilmaydi. Parolni foydalanuvchiga xavfsiz kanal orqali yetkazing va chatda ochiq ulashmang.
- Serverdagi hisob autentifikatsiyasi `localStorage` JWT sxemasi; hali `httpOnly` secure cookies, CSRF va mustaqil xavfsizlik auditiga ko‘chirilmagan.
- QR davomatning eski **bazadagi jadvallari o‘chirilmagan**: mavjud Railway ma’lumotlarini buzmaslik uchun. Yangi UI va endpointlar ishlatilmaydi.
- Telegram bot/in-appga tashqi yuborish kodi yo‘q. CMS’dagi Telegram havola — oddiy kontakt link, integratsiya emas.
- `scripts/monitor-health.js` faqat URL'ni tekshiradi va xatolarni konsolga yozadi; tashqi SMS/TG/email xabari yubormaydi.
- Telegram/email parolni tiklash yo‘q. Administrator ham parolini unutsa, mavjud yagona admin uchun CLI/reset va Railway Volume backup orqali xavfsiz tiklash ko‘zda tutilgan.
- To‘lovlar admin tomonidan qo‘lda qayd etiladi, real bank provayderini tasdiqlash emas. Moliyaviy hujjatlar muntazam tekshirilsin.
- `npm test` va real browser/Payme/WebRTC/staging testlar bu muhitda to‘liq ishga tushirilgani tasdiqlanmagan. Productiondan oldin staging'da tekshiring.
