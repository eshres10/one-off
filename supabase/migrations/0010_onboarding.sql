-- Onboarding, taste picker and scroll effects.
-- Re-runnable: every statement is guarded, and policies are dropped before being recreated.

-- ---------------------------------------------------------------------------
-- Homepage hero: the velvet sofa image replaces the linen suit (only if it wasn't changed since).
-- ---------------------------------------------------------------------------
update public.editorial_placements set image_url = '/seed/hero-velvet-sofa.jpg'
  where slot = 'home_hero' and image_url = '/seed/hero-linen-suit.jpg';
