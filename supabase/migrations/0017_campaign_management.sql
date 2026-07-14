-- 0017 — 优惠组合(营销活动)管理
--
-- promo_campaigns 仅有 SELECT RLS 策略; 写操作须走 SECURITY DEFINER RPC。
-- 现状: rpc_create_campaign 无权限校验 (任何登录用户可建活动) — 收敛到 courses.pricing。
-- 新增 rpc_update_campaign / rpc_set_campaign_status 供「优惠组合管理」子页面使用。

-- 1) 为创建补上权限门 (保持签名不变, 仅追加校验)
create or replace function public.rpc_create_campaign(
  p_name character varying, p_type character varying,
  p_description text default null, p_discount_type character varying default null,
  p_discount_value numeric default null, p_gift_lessons integer default 0,
  p_applicable_course_ids jsonb default '[]'::jsonb, p_start_date date default null,
  p_end_date date default null, p_max_usage integer default null,
  p_rules jsonb default '{}'::jsonb, p_operator_id uuid default null
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_operator uuid; v_campaign promo_campaigns;
begin
  if not public.has_permission('courses.pricing') then raise exception 'PERMISSION_DENIED: 无权管理优惠组合'; end if;
  v_operator := coalesce(p_operator_id, auth.uid());
  if p_name is null or trim(p_name) = '' then raise exception 'INVALID_INPUT: 活动名称不能为空'; end if;
  if p_type is null or trim(p_type) = '' then raise exception 'INVALID_INPUT: 活动类型不能为空'; end if;
  if p_type not in ('enrollment_discount','course_discount','referral') then raise exception 'INVALID_INPUT: 活动类型无效'; end if;
  insert into promo_campaigns (name, type, description, discount_type, discount_value, gift_lessons,
      applicable_course_ids, start_date, end_date, max_usage, rules, created_by)
  values (trim(p_name), p_type, p_description, p_discount_type, p_discount_value, coalesce(p_gift_lessons,0),
      coalesce(p_applicable_course_ids,'[]'::jsonb), p_start_date, p_end_date, p_max_usage, coalesce(p_rules,'{}'::jsonb), v_operator)
  returning * into v_campaign;
  insert into aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (v_operator, 'create', 'campaign', v_campaign.id, jsonb_build_object('name', v_campaign.name, 'type', v_campaign.type));
  return jsonb_build_object('campaign_id', v_campaign.id, 'name', v_campaign.name, 'type', v_campaign.type, 'status', v_campaign.status);
end;
$function$;

-- 2) 更新优惠组合
create or replace function public.rpc_update_campaign(
  p_id uuid, p_name character varying, p_type character varying,
  p_description text default null, p_discount_type character varying default null,
  p_discount_value numeric default null, p_gift_lessons integer default 0,
  p_applicable_course_ids jsonb default '[]'::jsonb, p_start_date date default null,
  p_end_date date default null, p_max_usage integer default null
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_operator uuid := auth.uid(); v_campaign promo_campaigns;
begin
  if not public.has_permission('courses.pricing') then raise exception 'PERMISSION_DENIED: 无权管理优惠组合'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'INVALID_INPUT: 活动名称不能为空'; end if;
  if p_type not in ('enrollment_discount','course_discount','referral') then raise exception 'INVALID_INPUT: 活动类型无效'; end if;
  update promo_campaigns set
    name = trim(p_name), type = p_type, description = p_description,
    discount_type = p_discount_type, discount_value = p_discount_value, gift_lessons = coalesce(p_gift_lessons,0),
    applicable_course_ids = coalesce(p_applicable_course_ids,'[]'::jsonb),
    start_date = p_start_date, end_date = p_end_date, max_usage = p_max_usage, updated_at = now()
  where id = p_id returning * into v_campaign;
  if not found then raise exception 'NOT_FOUND: 优惠组合不存在'; end if;
  insert into aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (v_operator, 'update', 'campaign', v_campaign.id, jsonb_build_object('name', v_campaign.name, 'type', v_campaign.type));
  return jsonb_build_object('campaign_id', v_campaign.id, 'name', v_campaign.name, 'status', v_campaign.status);
end;
$function$;

-- 3) 启用 / 停用
create or replace function public.rpc_set_campaign_status(p_id uuid, p_status character varying)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_operator uuid := auth.uid(); v_campaign promo_campaigns;
begin
  if not public.has_permission('courses.pricing') then raise exception 'PERMISSION_DENIED: 无权管理优惠组合'; end if;
  if p_status not in ('active','inactive') then raise exception 'INVALID_INPUT: 状态无效'; end if;
  update promo_campaigns set status = p_status, updated_at = now() where id = p_id returning * into v_campaign;
  if not found then raise exception 'NOT_FOUND: 优惠组合不存在'; end if;
  insert into aud_operation_logs (user_id, action, resource_type, resource_id, changes)
  values (v_operator, 'update_status', 'campaign', v_campaign.id, jsonb_build_object('status', p_status));
  return jsonb_build_object('campaign_id', v_campaign.id, 'status', v_campaign.status);
end;
$function$;

grant execute on function public.rpc_update_campaign(uuid, character varying, character varying, text, character varying, numeric, integer, jsonb, date, date, integer) to authenticated;
grant execute on function public.rpc_set_campaign_status(uuid, character varying) to authenticated;
