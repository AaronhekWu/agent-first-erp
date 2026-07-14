-- 0016 — 报名课时可覆盖
--
-- 正常报名此前只能沿用课程/价格方案的固定课时。新增 p_lessons_override:
-- 传入且 > 0 时以指定课时报名, 保持"每节单价"不变按课时缩放原价 (再叠加优惠/赠课)。
-- 需 DROP 旧函数再建 (新增入参会与旧签名形成重载, 导致 PostgREST 调用歧义)。

drop function if exists public.rpc_enroll_student_v2(uuid, uuid, uuid, uuid, text, text, numeric, text, uuid, text);

create or replace function public.rpc_enroll_student_v2(
  p_student_id uuid,
  p_course_id uuid,
  p_price_id uuid default null,
  p_campaign_id uuid default null,
  p_source text default 'normal',
  p_custom_discount_type text default null,
  p_custom_discount_value numeric default null,
  p_discount_reason text default null,
  p_referrer_student_id uuid default null,
  p_notes text default null,
  p_lessons_override integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_operator uuid := auth.uid();
  v_course public.crs_courses;
  v_plan public.crs_course_prices;
  v_campaign public.promo_campaigns;
  v_enrollment public.crs_enrollments;
  v_lessons integer;
  v_gift_lessons integer := 0;
  v_list_unit numeric(10,2);
  v_gross numeric(12,2);
  v_discount_type text;
  v_discount_value numeric(12,4) := 0;
  v_discount numeric(12,2) := 0;
  v_net numeric(12,2);
  v_effective_unit numeric(10,2);
  v_enrolled_count integer;
  v_snapshot jsonb;
begin
  if not public.has_permission('courses.enroll') then raise exception 'PERMISSION_DENIED: 无权办理报名'; end if;
  if p_source not in ('normal','campaign','referral','custom') then raise exception '报名类型无效'; end if;
  if not exists (select 1 from public.stu_students where id=p_student_id and deleted_at is null and status <> 'inactive') then
    raise exception '学员不存在或已停用';
  end if;
  select * into v_course from public.crs_courses where id=p_course_id and deleted_at is null for update;
  if not found or v_course.status <> 'active' then raise exception '课程不存在或当前不可报名'; end if;
  if exists (select 1 from public.crs_enrollments where student_id=p_student_id and course_id=p_course_id and status in ('enrolled','completed')) then
    raise exception '该学员已报名此课程';
  end if;
  select count(*) into v_enrolled_count from public.crs_enrollments where course_id=p_course_id and status='enrolled';
  if v_course.max_capacity is not null and v_enrolled_count >= v_course.max_capacity then raise exception '课程已满员'; end if;

  v_lessons := nullif(v_course.schedule_info->>'total_lessons','')::integer;
  v_list_unit := v_course.fee;
  if v_lessons is null or v_lessons <= 0 or v_list_unit is null or v_list_unit <= 0 then
    raise exception '课程尚未完整设置课时与标准单价';
  end if;
  v_gross := round(v_list_unit * v_lessons, 2);

  if p_price_id is not null then
    select * into v_plan from public.crs_course_prices
     where id=p_price_id and course_id=p_course_id and status='active'
       and (effective_from is null or effective_from <= current_date)
       and (effective_to is null or effective_to >= current_date);
    if not found then raise exception '价格方案无效或已过期'; end if;
    v_lessons := coalesce(v_plan.total_lessons, v_lessons);
    v_gross := coalesce(v_plan.total_price, round(coalesce(v_plan.unit_price,v_list_unit) * v_lessons,2));
  end if;

  -- 报名课时覆盖: 保持每节单价不变, 按指定课时缩放原价
  if p_lessons_override is not null then
    if p_lessons_override <= 0 then raise exception '报名课时必须大于 0'; end if;
    if v_lessons is null or v_lessons <= 0 then raise exception '无法确定基准单价'; end if;
    v_gross := round((v_gross / v_lessons) * p_lessons_override, 2);
    v_lessons := p_lessons_override;
  end if;

  if p_campaign_id is not null then
    select * into v_campaign from public.promo_campaigns
     where id=p_campaign_id and status='active'
       and type in ('enrollment_discount','course_discount','referral')
       and (start_date is null or start_date <= current_date)
       and (end_date is null or end_date >= current_date)
       and (max_usage is null or used_count < max_usage)
       and (jsonb_array_length(coalesce(applicable_course_ids,'[]'::jsonb))=0 or applicable_course_ids ? p_course_id::text)
     for update;
    if not found then raise exception '优惠活动无效、不适用于本课程或已过期'; end if;
    v_discount_type := v_campaign.discount_type;
    v_discount_value := coalesce(v_campaign.discount_value,0);
    v_gift_lessons := coalesce(v_campaign.gift_lessons,0);
  elsif p_custom_discount_type is not null then
    if not public.has_permission('courses.pricing') then raise exception 'PERMISSION_DENIED: 自定义优惠需要管理员权限'; end if;
    if nullif(trim(coalesce(p_discount_reason,'')),'') is null then raise exception '自定义优惠必须填写原因'; end if;
    v_discount_type := p_custom_discount_type;
    v_discount_value := coalesce(p_custom_discount_value,0);
  end if;

  if p_source = 'normal' and (p_campaign_id is not null or p_custom_discount_type is not null) then
    raise exception '正常报名不能附带活动或自定义优惠';
  elsif p_source = 'campaign' and (p_campaign_id is null or v_campaign.type = 'referral') then
    raise exception '活动报名必须选择非老带新的有效活动';
  elsif p_source = 'referral' and (p_campaign_id is null or v_campaign.type <> 'referral') then
    raise exception '老带新报名必须选择有效的老带新活动';
  elsif p_source = 'custom' and p_custom_discount_type is null then
    raise exception '自定义优惠缺少优惠类型';
  end if;

  if v_discount_type = 'fixed' then
    v_discount := least(v_gross, greatest(v_discount_value,0));
  elsif v_discount_type = 'percentage' then
    if v_discount_value < 0 or v_discount_value > 100 then raise exception '折扣百分比必须在 0 到 100 之间'; end if;
    v_discount := round(v_gross * v_discount_value / 100, 2);
  elsif v_discount_type is not null and v_discount_type <> 'gift_lessons' then
    raise exception '不支持的优惠类型';
  end if;
  v_lessons := v_lessons + v_gift_lessons;
  v_net := greatest(0, v_gross - v_discount);
  v_effective_unit := round(v_net / v_lessons, 2);
  v_snapshot := jsonb_build_object(
    'version',1,'course_name',v_course.name,'list_unit_price',v_list_unit,
    'total_lessons',v_lessons,'gift_lessons',v_gift_lessons,'gross_amount',v_gross,
    'discount_type',v_discount_type,'discount_value',v_discount_value,
    'discount_amount',v_discount,'discount_reason',p_discount_reason,
    'net_amount',v_net,'effective_unit_price',v_effective_unit,
    'price_plan_id',p_price_id,'price_plan_name',v_plan.name,
    'campaign_id',p_campaign_id,'campaign_name',v_campaign.name,
    'source',p_source,'referrer_student_id',p_referrer_student_id,'quoted_at',now()
  );

  insert into public.crs_enrollments (
    student_id,course_id,price_id,campaign_id,notes,source,unit_price,total_lessons,
    consumed_lessons,remaining_lessons,total_amount,paid_amount,discount_amount,
    list_unit_price,gross_amount,discount_type,discount_value,discount_reason,
    referrer_student_id,price_snapshot,created_by
  ) values (
    p_student_id,p_course_id,p_price_id,p_campaign_id,p_notes,p_source,v_effective_unit,v_lessons,
    0,v_lessons,v_net,0,v_discount,v_list_unit,v_gross,v_discount_type,v_discount_value,
    p_discount_reason,p_referrer_student_id,v_snapshot,v_operator
  ) returning * into v_enrollment;

  insert into public.crs_enrollment_price_history(enrollment_id,action,snapshot,changed_by)
  values(v_enrollment.id,'created',v_snapshot,v_operator);
  if p_campaign_id is not null then
    update public.promo_campaigns set used_count=used_count+1,updated_at=now() where id=p_campaign_id;
  end if;
  if p_source='referral' then
    if p_referrer_student_id is null or p_referrer_student_id=p_student_id then raise exception '老带新必须选择其他推荐学员'; end if;
    insert into public.promo_referrals(campaign_id,referrer_student_id,referred_student_id,status)
    values(p_campaign_id,p_referrer_student_id,p_student_id,'applied');
  end if;
  insert into public.aud_operation_logs(user_id,action,resource_type,resource_id,changes)
  values(v_operator,'enroll_student','enrollment',v_enrollment.id,v_snapshot);
  return jsonb_build_object('message','报名成功','enrollment_id',v_enrollment.id,'pricing',v_snapshot);
end;
$function$;
