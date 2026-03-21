PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sex INTEGER NOT NULL CHECK (sex IN (0, 1)),
    weight REAL NOT NULL,
    height REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    source TEXT NOT NULL,
    ref_url TEXT NOT NULL,
    barcode TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS servings (
    id INTEGER PRIMARY KEY,
    food_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    unit INTEGER NOT NULL,
    grams_equiv INTEGER NOT NULL,
    is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_servings_default_per_food
    ON servings (food_id)
    WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS nutrition_facts (
    serving_id INTEGER PRIMARY KEY,
    calories_kcal REAL NOT NULL,
    fat_g REAL NOT NULL,
    saturated_fat_g REAL NOT NULL,
    trans_fat_g REAL NOT NULL,
    cholesterol_mg REAL NOT NULL,
    sodium_mg REAL NOT NULL,
    total_carbohydrate_g REAL NOT NULL,
    dietary_fiber_g REAL NOT NULL,
    total_sugars_g REAL NOT NULL,
    added_sugars_g REAL NOT NULL,
    protein_g REAL NOT NULL,
    vitamin_d_mcg REAL NOT NULL,
    calcium_mg REAL NOT NULL,
    iron_mg REAL NOT NULL,
    FOREIGN KEY (serving_id) REFERENCES servings (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY,
    occurred_at INTEGER NOT NULL,
    meal_type INTEGER NOT NULL CHECK (meal_type IN (1, 2, 3, 4, 8, 10, 99)),
    title TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_items (
    id INTEGER PRIMARY KEY,
    meal_id INTEGER NOT NULL,
    food_id INTEGER NOT NULL,
    serving_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    note TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (meal_id) REFERENCES meals (id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES foods (id),
    FOREIGN KEY (serving_id) REFERENCES servings (id)
);

CREATE INDEX IF NOT EXISTS idx_servings_food_id ON servings (food_id);
CREATE INDEX IF NOT EXISTS idx_meals_occurred_at ON meals (occurred_at);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal_id ON meal_items (meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_food_id ON meal_items (food_id);
CREATE INDEX IF NOT EXISTS idx_meal_items_serving_id ON meal_items (serving_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_barcode ON foods (barcode) WHERE barcode != '';
