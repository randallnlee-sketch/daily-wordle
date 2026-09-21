-- Run this entire file in Supabase: SQL Editor > New query > Run.
-- Only database functions are public; the answer table is not.

create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_date date not null unique,
  answer text not null check (answer ~ '^[a-z]{5}$'),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.game_sessions (
  puzzle_id uuid not null references public.puzzles(id) on delete cascade,
  player_id uuid not null,
  player_name text not null check (char_length(player_name) between 1 and 24),
  guesses jsonb not null default '[]'::jsonb,
  guess_count integer not null default 0 check (guess_count between 0 and 6),
  state text not null default 'playing' check (state in ('playing', 'won', 'lost')),
  completed_at timestamptz,
  primary key (puzzle_id, player_id)
);

alter table public.puzzles enable row level security;
alter table public.game_sessions enable row level security;

create or replace function public.get_today_puzzle()
returns table (id uuid, puzzle_date date)
language sql security definer set search_path = public
as $$
  select p.id, p.puzzle_date
  from puzzles p
  where p.puzzle_date = current_date and p.published = true;
$$;

create or replace function public.submit_guess(
  p_puzzle_id uuid, p_player_id uuid, p_player_name text, p_guess text
)
returns table (state text, guess_count integer, rows jsonb, answer text)
language plpgsql security definer set search_path = public
as $$
declare
  v_answer text;
  v_session game_sessions%rowtype;
  v_feedback text[] := array_fill('absent'::text, array[5]);
  v_remaining text[];
  v_position integer;
  v_rows jsonb;
  v_count integer;
  v_state text;
  i integer;
begin
  select p.answer into v_answer from puzzles p
  where p.id = p_puzzle_id and p.puzzle_date = current_date and p.published = true;
  if v_answer is null then raise exception 'Today’s puzzle is unavailable.'; end if;
  if p_guess !~ '^[a-z]{5}$' then raise exception 'Enter a five-letter word.'; end if;

  select * into v_session from game_sessions where puzzle_id = p_puzzle_id and player_id = p_player_id;
  if found and v_session.state <> 'playing' then
    return query select v_session.state, v_session.guess_count, v_session.guesses, v_answer;
    return;
  end if;

  v_remaining := regexp_split_to_array(v_answer, '');
  for i in 1..5 loop
    if substr(p_guess, i, 1) = substr(v_answer, i, 1) then
      v_feedback[i] := 'correct';
      v_remaining[i] := null;
    end if;
  end loop;
  for i in 1..5 loop
    if v_feedback[i] <> 'correct' then
      v_position := array_position(v_remaining, substr(p_guess, i, 1));
      if v_position is not null then
        v_feedback[i] := 'present';
        v_remaining[v_position] := null;
      end if;
    end if;
  end loop;

  v_count := coalesce(v_session.guess_count, 0) + 1;
  v_state := case when p_guess = v_answer then 'won' when v_count >= 6 then 'lost' else 'playing' end;
  v_rows := coalesce(v_session.guesses, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('guess', p_guess, 'feedback', v_feedback));
  insert into game_sessions (puzzle_id, player_id, player_name, guesses, guess_count, state, completed_at)
  values (p_puzzle_id, p_player_id, trim(p_player_name), v_rows, v_count, v_state, case when v_state = 'playing' then null else now() end)
  on conflict (puzzle_id, player_id) do update set
    player_name = excluded.player_name, guesses = excluded.guesses, guess_count = excluded.guess_count,
    state = excluded.state, completed_at = excluded.completed_at;
  return query select v_state, v_count, v_rows, case when v_state = 'playing' then null else v_answer end;
end;
$$;

create or replace function public.get_puzzle_stats(p_puzzle_id uuid)
returns table (players bigint, solved bigint, average_guesses numeric)
language sql security definer set search_path = public
as $$
  select count(*), count(*) filter (where state = 'won'), round(avg(guess_count) filter (where state = 'won'), 1)
  from game_sessions where puzzle_id = p_puzzle_id and state <> 'playing';
$$;

grant execute on function public.get_today_puzzle() to anon;
grant execute on function public.submit_guess(uuid, uuid, text, text) to anon;
grant execute on function public.get_puzzle_stats(uuid) to anon;

-- The game changes at midnight Pacific time, rather than midnight UTC.
alter function public.get_today_puzzle() set timezone to 'America/Los_Angeles';
alter function public.submit_guess(uuid, uuid, text, text) set timezone to 'America/Los_Angeles';

-- Add a new word each day (or schedule it ahead) with a line like this:
-- insert into public.puzzles (puzzle_date, answer)
-- values ((now() at time zone 'America/Los_Angeles')::date, 'crane');
