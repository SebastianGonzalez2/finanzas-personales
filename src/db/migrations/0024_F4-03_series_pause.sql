-- RF-035 / CA-047: explicit pause and resume of a private series.
-- Only the lifecycle flag moves; period history and state stay untouched.
GRANT UPDATE (paused, version) ON finance.recurring_series TO finanzas_app;
