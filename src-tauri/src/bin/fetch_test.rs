use nutrition_tracker_lib::api::openfoodfacts;
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let barcode = "3017620422003"; // Nutella test barcode
    println!("Fetching OpenFoodFacts data for barcode: {}", barcode);

    match openfoodfacts::fetch(barcode).await {
        Ok(facts) => {
            println!("Successfully fetched: {}", facts.serving.food.name);

            // Save JSON into src-ai/data/ where the TypeScript pipeline reads it.
            let path = PathBuf::from("src-ai/data/sample_food.json");
            match openfoodfacts::save_to_json_file(&facts, path.clone()) {
                Ok(_) => println!("Saved structured JSON to {:?}", path),
                Err(e) => eprintln!("Failed to save JSON: {}", e),
            }
        }
        Err(e) => eprintln!("Error: {}", e),
    }
}
