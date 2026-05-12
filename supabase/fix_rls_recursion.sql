-- Fix infinite recursion in user_profiles RLS policies
-- Root cause: policies on user_profiles referenced user_profiles itself

-- 1. SECURITY DEFINER function reads user_profiles bypassing RLS (breaks the cycle)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.user_profiles WHERE id = auth.uid()),
    false
  )
$$;

-- 2. Fix recursive user_profiles policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON user_profiles;

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can manage all profiles"
  ON user_profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Update all other admin policies to use the function
DROP POLICY IF EXISTS "Admins can manage warehouses" ON warehouses;
CREATE POLICY "Admins can manage warehouses"
  ON warehouses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage products" ON products;
CREATE POLICY "Admins can manage products"
  ON products FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage suppliers" ON suppliers;
CREATE POLICY "Admins can manage suppliers"
  ON suppliers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage customers" ON customers;
CREATE POLICY "Admins can manage customers"
  ON customers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage inbound movements" ON inbound_movements;
CREATE POLICY "Admins can manage inbound movements"
  ON inbound_movements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage outbound movements" ON outbound_movements;
CREATE POLICY "Admins can manage outbound movements"
  ON outbound_movements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
