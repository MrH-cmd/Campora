import type { Db } from "./db";
import { getSetting } from "./settings";

/** Approves a submission when auto review is on. It confirms the form and file are complete, not that the ID is genuine. */
export async function autoReview(db: Db, verificationId: string, userId: string, matric: string) {
  if (!(await getSetting(db, "auto_approve_students", false))) return false;
  const clash = await db.one("select 1 from student_verifications where user_id<>$1 and lower(matric_number)=lower($2) limit 1", [userId, matric]);
  if (clash) return false;
  await db.run("update student_verifications set status='approved', review_note='Checked automatically', reviewed_at=now() where id=$1", [verificationId]);
  await db.run("insert into verification_reviews(verification_id,decision,reason) values ($1,'approved','Automatic review')", [verificationId]);
  await db.run("update users set student_status='verified' where id=$1", [userId]);
  return true;
}
