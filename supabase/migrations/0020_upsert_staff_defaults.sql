-- 0020 — rpc_upsert_staff 参数默认值
--
-- 账号管理页保存资料时不传 p_permissions (undefined 被 JSON 序列化丢弃),
-- 函数无默认值导致 PostgREST 匹配不到签名:
-- "Could not find the function public.rpc_upsert_staff(p_department_id, ...) in the schema cache"。
-- 为可选参数补默认值 (默认值不改变函数身份, CREATE OR REPLACE 即可)。
-- permissions 传 null/缺省时保留原值 (原有 COALESCE 行为不变)。

create or replace function public.rpc_upsert_staff(
  p_id uuid,
  p_display_name text,
  p_phone text default null,
  p_email text default null,
  p_primary_role text default null,
  p_department_id uuid default null,
  p_permissions jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_id UUID;
BEGIN
  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: 姓名必填';
  END IF;
  IF p_phone IS NOT NULL AND p_phone <> '' AND p_phone !~ '^[0-9]{6,15}$' THEN
    RAISE EXCEPTION 'INVALID_INPUT: 手机号必须为 6-15 位数字';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO acct_profiles (id, display_name, phone, email, primary_role, department_id, permissions, is_active)
    VALUES (gen_random_uuid(), p_display_name, NULLIF(p_phone, ''), NULLIF(p_email, ''),
            NULLIF(p_primary_role, ''), p_department_id, COALESCE(p_permissions, '[]'::jsonb), true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE acct_profiles
       SET display_name = p_display_name,
           phone = NULLIF(p_phone, ''),
           email = NULLIF(p_email, ''),
           primary_role = NULLIF(p_primary_role, ''),
           department_id = p_department_id,
           permissions = COALESCE(p_permissions, permissions),
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'STAFF_NOT_FOUND: 成员不存在';
    END IF;
  END IF;
  RETURN v_id;
END;
$function$;
