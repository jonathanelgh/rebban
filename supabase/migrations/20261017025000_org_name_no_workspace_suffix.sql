-- Stop defaulting new orgs to "{name}'s workspace".
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_full_name text;
  v_org_name text;
  v_org_type public.organization_type;
  v_slug text;
  v_org_id uuid;
  v_base_slug text;
  v_i int := 0;
  v_marketing boolean;
  v_avatar text;
begin
  v_full_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1)
  );
  v_org_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'organization_name', ''),
    v_full_name
  );
  v_org_type := case
    when lower(coalesce(new.raw_user_meta_data ->> 'organization_type', 'solo')) = 'agency'
      then 'agency'::public.organization_type
    else 'solo'::public.organization_type
  end;
  v_marketing := coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false);
  v_avatar := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', '')
  );

  insert into public.profiles (id, full_name, email, avatar_url, marketing_consent, marketing_consent_at)
  values (
    new.id,
    v_full_name,
    new.email,
    v_avatar,
    v_marketing,
    case when v_marketing then now() else null end
  );

  v_base_slug := public.slugify(v_org_name);
  if v_base_slug is null or v_base_slug = '' then
    v_base_slug := 'org';
  end if;
  v_slug := v_base_slug;

  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_i := v_i + 1;
    v_slug := v_base_slug || '-' || v_i::text;
  end loop;

  insert into public.organizations (name, slug, type, created_by, trial_ends_at)
  values (v_org_name, v_slug, v_org_type, new.id, now() + interval '7 days')
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, status, joined_at)
  values (v_org_id, new.id, 'owner', 'active', now());

  update public.profiles
  set active_organization_id = v_org_id
  where id = new.id;

  return new;
end;
$function$;

-- Clean existing names that used the old default suffix.
UPDATE public.organizations
SET name = regexp_replace(name, '''s workspace$', '', 'i')
WHERE name ~* '''s workspace$'
  AND length(regexp_replace(name, '''s workspace$', '', 'i')) > 0;
