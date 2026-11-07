# EduSphere Pro 8.1 — aniq tuzatishlar

V8 dan asosiy yangilanishlar:

1. **Buxgalteriya/tolovlar:** eski `/api/ops/receipts` endpointi va yangi `/api/ops/manual-payments` endpointi **bir xil tranzaksion qo'lda to'lov handlerini** ishlatadi. Sana, audit, takroriy hujjat raqami va kursga kirishni tekshirish qoidalari bir xil bo'ladi. Eski frontend ham ishlashda davom etadi.
2. **Super Admin:** eski hisob-faktura va qo'lda to'lovlar tarixini ko'rish huquqi, tegishli navigatsiya tuzatildi.
3. **Rollar:** rol o'zgargach foydalanuvchining `session_version` oshiriladi, eski JWT rad etiladi, Socket.IO sessiyasi uziladi.
4. **API 404:** noma'lum `/api/*` manziliga SPA HTML emas, JSON 404 javob qaytariladi.
5. **Ro'yxatdan o'tish:** yangi parol 12–128 belgili bo'lishi kerak (admin yaratganlar kabi). Login HTML validatsiyasi ham moslashtirildi.
6. **Moliya UI:** to'lovlar ro'yxatida `paid_on` haqiqiy kiritilgan sana ko'rsatiladi.
7. **Sinovlar:** 4 ta yangi regression testi va hech narsani yozmaydigan `npm run smoke:http` skripti. `TOPSHIRISH_OLDIDAN.md` qabul ro'yxati.

**Bajarilmagan:** paketlarni o'rnatib haqiqiy HTTP/E2E, WebRTC, xavfsizlik pen-test, katta yuklama, real Railway deploy testlari. Bularni yaroqlilik tasdig'i sifatida ko'rsatish mumkin emas.
