use nutrition_tracker_lib::api::openfoodfacts;

#[tokio::main]
async fn main() {
    let barcode = "3017620422003"; // Nutella test barcode
    println!("Fetching OpenFoodFacts data for barcode: {}", barcode);

    match openfoodfacts::fetch(barcode).await {
        Ok(facts) => {
            println!("Successfully fetched: {}", facts.serving.food.name);
            println!(
                "  Calories: {} kcal | Protein: {}g | Carbs: {}g | Fat: {}g",
                facts.calories_kcal, facts.protein_g, facts.total_carbohydrate_g, facts.fat_g,
            );
        }
        Err(e) => eprintln!("Error: {}", e),
    }
}
