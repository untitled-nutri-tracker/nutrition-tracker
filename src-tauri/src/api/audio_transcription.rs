use crate::ai_config::AiConfig;
use crate::api::ai::LlmProvider;
use crate::credentials::{self, CredentialManager};
use crate::utils::network_errors::map_network_error;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use regex::Regex;
use reqwest::{multipart, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::sync::Mutex;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const MAX_AUDIO_BYTES: usize = 10 * 1024 * 1024;
const OPENAI_TRANSCRIPTION_MODEL: &str = "gpt-4o-mini-transcribe";
const GOOGLE_TRANSCRIPTION_MODEL: &str = "gemini-2.0-flash";
const CUSTOM_TRANSCRIPTION_MODEL: &str = "whisper-1";
const LOCAL_WHISPER_MODEL_NAME: &str = "ggml-tiny.en.bin";
const LOCAL_WHISPER_MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
const TRANSCRIPTION_PROMPT: &str = "This is a short food logging utterance for a nutrition app. Return only the verbatim transcript text. Preserve food names, servings, counts, brands, and meal names exactly.";
const LOCAL_WHISPER_PROMPT: &str =
    "Short food logging utterance. Preserve food names, brands, counts, servings, and meal names.";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceFoodTranscript {
    pub transcript: String,
    pub normalized_query: String,
    pub quantity_hint: Option<f32>,
    pub meal_type_hint: Option<String>,
    pub confidence: Option<f32>,
}

enum TranscriptionRoute {
    OpenAi {
        api_key: String,
        model: String,
    },
    Google {
        api_key: String,
        model: String,
    },
    Custom {
        api_key: String,
        model: String,
        base_url: String,
    },
    LocalWhisper {
        provider: LlmProvider,
    },
}

pub async fn transcribe(
    app: &AppHandle,
    audio_base64: String,
    mime_type: String,
    provider: Option<String>,
) -> Result<VoiceFoodTranscript, String> {
    let trimmed = audio_base64.trim();
    if trimmed.is_empty() {
        return Err("The recorded audio was empty.".into());
    }

    let audio_bytes = STANDARD
        .decode(trimmed)
        .map_err(|_| "The recorded audio could not be decoded.".to_string())?;

    if audio_bytes.is_empty() {
        return Err("The recorded audio was empty.".into());
    }
    if audio_bytes.len() > MAX_AUDIO_BYTES {
        return Err("The recorded audio is too large. Please keep voice entries short.".into());
    }

    let normalized_mime = normalize_audio_mime(&mime_type)?;
    let route = resolve_transcription_route(provider)?;

    let transcript = match route {
        TranscriptionRoute::OpenAi { api_key, model } => {
            transcribe_with_openai(audio_bytes, normalized_mime, &api_key, &model).await?
        }
        TranscriptionRoute::Google { api_key, model } => {
            transcribe_with_google(audio_bytes, normalized_mime, &api_key, &model).await?
        }
        TranscriptionRoute::Custom {
            api_key,
            model,
            base_url,
        } => {
            transcribe_with_custom(audio_bytes, normalized_mime, &api_key, &model, &base_url)
                .await?
        }
        TranscriptionRoute::LocalWhisper { provider } => {
            transcribe_with_local_whisper(app, audio_bytes, normalized_mime, &provider).await?
        }
    };

    Ok(normalize_transcript(&transcript))
}

fn resolve_transcription_route(provider: Option<String>) -> Result<TranscriptionRoute, String> {
    let provider_id = provider
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| AiConfig::current().ok().map(|cfg| cfg.selected_provider))
        .unwrap_or_else(|| "ollama".to_string());

    let provider = LlmProvider::from_str(&provider_id)?;

    match provider {
        LlmProvider::OpenAi => Ok(TranscriptionRoute::OpenAi {
            api_key: CredentialManager::global()
                .retrieve(credentials::providers::OPENAI)
                .map_err(|_| {
                    "OpenAI is selected for voice logging, but no OpenAI API key is saved in Settings → API Keys."
                        .to_string()
                })?,
            model: preferred_openai_style_model("openai", OPENAI_TRANSCRIPTION_MODEL),
        }),
        LlmProvider::Google => Ok(TranscriptionRoute::Google {
            api_key: CredentialManager::global()
                .retrieve(credentials::providers::GOOGLE)
                .map_err(|_| {
                    "Google Gemini is selected for voice logging, but no Google API key is saved in Settings → API Keys."
                        .to_string()
                })?,
            model: selected_model_for_provider("google")
                .unwrap_or_else(|| GOOGLE_TRANSCRIPTION_MODEL.to_string()),
        }),
        LlmProvider::Custom => Ok(TranscriptionRoute::Custom {
            api_key: CredentialManager::global()
                .retrieve(credentials::providers::CUSTOM)
                .map_err(|_| {
                    "Custom is selected for voice logging, but no Custom API key is saved in Settings → API Keys."
                        .to_string()
                })?,
            model: preferred_openai_style_model("custom", CUSTOM_TRANSCRIPTION_MODEL),
            base_url: normalize_openai_compatible_base_url(
                &AiConfig::current()
                    .map(|cfg| cfg.custom_endpoint)
                    .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string()),
            ),
        }),
        LlmProvider::Ollama | LlmProvider::Anthropic => {
            Ok(TranscriptionRoute::LocalWhisper { provider })
        }
    }
}

async fn transcribe_with_openai(
    audio_bytes: Vec<u8>,
    normalized_mime: &str,
    api_key: &str,
    model: &str,
) -> Result<String, String> {
    send_openai_style_transcription_request(
        "https://api.openai.com",
        Some(api_key),
        model,
        audio_bytes,
        normalized_mime,
    )
    .await
    .map_err(|err| format!("Voice transcription failed with OpenAI: {err}"))
}

async fn transcribe_with_custom(
    audio_bytes: Vec<u8>,
    normalized_mime: &str,
    api_key: &str,
    model: &str,
    base_url: &str,
) -> Result<String, String> {
    send_openai_style_transcription_request(
        base_url,
        Some(api_key),
        model,
        audio_bytes,
        normalized_mime,
    )
    .await
    .map_err(|err| {
        format!(
            "Voice transcription failed using your Custom provider at {} with model `{}`. Make sure the configured endpoint supports audio transcription for that model. Error: {}",
            base_url, model, err
        )
    })
}

async fn send_openai_style_transcription_request(
    base_url: &str,
    api_key: Option<&str>,
    model: &str,
    audio_bytes: Vec<u8>,
    normalized_mime: &str,
) -> Result<String, String> {
    let client = build_client(60)?;
    let file_name = format!("voice-entry.{}", audio_extension(normalized_mime));
    let file_part = multipart::Part::bytes(audio_bytes)
        .file_name(file_name)
        .mime_str(normalized_mime)
        .map_err(|_| "The recorded audio format is unsupported.".to_string())?;

    let form = multipart::Form::new()
        .text("model", model.to_string())
        .text("response_format", "json".to_string())
        .text("prompt", TRANSCRIPTION_PROMPT.to_string())
        .part("file", file_part);

    let mut request = client
        .post(format!(
            "{}/v1/audio/transcriptions",
            base_url.trim_end_matches('/')
        ))
        .multipart(form);

    if let Some(token) = api_key {
        request = request.bearer_auth(token);
    }

    let response = request.send().await.map_err(map_network_error)?;
    let status = response.status();
    let body = response.text().await.map_err(map_network_error)?;
    let json = parse_json_body(&body);

    if !status.is_success() {
        return Err(extract_error_message(&json));
    }

    extract_openai_style_transcript(&json)
        .ok_or_else(|| "Speech was detected, but no transcript text came back.".to_string())
}

async fn transcribe_with_google(
    audio_bytes: Vec<u8>,
    normalized_mime: &str,
    api_key: &str,
    model: &str,
) -> Result<String, String> {
    let client = build_client(90)?;
    let file_uri = upload_google_audio(&client, &audio_bytes, normalized_mime, api_key).await?;
    let response = client
        .post(format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, api_key
        ))
        .json(&json!({
            "contents": [{
                "role": "user",
                "parts": [
                    { "text": TRANSCRIPTION_PROMPT },
                    {
                        "file_data": {
                            "mime_type": normalized_mime,
                            "file_uri": file_uri,
                        }
                    }
                ]
            }],
            "generationConfig": {
                "temperature": 0
            }
        }))
        .send()
        .await
        .map_err(|err| {
            format!(
                "Voice transcription failed using Google Gemini: {}",
                err.to_string().replace(api_key, "***")
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(map_network_error)?;
    let json = parse_json_body(&body);

    if !status.is_success() {
        return Err(format!(
            "Voice transcription failed using Google Gemini model `{}`. {}",
            model,
            extract_error_message(&json)
        ));
    }

    let transcript = extract_candidate_text(&json);
    if transcript.is_empty() {
        return Err(
            "Google Gemini accepted the audio, but no transcript text came back.".to_string(),
        );
    }

    Ok(clean_transcript_output(&transcript))
}

async fn upload_google_audio(
    client: &Client,
    audio_bytes: &[u8],
    normalized_mime: &str,
    api_key: &str,
) -> Result<String, String> {
    let start_response = client
        .post(format!(
            "https://generativelanguage.googleapis.com/upload/v1beta/files?key={}",
            api_key
        ))
        .header("X-Goog-Upload-Protocol", "resumable")
        .header("X-Goog-Upload-Command", "start")
        .header(
            "X-Goog-Upload-Header-Content-Length",
            audio_bytes.len().to_string(),
        )
        .header("X-Goog-Upload-Header-Content-Type", normalized_mime)
        .json(&json!({
            "file": {
                "display_name": "voice-entry"
            }
        }))
        .send()
        .await
        .map_err(|err| {
            format!(
                "Failed to start Google Gemini audio upload: {}",
                err.to_string().replace(api_key, "***")
            )
        })?;

    let upload_url = start_response
        .headers()
        .get("x-goog-upload-url")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let status = start_response.status();
    let body = start_response.text().await.map_err(map_network_error)?;
    let json = parse_json_body(&body);

    if !status.is_success() {
        return Err(format!(
            "Failed to start Google Gemini audio upload. {}",
            extract_error_message(&json)
        ));
    }

    let upload_url = upload_url.ok_or_else(|| {
        "Google Gemini did not return an upload URL for the audio file.".to_string()
    })?;

    let upload_response = client
        .post(upload_url)
        .header("X-Goog-Upload-Command", "upload, finalize")
        .header("X-Goog-Upload-Offset", "0")
        .header("Content-Length", audio_bytes.len().to_string())
        .body(audio_bytes.to_vec())
        .send()
        .await
        .map_err(|err| {
            format!(
                "Failed to upload audio to Google Gemini: {}",
                err.to_string().replace(api_key, "***")
            )
        })?;

    let status = upload_response.status();
    let body = upload_response.text().await.map_err(map_network_error)?;
    let json = parse_json_body(&body);

    if !status.is_success() {
        return Err(format!(
            "Google Gemini rejected the uploaded audio. {}",
            extract_error_message(&json)
        ));
    }

    let file = &json["file"];
    let file_name = file["name"].as_str().unwrap_or_default().to_string();
    let file_uri = file["uri"].as_str().unwrap_or_default().to_string();
    let state = extract_google_file_state(file);

    if matches!(state.as_deref(), Some("PROCESSING")) && !file_name.is_empty() {
        return wait_for_google_file(client, &file_name, api_key).await;
    }

    if file_uri.is_empty() {
        return Err("Google Gemini uploaded the audio, but no file URI came back.".to_string());
    }

    Ok(file_uri)
}

async fn wait_for_google_file(
    client: &Client,
    file_name: &str,
    api_key: &str,
) -> Result<String, String> {
    for _ in 0..20 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        let response = client
            .get(format!(
                "https://generativelanguage.googleapis.com/v1beta/{}?key={}",
                file_name, api_key
            ))
            .send()
            .await
            .map_err(|err| {
                format!(
                    "Failed while waiting for Google Gemini audio processing: {}",
                    err.to_string().replace(api_key, "***")
                )
            })?;

        let status = response.status();
        let body = response.text().await.map_err(map_network_error)?;
        let json = parse_json_body(&body);

        if !status.is_success() {
            return Err(format!(
                "Failed while waiting for Google Gemini audio processing. {}",
                extract_error_message(&json)
            ));
        }

        let state = extract_google_file_state(&json);
        let file_uri = json["uri"].as_str().unwrap_or_default();
        if matches!(state.as_deref(), Some("ACTIVE")) && !file_uri.is_empty() {
            return Ok(file_uri.to_string());
        }
        if matches!(state.as_deref(), Some("FAILED")) {
            return Err(
                "Google Gemini accepted the audio upload, but processing the file failed."
                    .to_string(),
            );
        }
    }

    Err("Google Gemini audio processing took too long. Please try a shorter recording.".into())
}

async fn transcribe_with_local_whisper(
    app: &AppHandle,
    audio_bytes: Vec<u8>,
    normalized_mime: &str,
    provider: &LlmProvider,
) -> Result<String, String> {
    if normalized_mime != "audio/wav" {
        return Err(format!(
            "Voice logging for {} uses on-device transcription and expects WAV audio. Please update to the latest app build and try again.",
            provider.display_name()
        ));
    }

    let model_path = ensure_local_whisper_model(app).await?;
    let audio = decode_wav_audio(&audio_bytes)?;
    let provider_name = provider.display_name().to_string();

    let transcript =
        tokio::task::spawn_blocking(move || transcribe_with_local_whisper_sync(&model_path, audio))
            .await
            .map_err(|err| format!("Local voice transcription crashed: {err}"))??;

    if transcript.trim().is_empty() {
        return Err(format!(
            "{} on-device transcription completed, but no speech was detected.",
            provider_name
        ));
    }

    Ok(clean_transcript_output(&transcript))
}

fn transcribe_with_local_whisper_sync(
    model_path: &Path,
    audio: Vec<f32>,
) -> Result<String, String> {
    let model_path = model_path
        .to_str()
        .ok_or_else(|| "The local voice model path is invalid.".to_string())?;
    let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
        .map_err(|err| format!("Failed to load the local voice model: {err}"))?;
    let mut state = ctx
        .create_state()
        .map_err(|err| format!("Failed to create the local voice decoder: {err}"))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 0 });
    params.set_translate(false);
    params.set_language(Some("en"));
    params.set_no_context(true);
    params.set_no_timestamps(true);
    params.set_print_progress(false);
    params.set_print_special(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_n_threads(whisper_thread_count());
    params.set_detect_language(false);
    params.set_initial_prompt(LOCAL_WHISPER_PROMPT);
    params.set_single_segment(true);

    state
        .full(params, &audio)
        .map_err(|err| format!("Failed to run on-device voice transcription: {err}"))?;

    let transcript = state
        .as_iter()
        .map(|segment| segment.to_string())
        .collect::<Vec<_>>()
        .join(" ");

    Ok(transcript.split_whitespace().collect::<Vec<_>>().join(" "))
}

async fn ensure_local_whisper_model(app: &AppHandle) -> Result<PathBuf, String> {
    let models_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to locate the app data directory: {err}"))?
        .join("models")
        .join("whisper");
    let model_path = models_dir.join(LOCAL_WHISPER_MODEL_NAME);
    let _guard = model_download_lock().lock().await;

    if fs::try_exists(&model_path)
        .await
        .map_err(|err| format!("Failed to inspect the local voice model: {err}"))?
    {
        return Ok(model_path);
    }

    fs::create_dir_all(&models_dir)
        .await
        .map_err(|err| format!("Failed to prepare local voice model storage: {err}"))?;

    let client = build_client(300)?;
    let response = client
        .get(LOCAL_WHISPER_MODEL_URL)
        .send()
        .await
        .map_err(|err| format!("Failed to download the local voice model: {err}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Failed to download the local voice model. Server returned status {}.",
            status
        ));
    }

    let bytes = response.bytes().await.map_err(map_network_error)?;
    let temp_path = models_dir.join(format!("{}.part", LOCAL_WHISPER_MODEL_NAME));
    fs::write(&temp_path, &bytes)
        .await
        .map_err(|err| format!("Failed to save the local voice model: {err}"))?;
    fs::rename(&temp_path, &model_path)
        .await
        .map_err(|err| format!("Failed to finalize the local voice model download: {err}"))?;

    Ok(model_path)
}

fn model_download_lock() -> &'static Mutex<()> {
    static MODEL_DOWNLOAD_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    MODEL_DOWNLOAD_LOCK.get_or_init(|| Mutex::new(()))
}

fn decode_wav_audio(audio_bytes: &[u8]) -> Result<Vec<f32>, String> {
    let reader = hound::WavReader::new(Cursor::new(audio_bytes))
        .map_err(|_| "The local voice transcriber could not read the WAV recording.".to_string())?;
    let spec = reader.spec();
    let channels = usize::from(spec.channels);
    if channels == 0 {
        return Err("The WAV recording does not contain any audio channels.".into());
    }

    let interleaved = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Int, 16) => reader
            .into_samples::<i16>()
            .map(|sample| {
                sample
                    .map(|value| value as f32 / i16::MAX as f32)
                    .map_err(|err| err.to_string())
            })
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| format!("The WAV recording could not be decoded: {err}"))?,
        (hound::SampleFormat::Float, 32) => reader
            .into_samples::<f32>()
            .map(|sample| sample.map_err(|err| err.to_string()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| format!("The WAV recording could not be decoded: {err}"))?,
        _ => {
            return Err(
                "The local voice transcriber currently supports 16-bit PCM WAV audio.".to_string(),
            )
        }
    };

    let mono = if channels == 1 {
        interleaved
    } else {
        interleaved
            .chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect::<Vec<_>>()
    };

    Ok(resample_audio(&mono, spec.sample_rate, 16_000))
}

fn resample_audio(audio: &[f32], input_rate: u32, output_rate: u32) -> Vec<f32> {
    if input_rate == output_rate || audio.is_empty() {
        return audio.to_vec();
    }

    let ratio = input_rate as f64 / output_rate as f64;
    let output_len = ((audio.len() as f64) / ratio).round() as usize;
    let mut output = Vec::with_capacity(output_len);

    for output_idx in 0..output_len {
        let position = output_idx as f64 * ratio;
        let left = position.floor() as usize;
        let right = (left + 1).min(audio.len().saturating_sub(1));
        let fraction = (position - left as f64) as f32;
        let left_sample = audio[left];
        let right_sample = audio[right];
        output.push(left_sample + (right_sample - left_sample) * fraction);
    }

    output
}

fn whisper_thread_count() -> i32 {
    let available = std::thread::available_parallelism()
        .map(|value| value.get())
        .unwrap_or(1);
    available.min(4) as i32
}

fn build_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .user_agent("NutriLog/1.0")
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|err| format!("HTTP client error: {err}"))
}

fn selected_model_for_provider(provider_id: &str) -> Option<String> {
    AiConfig::current()
        .ok()
        .and_then(|cfg| cfg.selected_models.get(provider_id).cloned())
        .filter(|model| !model.trim().is_empty())
}

fn preferred_openai_style_model(provider_id: &str, fallback: &str) -> String {
    match selected_model_for_provider(provider_id) {
        Some(model) if looks_like_transcription_model(&model) => model,
        _ => fallback.to_string(),
    }
}

fn looks_like_transcription_model(model: &str) -> bool {
    let lower = model.trim().to_ascii_lowercase();
    !lower.is_empty()
        && (lower.contains("whisper")
            || lower.contains("transcribe")
            || lower.contains("transcription")
            || lower.contains("speech")
            || lower.contains("audio"))
}

fn normalize_openai_compatible_base_url(endpoint: &str) -> String {
    let mut normalized = endpoint.trim().trim_end_matches('/').to_string();
    if normalized.ends_with("/v1") {
        normalized = normalized.strip_suffix("/v1").unwrap().to_string();
    }
    normalized
}

fn parse_json_body(body: &str) -> Value {
    serde_json::from_str(body).unwrap_or_else(|_| json!({ "raw": body }))
}

fn extract_error_message(json: &Value) -> String {
    json["error"]["message"]
        .as_str()
        .or_else(|| json["message"].as_str())
        .or_else(|| json["raw"].as_str())
        .unwrap_or("Unknown transcription error")
        .to_string()
}

fn extract_openai_style_transcript(json: &Value) -> Option<String> {
    json["text"]
        .as_str()
        .or_else(|| json["transcript"].as_str())
        .map(clean_transcript_output)
}

fn extract_candidate_text(json: &Value) -> String {
    json["candidates"][0]["content"]["parts"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part["text"].as_str())
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

fn extract_google_file_state(file_json: &Value) -> Option<String> {
    file_json["state"]["name"]
        .as_str()
        .or_else(|| file_json["state"].as_str())
        .map(str::to_string)
}

fn clean_transcript_output(transcript: &str) -> String {
    let trimmed = transcript.trim().trim_matches('"').trim();
    let without_label = Regex::new(r"(?i)^(transcription|transcript)\s*:\s*")
        .unwrap()
        .replace(trimmed, "");
    without_label
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_audio_mime(mime_type: &str) -> Result<&str, String> {
    let normalized = mime_type.trim().to_ascii_lowercase();
    if normalized.starts_with("audio/webm") {
        Ok("audio/webm")
    } else if normalized.starts_with("audio/mp4") || normalized.starts_with("audio/m4a") {
        Ok("audio/mp4")
    } else if normalized.starts_with("audio/ogg") {
        Ok("audio/ogg")
    } else if normalized.starts_with("audio/wav") || normalized.starts_with("audio/x-wav") {
        Ok("audio/wav")
    } else {
        Err("Voice logging supports WebM, MP4/M4A, OGG, or WAV recordings.".into())
    }
}

fn audio_extension(mime_type: &str) -> &'static str {
    match mime_type {
        "audio/webm" => "webm",
        "audio/mp4" => "m4a",
        "audio/ogg" => "ogg",
        "audio/wav" => "wav",
        _ => "bin",
    }
}

fn normalize_transcript(transcript: &str) -> VoiceFoodTranscript {
    let meal_type_hint = parse_meal_type(transcript);
    let quantity_hint = parse_quantity_hint(transcript);

    let mut normalized = strip_command_prefix(transcript);

    normalized = Regex::new(r"\b(for|as)\s+(breakfast|lunch|dinner|snack)\b")
        .unwrap()
        .replace_all(&normalized, "")
        .to_string();
    normalized = Regex::new(r"\b(today|please|now)\b")
        .unwrap()
        .replace_all(&normalized, "")
        .to_string();
    normalized = Regex::new(
        r"^\s*(a|an|the|my|half|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\s+(?:(gram|grams|g|kg|kilogram|kilograms|mg|milligram|milligrams|ml|milliliter|milliliters|l|liter|liters|oz|ounce|ounces|lb|lbs|pound|pounds|kcal|calorie|calories|slice|slices|cup|cups|serving|servings|piece|pieces|bottle|bottles|can|cans|bag|bags|bar|bars|bowl|bowls|plate|plates)\s+)?",
    )
    .unwrap()
    .replace(&normalized, "")
    .to_string();
    normalized = Regex::new(r"[^\w\s\-/]")
        .unwrap()
        .replace_all(&normalized, " ")
        .to_string();
    normalized = normalized.split_whitespace().collect::<Vec<_>>().join(" ");

    if normalized.is_empty() {
        normalized = transcript.trim().to_string();
    }

    VoiceFoodTranscript {
        transcript: transcript.trim().to_string(),
        normalized_query: normalized,
        quantity_hint,
        meal_type_hint,
        confidence: None,
    }
}

fn strip_command_prefix(transcript: &str) -> String {
    let mut normalized = transcript.trim().to_lowercase();
    for prefix in [
        "log ",
        "add ",
        "track ",
        "record ",
        "i had ",
        "i ate ",
        "i drank ",
        "i want to log ",
        "can you log ",
    ] {
        if let Some(stripped) = normalized.strip_prefix(prefix) {
            normalized = stripped.to_string();
            break;
        }
    }
    normalized
}

fn parse_meal_type(transcript: &str) -> Option<String> {
    let lower = transcript.to_lowercase();
    if lower.contains("breakfast") {
        Some("breakfast".into())
    } else if lower.contains("lunch") {
        Some("lunch".into())
    } else if lower.contains("dinner") {
        Some("dinner".into())
    } else if lower.contains("snack") {
        Some("snack".into())
    } else {
        None
    }
}

fn parse_quantity_hint(transcript: &str) -> Option<f32> {
    let working = strip_command_prefix(transcript);
    let capture = Regex::new(
        r"^\s*(?P<qty>half|a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+(?:\.\d+)?)\b(?:\s+(?P<unit>[a-z]+))?",
    )
    .unwrap();
    let captures = capture.captures(&working)?;
    let qty_token = captures.name("qty")?.as_str();
    let unit = captures.name("unit").map(|m| m.as_str()).unwrap_or("");

    if matches!(
        unit,
        "gram"
            | "grams"
            | "g"
            | "kg"
            | "kilogram"
            | "kilograms"
            | "mg"
            | "milligram"
            | "milligrams"
            | "ml"
            | "milliliter"
            | "milliliters"
            | "l"
            | "liter"
            | "liters"
            | "oz"
            | "ounce"
            | "ounces"
            | "lb"
            | "lbs"
            | "pound"
            | "pounds"
            | "kcal"
            | "calorie"
            | "calories"
    ) {
        return None;
    }

    match qty_token {
        "half" => Some(0.5),
        "a" | "an" | "one" => Some(1.0),
        "two" => Some(2.0),
        "three" => Some(3.0),
        "four" => Some(4.0),
        "five" => Some(5.0),
        "six" => Some(6.0),
        "seven" => Some(7.0),
        "eight" => Some(8.0),
        "nine" => Some(9.0),
        "ten" => Some(10.0),
        raw => raw.parse::<f32>().ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_transcript_extracts_meal_and_quantity() {
        let normalized = normalize_transcript("Log two bananas for breakfast");
        assert_eq!(normalized.meal_type_hint.as_deref(), Some("breakfast"));
        assert_eq!(normalized.quantity_hint, Some(2.0));
        assert_eq!(normalized.normalized_query, "bananas");
    }

    #[test]
    fn normalize_transcript_preserves_food_phrase() {
        let normalized = normalize_transcript("I had chicken burrito bowl for lunch");
        assert_eq!(normalized.meal_type_hint.as_deref(), Some("lunch"));
        assert_eq!(normalized.normalized_query, "chicken burrito bowl");
    }

    #[test]
    fn quantity_hint_ignores_weight_measurements() {
        let normalized = normalize_transcript("Log 100 grams chicken for lunch");
        assert_eq!(normalized.quantity_hint, None);
        assert_eq!(normalized.meal_type_hint.as_deref(), Some("lunch"));
        assert_eq!(normalized.normalized_query, "chicken");
    }

    #[test]
    fn transcription_model_detection_prefers_audio_models() {
        assert!(looks_like_transcription_model("whisper"));
        assert!(looks_like_transcription_model("gpt-4o-mini-transcribe"));
        assert!(!looks_like_transcription_model("llama3.2"));
    }

    #[test]
    fn openai_compatible_base_url_strips_v1_suffix() {
        assert_eq!(
            normalize_openai_compatible_base_url("http://localhost:11434/v1/"),
            "http://localhost:11434"
        );
    }

    #[test]
    fn clean_transcript_output_strips_transcript_label() {
        assert_eq!(
            clean_transcript_output("Transcript: log two bananas"),
            "log two bananas"
        );
    }

    #[test]
    fn resample_audio_preserves_existing_16khz_signal() {
        let samples = vec![0.0, 0.5, -0.5, 0.25];
        assert_eq!(resample_audio(&samples, 16_000, 16_000), samples);
    }
}
