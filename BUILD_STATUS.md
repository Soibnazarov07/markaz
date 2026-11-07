# EduSphere Pro 8.1 — bajarilish holati

- V8 LMS/CRM, admin password reset, yetti rol, light/dark, chat, video, davomat, imtihon, reklama/maqola, pulni qo'lda qayd etish kodlari saqlangan.
- V8.1 bo'yicha 7 ta aniq kod muammosi tuzatildi (RELEASE_NOTES.md).
- **Offline test:** `npm run test:static` — 23/23; `npm run test:schema` — SQLite yaxlitligi va migratsiyalar; sintaksis tekshiruvi — barcha JS fayllar. Ushbu hisoblar aynan bajarilgandan keyin qayd etiladi.
- **Sinovdan o'tmagan:** `npm test` (HTTP integratsiyalar), `npm run smoke:http` (haqiqiy server), ikki foydalanuvchili brauzer chat/WebRTC, Railway deploy, mustaqil security review, katta yuklama.
- **Cheklovlar:** JWT brauzer localStorage'da, ba'zi eski API'larda filial bo'yicha qat'iy izolatsiya yakuniy auditdan o'tmagan, kichik guruhli P2P video barcha NAT/sharoitda ishlamaydi.
- To'lovlar bank integratsiyasiga ulanmaydi; admin qabul qilingan naqd/bank o'tkazmasini qo'lda qayd qiladi.
- QR davomat, Telegram bot va email orqali parol tiklash — foydalanuvchi talabiga binoan kiritilmagan.

**Xulosa: 100% production-ready yoki xatolarsiz deb sertifikatlanmaydi.** Markazga topshirishdan oldin `TOPSHIRISH_OLDIDAN.md` orqali staging testlari bajarilishi zarur.
