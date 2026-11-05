import type { Db } from "./db";

export const notify = (db: Db, userId: string, title: string, body: string | null, href: string) =>
  db.run("insert into notifications(user_id, title, body, href) values ($1,$2,$3,$4)", [userId, title, body, href]);

export const logAdmin = (db: Db, adminId: string, action: string, targetType: string, targetId: string, meta: object = {}) =>
  db.run("insert into admin_activity_logs(admin_id, action, target_type, target_id, meta) values ($1,$2,$3,$4,$5)",
    [adminId, action, targetType, targetId, meta]);
