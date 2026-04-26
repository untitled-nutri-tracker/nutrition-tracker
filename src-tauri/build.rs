use tauri_typegen::{generate_from_config, GenerateConfig};

fn generate_bindings() {
    let config = GenerateConfig {
        project_path: Vec::from([
            ".".to_string(),
            "../src-rust-crates/database".to_string(),
            "../src-rust-crates/model".to_string(),
        ]),
        output_path: "../src/generated/".to_string(),
        validation_library: "none".to_string(),
        verbose: Some(true),
        visualize_deps: Some(true),
        include_private: None,
        type_mappings: None,
        exclude_patterns: None,
        include_patterns: None,
        default_parameter_case: "".to_string(),
        default_field_case: "".to_string(),
        force: Some(true),
    };

    let _files = generate_from_config(&config).expect("failed to generate bindings");
}

fn main() {
    generate_bindings();
    tauri_build::build();
}
