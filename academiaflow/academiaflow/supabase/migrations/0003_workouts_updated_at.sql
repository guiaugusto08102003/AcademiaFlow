-- Etapa 3: updated_at automático (base do sync offline) + índice
create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists workouts_touch on workouts;
create trigger workouts_touch before update on workouts for each row execute function touch_updated_at();
