export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    if (track.readyState === "live") {
      track.stop();
    }
  });
}

export function stopVideoElementStream(videoEl: HTMLVideoElement | null | undefined) {
  if (!videoEl?.srcObject) return;
  const stream = videoEl.srcObject as MediaStream;
  stopMediaStream(stream);
  videoEl.srcObject = null;
}

export async function attachCameraStream(
  videoEl: HTMLVideoElement,
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}
