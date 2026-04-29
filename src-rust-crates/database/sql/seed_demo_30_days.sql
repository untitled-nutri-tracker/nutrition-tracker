PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- Remove previously seeded demo logs so reruns are deterministic.
DELETE FROM meal_items
WHERE meal_id IN (
  SELECT id FROM meals WHERE note = 'demo-seed-sql-v1'
);

DELETE FROM meals WHERE note = 'demo-seed-sql-v1';

-- Fix any previously seeded servings that had an incorrect unit (1 instead of 0)
UPDATE servings
SET unit = 0
WHERE is_default = 1
  AND food_id IN (SELECT id FROM foods WHERE source = 'demo-seed-sql-v1');

DROP TABLE IF EXISTS temp_demo_food_catalog;
CREATE TEMP TABLE temp_demo_food_catalog (
  barcode TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  grams_equiv INTEGER NOT NULL,
  calories_kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  total_carbohydrate_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  dietary_fiber_g REAL NOT NULL,
  total_sugars_g REAL NOT NULL,
  sodium_mg REAL NOT NULL,
  cholesterol_mg REAL NOT NULL
);

INSERT INTO temp_demo_food_catalog VALUES
  ('demo30-oats', 'Rolled Oats', 'Pantry Co', 'Grains', 40, 150, 5.0, 27.0, 3.0, 4.0, 1.0, 2, 0),
  ('demo30-banana', 'Banana', 'Fresh', 'Fruit', 118, 105, 1.3, 27.0, 0.4, 3.1, 14.0, 1, 0),
  ('demo30-yogurt', 'Greek Yogurt Plain', 'Dairy Farm', 'Dairy', 170, 100, 17.0, 6.0, 0.0, 0.0, 5.0, 65, 10),
  ('demo30-blueberry', 'Blueberries', 'Fresh', 'Fruit', 85, 49, 0.6, 12.0, 0.2, 2.0, 8.0, 1, 0),
  ('demo30-eggs', 'Eggs Scrambled', 'Farmhouse', 'Protein', 100, 143, 12.0, 1.1, 9.5, 0.0, 1.1, 140, 372),
  ('demo30-avocado', 'Avocado', 'Fresh', 'Fruit', 100, 160, 2.0, 8.5, 14.7, 6.7, 0.7, 7, 0),
  ('demo30-chicken', 'Chicken Breast Cooked', 'Kitchen', 'Protein', 120, 198, 37.0, 0.0, 4.3, 0.0, 0.0, 90, 102),
  ('demo30-rice', 'Brown Rice Cooked', 'Pantry Co', 'Grains', 150, 165, 3.5, 34.0, 1.4, 1.8, 0.4, 5, 0),
  ('demo30-broccoli', 'Broccoli Steamed', 'Fresh', 'Vegetable', 100, 35, 2.4, 7.2, 0.4, 3.3, 1.7, 41, 0),
  ('demo30-salmon', 'Salmon Baked', 'Sea Catch', 'Protein', 120, 247, 26.0, 0.0, 15.0, 0.0, 0.0, 75, 70),
  ('demo30-quinoa', 'Quinoa Cooked', 'Pantry Co', 'Grains', 140, 168, 6.1, 30.0, 2.7, 3.9, 1.2, 13, 0),
  ('demo30-tofu', 'Tofu Firm', 'Bean House', 'Protein', 100, 144, 17.0, 3.0, 9.0, 2.0, 0.6, 14, 0),
  ('demo30-sweetpotato', 'Sweet Potato Baked', 'Fresh', 'Vegetable', 130, 112, 2.0, 26.0, 0.1, 3.9, 5.5, 72, 0),
  ('demo30-lentils', 'Lentils Cooked', 'Pantry Co', 'Legume', 150, 174, 13.5, 30.0, 0.6, 11.0, 2.4, 4, 0),
  ('demo30-almonds', 'Almonds', 'Nut House', 'Snack', 28, 164, 6.0, 6.0, 14.0, 3.5, 1.2, 1, 0),
  ('demo30-apple', 'Apple', 'Fresh', 'Fruit', 182, 95, 0.5, 25.0, 0.3, 4.4, 19.0, 2, 0),
  ('demo30-bread', 'Whole Wheat Bread', 'Bakery', 'Grains', 35, 90, 4.0, 17.0, 1.0, 3.0, 2.0, 150, 0),
  ('demo30-turkey', 'Turkey Breast Sliced', 'Deli Co', 'Protein', 85, 95, 17.0, 2.0, 2.0, 0.0, 1.0, 620, 40),
  ('demo30-spinach', 'Spinach Raw', 'Fresh', 'Vegetable', 60, 14, 1.7, 2.2, 0.2, 1.4, 0.3, 47, 0),
  ('demo30-peanutbutter', 'Peanut Butter', 'Nut House', 'Spread', 32, 188, 8.0, 7.0, 16.0, 2.5, 3.0, 147, 0);

INSERT INTO foods (name, brand, category, source, ref_url, barcode, created_at, updated_at)
SELECT c.name, c.brand, c.category, 'demo-seed-sql-v1', '', c.barcode, unixepoch('now'), unixepoch('now')
FROM temp_demo_food_catalog c
WHERE NOT EXISTS (
  SELECT 1 FROM foods f WHERE f.source = 'demo-seed-sql-v1' AND f.barcode = c.barcode
);

DROP TABLE IF EXISTS temp_demo_food_ids;
CREATE TEMP TABLE temp_demo_food_ids AS
SELECT
  c.barcode,
  c.grams_equiv,
  c.calories_kcal,
  c.protein_g,
  c.total_carbohydrate_g,
  c.fat_g,
  c.dietary_fiber_g,
  c.total_sugars_g,
  c.sodium_mg,
  c.cholesterol_mg,
  (
    SELECT MIN(f.id)
    FROM foods f
    WHERE f.source = 'demo-seed-sql-v1' AND f.barcode = c.barcode
  ) AS food_id
FROM temp_demo_food_catalog c;

INSERT INTO servings (food_id, amount, unit, grams_equiv, is_default, created_at, updated_at)
SELECT d.food_id, 1, 0, d.grams_equiv, 1, unixepoch('now'), unixepoch('now')
FROM temp_demo_food_ids d
WHERE NOT EXISTS (
  SELECT 1 FROM servings s WHERE s.food_id = d.food_id AND s.is_default = 1
);

DROP TABLE IF EXISTS temp_demo_servings;
CREATE TEMP TABLE temp_demo_servings AS
SELECT
  d.barcode,
  d.food_id,
  (
    SELECT MIN(s.id)
    FROM servings s
    WHERE s.food_id = d.food_id AND s.is_default = 1
  ) AS serving_id,
  d.calories_kcal,
  d.protein_g,
  d.total_carbohydrate_g,
  d.fat_g,
  d.dietary_fiber_g,
  d.total_sugars_g,
  d.sodium_mg,
  d.cholesterol_mg
FROM temp_demo_food_ids d;

INSERT INTO nutrition_facts (
  serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g,
  cholesterol_mg, sodium_mg, total_carbohydrate_g, dietary_fiber_g,
  total_sugars_g, added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg
)
SELECT
  ds.serving_id,
  ds.calories_kcal,
  ds.fat_g,
  ROUND(ds.fat_g * 0.22, 2),
  0,
  ds.cholesterol_mg,
  ds.sodium_mg,
  ds.total_carbohydrate_g,
  ds.dietary_fiber_g,
  ds.total_sugars_g,
  0,
  ds.protein_g,
  0,
  20,
  1
FROM temp_demo_servings ds
WHERE NOT EXISTS (
  SELECT 1 FROM nutrition_facts nf WHERE nf.serving_id = ds.serving_id
);

DROP TABLE IF EXISTS temp_demo_days;
CREATE TEMP TABLE temp_demo_days AS
WITH RECURSIVE days(day_idx) AS (
  SELECT 0
  UNION ALL
  SELECT day_idx + 1 FROM days WHERE day_idx < 29
)
SELECT day_idx FROM days;

DROP TABLE IF EXISTS temp_demo_slots;
CREATE TEMP TABLE temp_demo_slots (
  day_idx INTEGER NOT NULL,
  meal_type INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  title TEXT NOT NULL
);

INSERT INTO temp_demo_slots (day_idx, meal_type, occurred_at, title)
SELECT d.day_idx, 1,
  unixepoch('now', 'start of day', printf('-%d days', 29 - d.day_idx), '+07 hours', '+30 minutes', printf('+%d minutes', d.day_idx % 6)),
  'Breakfast'
FROM temp_demo_days d
UNION ALL
SELECT d.day_idx, 3,
  unixepoch('now', 'start of day', printf('-%d days', 29 - d.day_idx), '+12 hours', '+20 minutes', printf('+%d minutes', d.day_idx % 8)),
  'Lunch'
FROM temp_demo_days d
UNION ALL
SELECT d.day_idx, 4,
  unixepoch('now', 'start of day', printf('-%d days', 29 - d.day_idx), '+18 hours', '+10 minutes', printf('+%d minutes', d.day_idx % 10)),
  'Dinner'
FROM temp_demo_days d
UNION ALL
SELECT d.day_idx, 10,
  unixepoch('now', 'start of day', printf('-%d days', 29 - d.day_idx), '+15 hours', '+15 minutes', printf('+%d minutes', d.day_idx % 5)),
  'Snack'
FROM temp_demo_days d
WHERE (d.day_idx % 2 = 0);

INSERT INTO meals (occurred_at, meal_type, title, note, created_at, updated_at)
SELECT occurred_at, meal_type, title, 'demo-seed-sql-v1', unixepoch('now'), unixepoch('now')
FROM temp_demo_slots;

DROP TABLE IF EXISTS temp_demo_meal_food;
CREATE TEMP TABLE temp_demo_meal_food (
  day_idx INTEGER NOT NULL,
  meal_type INTEGER NOT NULL,
  barcode TEXT NOT NULL,
  quantity REAL NOT NULL
);

-- Breakfast patterns
INSERT INTO temp_demo_meal_food
SELECT d.day_idx, 1, 'demo30-oats', 1.5 FROM temp_demo_days d WHERE d.day_idx % 3 = 0
UNION ALL SELECT d.day_idx, 1, 'demo30-banana', 1.0 FROM temp_demo_days d WHERE d.day_idx % 3 = 0
UNION ALL SELECT d.day_idx, 1, 'demo30-yogurt', 1.5 FROM temp_demo_days d WHERE d.day_idx % 3 = 0
UNION ALL SELECT d.day_idx, 1, 'demo30-eggs', 2.0 FROM temp_demo_days d WHERE d.day_idx % 3 = 1
UNION ALL SELECT d.day_idx, 1, 'demo30-bread', 2.0 FROM temp_demo_days d WHERE d.day_idx % 3 = 1
UNION ALL SELECT d.day_idx, 1, 'demo30-avocado', 0.5 FROM temp_demo_days d WHERE d.day_idx % 3 = 1
UNION ALL SELECT d.day_idx, 1, 'demo30-yogurt', 2.0 FROM temp_demo_days d WHERE d.day_idx % 3 = 2
UNION ALL SELECT d.day_idx, 1, 'demo30-blueberry', 2.0 FROM temp_demo_days d WHERE d.day_idx % 3 = 2
UNION ALL SELECT d.day_idx, 1, 'demo30-almonds', 1.0 FROM temp_demo_days d WHERE d.day_idx % 3 = 2;

-- Lunch patterns
INSERT INTO temp_demo_meal_food
SELECT d.day_idx, 3, 'demo30-chicken', 1.5 FROM temp_demo_days d WHERE d.day_idx % 4 = 0
UNION ALL SELECT d.day_idx, 3, 'demo30-rice', 1.5 FROM temp_demo_days d WHERE d.day_idx % 4 = 0
UNION ALL SELECT d.day_idx, 3, 'demo30-broccoli', 1.5 FROM temp_demo_days d WHERE d.day_idx % 4 = 0
UNION ALL SELECT d.day_idx, 3, 'demo30-salmon', 1.5 FROM temp_demo_days d WHERE d.day_idx % 4 = 1
UNION ALL SELECT d.day_idx, 3, 'demo30-quinoa', 1.5 FROM temp_demo_days d WHERE d.day_idx % 4 = 1
UNION ALL SELECT d.day_idx, 3, 'demo30-spinach', 1.5 FROM temp_demo_days d WHERE d.day_idx % 4 = 1
UNION ALL SELECT d.day_idx, 3, 'demo30-tofu', 2.0 FROM temp_demo_days d WHERE d.day_idx % 4 = 2
UNION ALL SELECT d.day_idx, 3, 'demo30-sweetpotato', 2.0 FROM temp_demo_days d WHERE d.day_idx % 4 = 2
UNION ALL SELECT d.day_idx, 3, 'demo30-broccoli', 1.0 FROM temp_demo_days d WHERE d.day_idx % 4 = 2
UNION ALL SELECT d.day_idx, 3, 'demo30-turkey', 3.0 FROM temp_demo_days d WHERE d.day_idx % 4 = 3
UNION ALL SELECT d.day_idx, 3, 'demo30-bread', 3.0 FROM temp_demo_days d WHERE d.day_idx % 4 = 3
UNION ALL SELECT d.day_idx, 3, 'demo30-spinach', 1.0 FROM temp_demo_days d WHERE d.day_idx % 4 = 3;

-- Dinner patterns
INSERT INTO temp_demo_meal_food
SELECT d.day_idx, 4, 'demo30-salmon', 1.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 0
UNION ALL SELECT d.day_idx, 4, 'demo30-quinoa', 1.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 0
UNION ALL SELECT d.day_idx, 4, 'demo30-broccoli', 1.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 0
UNION ALL SELECT d.day_idx, 4, 'demo30-chicken', 2.0 FROM temp_demo_days d WHERE d.day_idx % 5 = 1
UNION ALL SELECT d.day_idx, 4, 'demo30-rice', 1.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 1
UNION ALL SELECT d.day_idx, 4, 'demo30-broccoli', 1.0 FROM temp_demo_days d WHERE d.day_idx % 5 = 1
UNION ALL SELECT d.day_idx, 4, 'demo30-lentils', 2.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 2
UNION ALL SELECT d.day_idx, 4, 'demo30-sweetpotato', 1.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 2
UNION ALL SELECT d.day_idx, 4, 'demo30-spinach', 1.0 FROM temp_demo_days d WHERE d.day_idx % 5 = 2
UNION ALL SELECT d.day_idx, 4, 'demo30-tofu', 2.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 3
UNION ALL SELECT d.day_idx, 4, 'demo30-quinoa', 1.5 FROM temp_demo_days d WHERE d.day_idx % 5 = 3
UNION ALL SELECT d.day_idx, 4, 'demo30-broccoli', 1.0 FROM temp_demo_days d WHERE d.day_idx % 5 = 3
UNION ALL SELECT d.day_idx, 4, 'demo30-turkey', 2.0 FROM temp_demo_days d WHERE d.day_idx % 5 = 4
UNION ALL SELECT d.day_idx, 4, 'demo30-rice', 2.0 FROM temp_demo_days d WHERE d.day_idx % 5 = 4
UNION ALL SELECT d.day_idx, 4, 'demo30-avocado', 1.0 FROM temp_demo_days d WHERE d.day_idx % 5 = 4;

-- Snack patterns
INSERT INTO temp_demo_meal_food
SELECT d.day_idx, 10, 'demo30-apple', 1.0 FROM temp_demo_days d WHERE (d.day_idx % 2 = 0) AND (d.day_idx % 4 = 0)
UNION ALL SELECT d.day_idx, 10, 'demo30-almonds', 1.0 FROM temp_demo_days d WHERE (d.day_idx % 2 = 0) AND (d.day_idx % 4 = 0)
UNION ALL SELECT d.day_idx, 10, 'demo30-banana', 1.0 FROM temp_demo_days d WHERE (d.day_idx % 2 = 0) AND (d.day_idx % 4 = 2)
UNION ALL SELECT d.day_idx, 10, 'demo30-peanutbutter', 1.0 FROM temp_demo_days d WHERE (d.day_idx % 2 = 0) AND (d.day_idx % 4 = 2);

INSERT INTO meal_items (meal_id, food_id, serving_id, quantity, note, created_at, updated_at)
SELECT
  m.id,
  ds.food_id,
  ds.serving_id,
  tmf.quantity,
  '',
  unixepoch('now'),
  unixepoch('now')
FROM temp_demo_meal_food tmf
JOIN temp_demo_slots ts
  ON ts.day_idx = tmf.day_idx
 AND ts.meal_type = tmf.meal_type
JOIN meals m
  ON m.occurred_at = ts.occurred_at
 AND m.meal_type = ts.meal_type
 AND m.note = 'demo-seed-sql-v1'
JOIN temp_demo_servings ds
  ON ds.barcode = tmf.barcode;

DROP TABLE IF EXISTS temp_demo_days;
DROP TABLE IF EXISTS temp_demo_slots;
DROP TABLE IF EXISTS temp_demo_meal_food;
DROP TABLE IF EXISTS temp_demo_servings;
DROP TABLE IF EXISTS temp_demo_food_ids;
DROP TABLE IF EXISTS temp_demo_food_catalog;

COMMIT;
