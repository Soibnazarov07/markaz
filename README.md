# O'quv Markaz platformasi

Node.js + Express + Socket.IO + SQLite. Liquid Glass (iOS) dizayn, real vaqt, kurslar, testlar, AI, admin va o'qituvchi panellari.

## Kompyuterda ishga tushirish (VS Code terminali)
```bash
npm install
npm start
```
Brauzerda: http://localhost:3000

Tayyor akkauntlar (birinchi ishga tushishda yaratiladi):
- Admin: admin@markaz.uz / admin12345
- O'qituvchi: teacher@markaz.uz / teacher123

Parolni `.env` faylidagi `ADMIN_EMAIL` / `ADMIN_PASSWORD` orqali o'zgartiring (birinchi ishga tushishdan oldin).

## AI ulash
`.env` ichiga `ANTHROPIC_API_KEY=sk-ant-...` yozing (console.anthropic.com dan oling). Kalitsiz sayt ishlayveradi, AI esa "ulanmagan" deb javob beradi.

## Railway'ga joylash
1. Loyihani GitHub'ga yuklang (`.env` va `data` papkasi `.gitignore`da, yuklanmaydi).
2. railway.com → New Project → Deploy from GitHub repo.
3. Variables bo'limiga qo'shing: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`.
4. **Muhim:** Volume qo'shing (mount path: `/data`) va `DATA_DIR=/data` o'zgaruvchisini yozing. Aks holda har deployda baza o'chib ketadi.
5. Settings → Networking → Generate Domain.

## Markaz nomi
Admin panel → Sozlamalar bo'limida nom va tavsifni o'zgartirasiz, sayt hamma joyda darhol yangilanadi.
