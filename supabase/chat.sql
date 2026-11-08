-- Portfolio live chat: visitor comments for elvinjhongimena.com (Halftone theme).
-- Run once in the Supabase dashboard → SQL Editor → New query → paste → Run.
-- It lives in the same Supabase project as Tug of Math but touches no Tug of Math table.
--
-- Moderating: Table Editor → portfolio_chat. Tick "hidden" on a row to take it off the
-- site, or delete the row. To reply as yourself, insert a row there with is_owner = true
-- (it shows with a check mark; visitors can't set that or use a name containing "elvin").

create table if not exists public.portfolio_chat (
  id          bigint generated always as identity primary key,
  name        text        not null check (char_length(name) between 2 and 24),
  body        text        not null check (char_length(body) between 1 and 200),
  is_owner    boolean     not null default false,
  hidden      boolean     not null default false,
  ip_hash     text,                                   -- md5 of the sender's IP, only for rate limits
  created_at  timestamptz not null default now()
);
create index if not exists portfolio_chat_created_idx on public.portfolio_chat (created_at desc);
create index if not exists portfolio_chat_ip_idx      on public.portfolio_chat (ip_hash, created_at desc);

-- Visitors (the public key) may read visible messages and post a name + message. Nothing else:
-- no editing, no deleting, and the ip_hash / hidden / is_owner columns stay out of reach.
alter table public.portfolio_chat enable row level security;
revoke all on public.portfolio_chat from anon, authenticated;
grant select (id, name, body, is_owner, created_at) on public.portfolio_chat to anon, authenticated;
grant insert (name, body)                           on public.portfolio_chat to anon, authenticated;

drop policy if exists "Visible messages are public" on public.portfolio_chat;
create policy "Visible messages are public" on public.portfolio_chat
  for select to anon, authenticated using (not hidden);

drop policy if exists "Anyone can post" on public.portfolio_chat;
create policy "Anyone can post" on public.portfolio_chat
  for insert to anon, authenticated with check (not hidden and not is_owner);

-- Checks every message sent through the website (rows you add in the dashboard skip them):
-- tidy spacing, no links, no swearing, nobody posing as Elvin, and a rate limit per IP.
-- The error text is a short code the site turns into a friendly message.
create or replace function public.portfolio_chat_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hdrs json := nullif(current_setting('request.headers', true), '')::json;
  ip   text;
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.body := btrim(regexp_replace(new.body, '\s+', ' ', 'g'));
  new.created_at := now();

  if hdrs is null then
    return new;                                       -- dashboard / SQL editor: trusted
  end if;

  new.is_owner := false;
  new.hidden := false;

  ip := coalesce(nullif(hdrs ->> 'cf-connecting-ip', ''),
                 nullif(btrim(split_part(coalesce(hdrs ->> 'x-forwarded-for', ''), ',', 1)), ''),
                 'unknown');
  new.ip_hash := md5('ejg-chat:' || ip);

  if new.name ~* 'elvin' then
    raise exception 'name_taken';
  end if;
  if new.body ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|ph|io|co|me|ly|xyz|app|dev|site|online|info|biz|link|top|shop|club)\M)' then
    raise exception 'no_links';
  end if;
  if (new.name || ' ' || new.body) ~* '\m(fuck\w*|shit\w*|bitch\w*|asshole|pussy|nigg\w*|fag\w*|retard\w*|putang\w*|tangina\w*|tang ina|puta|gago|ulol|olol|bobo|tanga|kupal|pakyu|pakshet|hayop ka|tarantado|kantot\w*|iyot|burat)\M' then
    raise exception 'blocked_word';
  end if;

  if exists (select 1 from public.portfolio_chat
             where ip_hash = new.ip_hash and created_at > now() - interval '12 seconds') then
    raise exception 'slow_down';
  end if;
  if (select count(*) from public.portfolio_chat
      where ip_hash = new.ip_hash and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many';
  end if;
  if exists (select 1 from public.portfolio_chat
             where ip_hash = new.ip_hash and lower(body) = lower(new.body)
               and created_at > now() - interval '10 minutes') then
    raise exception 'duplicate';
  end if;

  return new;
end;
$$;

drop trigger if exists portfolio_chat_guard on public.portfolio_chat;
create trigger portfolio_chat_guard
  before insert on public.portfolio_chat
  for each row execute function public.portfolio_chat_guard();
