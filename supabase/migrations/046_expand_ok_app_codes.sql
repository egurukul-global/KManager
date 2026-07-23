-- Migration 046: Expand One Kailasa App Codes to include tasks and konnect

-- Update ok_home_pins check constraint
ALTER TABLE public.ok_home_pins DROP CONSTRAINT IF EXISTS ok_home_pins_app_code_check;
ALTER TABLE public.ok_home_pins ADD CONSTRAINT ok_home_pins_app_code_check CHECK (app_code IN ('finance', 'gurukul', 'utilities', 'tasks', 'konnect'));

-- Update ok_app_access check constraint
ALTER TABLE public.ok_app_access DROP CONSTRAINT IF EXISTS ok_app_access_app_code_check;
ALTER TABLE public.ok_app_access ADD CONSTRAINT ok_app_access_app_code_check CHECK (app_code IN ('finance', 'gurukul', 'utilities', 'tasks', 'konnect'));

-- Update ok_menu_access check constraint
ALTER TABLE public.ok_menu_access DROP CONSTRAINT IF EXISTS ok_menu_access_app_code_check;
ALTER TABLE public.ok_menu_access ADD CONSTRAINT ok_menu_access_app_code_check CHECK (app_code IN ('finance', 'gurukul', 'utilities', 'tasks', 'konnect'));
