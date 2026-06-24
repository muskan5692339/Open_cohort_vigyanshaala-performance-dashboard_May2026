-- Callable from upload-sync after Excel import
CREATE OR REPLACE FUNCTION public.refresh_student_performance_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.student_performance_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_student_performance_summary() TO service_role;
