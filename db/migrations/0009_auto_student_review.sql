insert into platform_settings(key, value) values ('auto_approve_students', 'true') on conflict (key) do nothing;
-- Clear what is already waiting: the newest document from each user, unless the matric number is on another account.
with latest as (
  select distinct on (user_id) id, user_id, matric_number from student_verifications
  where status = 'pending' and method = 'id_upload' order by user_id, created_at desc
), ok as (
  select l.* from latest l where not exists (
    select 1 from student_verifications o where o.user_id <> l.user_id and lower(o.matric_number) = lower(l.matric_number))
), done as (
  update student_verifications v set status = 'approved', review_note = 'Checked automatically', reviewed_at = now() from ok where v.id = ok.id returning v.id, v.user_id
), logged as (
  insert into verification_reviews(verification_id, decision, reason) select id, 'approved', 'Automatic review' from done
)
update users u set student_status = 'verified' from done where u.id = done.user_id;
