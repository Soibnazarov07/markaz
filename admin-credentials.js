'use strict';
/** Administrator-managed password recovery only. No email or user-initiated reset endpoint. */
const bcrypt = require('bcryptjs');

module.exports = function adminCredentials({ app, db, io, auth, role }) {
  // Single-service throttling. For horizontally scaled deployments use Redis-backed limiting.
  const failures = new Map();
  const limitWindowMs = 15 * 60 * 1000;
  const maxFailures = 7;
  const fail = (res, message, status = 400) => res.status(status).json({ error: message });
  const audit = db.prepare(`INSERT INTO v6_activity_log(actor_id,action,target,target_id,details)
    VALUES(?, 'password_reset', 'user', ?, ?)`);

  app.put('/api/admin/users/:id/password', auth(), role('admin', 'super_admin'), (req, res, next) => {
    try {
      const uid = Number(req.params.id);
      if (!Number.isSafeInteger(uid) || uid < 1) return fail(res, 'Foydalanuvchi ID noto‘g‘ri');
      const target = db.prepare('SELECT id,role,password FROM users WHERE id=?').get(uid);
      if (!target) return fail(res, 'Foydalanuvchi topilmadi', 404);
      const actor = db.prepare('SELECT id,role,password FROM users WHERE id=?').get(req.user.id);
      if (!actor || !['admin', 'super_admin'].includes(actor.role)) return fail(res, 'Ruxsat yo‘q', 403);

      // Normal admins may reset staff/student accounts, or their OWN password.
      // Only super admin may reset another administrator. Nobody may reset another super admin.
      if (target.role === 'super_admin' && actor.id !== uid) return fail(res, 'Boshqa super administrator parolini o‘zgartirish mumkin emas', 403);
      if (target.role === 'admin' && actor.role !== 'super_admin' && actor.id !== uid) {
        return fail(res, 'Boshqa administrator parolini faqat super admin almashtiradi', 403);
      }

      const key = String(actor.id);
      const now = Date.now();
      const attempts = (failures.get(key) || []).filter(ts => now - ts < limitWindowMs);
      if (attempts.length >= maxFailures) return fail(res, 'Juda ko‘p urinish. 15 daqiqadan keyin urinib ko‘ring', 429);

      const adminPassword = typeof req.body?.admin_password === 'string' ? req.body.admin_password : '';
      const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
      if (adminPassword.length > 128) return fail(res, 'Joriy parol noto‘g‘ri', 403);
      if (!bcrypt.compareSync(adminPassword, actor.password)) {
        attempts.push(now); failures.set(key, attempts);
        return fail(res, 'Administratorning joriy paroli noto‘g‘ri', 403);
      }
      failures.delete(key);

      if (newPassword.length < 12 || newPassword.length > 128) return fail(res, 'Yangi parol 12–128 belgidan iborat bo‘lishi kerak');
      if (bcrypt.compareSync(newPassword, target.password)) return fail(res, 'Yangi parol eskisidan farq qilishi kerak');
      const reset2fa = req.body?.reset_2fa === true;
      const hashedPassword = bcrypt.hashSync(newPassword, 12);
      const reset = db.transaction(() => {
        db.prepare('UPDATE users SET password=?,session_version=session_version+1 WHERE id=?')
          .run(hashedPassword, uid);
        if (reset2fa) db.prepare('DELETE FROM v6_totp WHERE user_id=?').run(uid);
        audit.run(actor.id, uid, reset2fa ? 'admin-recovery: password and 2FA' : 'admin-recovery: password');
      });
      reset();
      io.to('user:' + uid).emit('security:session-revoked');
      io.in('user:' + uid).disconnectSockets(true);
      res.json({ ok: true, logout_required: actor.id === uid });
    } catch (e) { next(e); }
  });
};
