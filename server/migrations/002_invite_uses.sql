-- Кто по какой ссылке-приглашению пришёл. Один человек может воспользоваться несколькими ссылками:
-- например, зарегистрировался сам, а потом получил ссылку на курс.
CREATE TABLE invite_uses (
  invite_id   int NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invite_id, user_id)
);
CREATE INDEX invite_uses_user_idx ON invite_uses(user_id);

INSERT INTO invite_uses (invite_id, user_id, created_at)
SELECT invite_id, id, created_at FROM users WHERE invite_id IS NOT NULL;
