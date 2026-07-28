-- ============================================================================
-- Fix: _random_order_number_token must be VOLATILE
-- ============================================================================
-- The 20260423 definition declared this function IMMUTABLE despite calling
-- random(). The planner constant-folds IMMUTABLE functions with constant
-- arguments, and plpgsql caches expression plans per backend — so a pooled
-- PostgREST connection can emit the SAME "random" token on every call. The
-- retry loop in create_pending_order then regenerates the identical token
-- ten times and raises "Could not generate unique order_number after 10
-- attempts" for every order after the first on that backend.
--
-- Exposed by rapid-fire staging tests on 2026-07-28; latent in production,
-- where low order volume and backend recycling have masked it. Body is
-- unchanged — only the volatility marking is corrected.
-- ============================================================================

CREATE OR REPLACE FUNCTION _random_order_number_token(p_length int DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    chars  text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    result text := '';
    i      int;
BEGIN
    FOR i IN 1..p_length LOOP
        result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    RETURN result;
END;
$$;
