# nutrack-database

SQLite-backed persistence crate for the nutrition tracker application.

This crate owns:

- Database initialization and schema creation
- A global `DatabaseConnectionManager` used by Tauri commands
- CRUD-oriented Tauri command handlers for user profiles, foods, servings, nutrition facts, meals, and meal items

## Scope

The crate is organized into three domain modules:

- `user_profile`: profile CRUD
- `food`: food, serving, and nutrition-facts CRUD
- `meal`: meal and meal-item CRUD

The Tauri command handler exported by `handler()` registers all public commands from those modules so they can be invoked from the app layer.

## Data Model

The schema lives in [`sql/init.sql`](./sql/init.sql) and currently defines these tables:

- `user_profiles`
- `foods`
- `servings`
- `nutrition_facts`
- `meals`
- `meal_items`

Important relationships:

- One `food` can have multiple `servings`
- One `serving` belongs to exactly one `food`
- One `serving` can have at most one `nutrition_facts` row
- One `meal` can have multiple `meal_items`
- One `meal_item` belongs to exactly one `meal`
- One `meal_item` references one `food` and one selected `serving`

Notable constraints:

- Deleting a `food` cascades to its `servings` and their `nutrition_facts`
- Deleting a `meal` cascades to its `meal_items`
- Only one default serving is allowed per food via the partial unique index on `servings(food_id)` where `is_default = 1`

## Initialization

Use `DatabaseConnectionManager::initialize()` once at startup with an application-managed database path:

```
use nutrack_database::DatabaseConnectionManager;
use std::path::Path;

let db_path = Path::new("/path/to/app.db");
let manager = DatabaseConnectionManager::initialize(db_path)?;
let conn = manager.connection()?;
```

Behavior:

- If the database file does not exist, the crate creates parent directories as needed and applies `sql/init.sql`
- If the database file already exists, the crate opens it without reapplying the schema

That second point matters: this crate currently treats "existing file" as "already initialized database". It does not run migrations.

## Tauri Commands

The crate exposes these command groups through `handler()`:

- User profiles: `create_profile`, `get_profile`, `list_profiles`, `update_profile`, `delete_profile`
- Foods: `create_food`, `get_food`, `list_foods`, `update_food`, `delete_food`
- Servings: `create_serving`, `get_serving`, `list_servings_by_food`, `update_serving`, `delete_serving`
- Nutrition facts: `create_nutrition_facts`, `get_nutrition_facts`, `list_nutrition_facts`, `update_nutrition_facts`, `delete_nutrition_facts`
- Meals: `create_meal`, `get_meal`, `list_meals`, `update_meal`, `delete_meal`
- Meal items: `create_meal_item`, `get_meal_item`, `list_meal_items_by_meal`, `update_meal_item`, `delete_meal_item`

All commands return `Result<..., String>` and use the shared database manager internally.

## Error Model

Connection setup uses `DatabaseError` for:

- SQLite connection failures
- File-system errors while preparing the database path
- Access before global initialization
- Poisoned connection lock access

Most Tauri command handlers convert operational failures into `String` errors for IPC transport.

## Development

Run the crate tests from the workspace root:

```bash
cargo test -p nutrack-database
```

The test suite covers schema creation and the CRUD flows for the supported domains, including relevant cascade-delete behavior.
