-- Indexes for the per-request account-state check in middleware/authenticate.js.
--
-- Authentication now confirms on every request that the account still exists,
-- is active, and is not banned — previously a JWT issued before a ban,
-- deactivation or deletion kept working for its full hour.
--
-- That check runs an EXISTS lookup against user_bans on every authenticated
-- request, and user_bans had no index at all, so it was a full table scan.
-- `users` is covered by its INTEGER PRIMARY KEY (the implicit rowid), so only
-- the ban lookup needs help here.
CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON user_bans(user_id);

-- Refresh tokens are now deleted per-user when an admin bans someone, and
-- expired rows are swept per-user on every login.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
