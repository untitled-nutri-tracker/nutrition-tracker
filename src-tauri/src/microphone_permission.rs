#[cfg(target_os = "macos")]
pub fn ensure_microphone_permission() -> Result<String, String> {
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    use std::sync::mpsc;
    use std::time::Duration;

    let media_type = unsafe {
        AVMediaTypeAudio.ok_or_else(|| {
            "Microphone media type is unavailable on this macOS runtime.".to_string()
        })?
    };

    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) };
    if status == AVAuthorizationStatus::Authorized {
        return Ok("granted".into());
    }
    if status == AVAuthorizationStatus::Denied {
        return Ok("denied".into());
    }
    if status == AVAuthorizationStatus::Restricted {
        return Ok("restricted".into());
    }

    let (tx, rx) = mpsc::channel::<bool>();
    let block = block2::RcBlock::new(move |granted: objc2::runtime::Bool| {
        let _ = tx.send(granted.as_bool());
    });

    unsafe {
        AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &block);
    }

    let granted = rx
        .recv_timeout(Duration::from_secs(60))
        .map_err(|_| "macOS microphone permission request did not complete.".to_string())?;

    Ok(if granted { "granted" } else { "denied" }.into())
}

#[cfg(not(target_os = "macos"))]
pub fn ensure_microphone_permission() -> Result<String, String> {
    Ok("unsupported".into())
}
