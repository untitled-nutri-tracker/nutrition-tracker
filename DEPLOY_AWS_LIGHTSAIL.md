# Deploy the Tauri App on AWS Lightsail with noVNC

This deployment runs the existing Tauri desktop app inside a Linux GUI in Docker. The browser connects to noVNC, noVNC connects to TigerVNC/Xvnc, and TigerVNC shows the virtual desktop running the Tauri app.

Target URL:

```text
http://SERVER_IP:6080/vnc.html?resize=remote
```

## Project Inspection

- Package manager: `npm` (`package-lock.json` is present).
- Tauri version: v2 (`@tauri-apps/*` packages are v2, `tauri.conf.json` uses schema `/config/2`, and Rust depends on `tauri = "2"`).
- Linux WebKit dependency: `libwebkit2gtk-4.1-dev`.
- Dev command: `npm run tauri -- dev`.
- Release build command used by Docker: `npm run tauri -- build --no-bundle`.
- Release binary path: usually `/app/target/release/nutrition-tracker`.
- App name: `nutrition-tracker`.
- Tauri identifier: `com.pierretran.nutrition-tracker`.
- SQLite behavior: the app opens local SQLite files through Tauri commands. The default app-managed path is Tauri app data plus `databases/nutrition.db`; this Docker setup persists app data under `/app/data`.
- Ollama text model in source: `llama3.2` by default.
- Ollama photo model in source: `llama3.2-vision` for photo scanning.
- Docker default text model: `llama3.2:1b` for better CPU performance on Lightsail. Change `OLLAMA_MODEL` if you want a different model.

## Files Added

- `Dockerfile`
- `start.sh`
- `docker-compose.yml`
- `DEPLOY_AWS_LIGHTSAIL.md`
- `.dockerignore`

## Local Docker Test

Build:

```bash
docker build -t tauri-cloud-demo .
```

Run:

```bash
docker run -p 6080:6080 tauri-cloud-demo
```

Open:

```text
http://localhost:6080/vnc.html?resize=remote
```

Click connect. By default, the demo container does not require a VNC password.

The Tauri window is configured as `1400x950`, so the container defaults to a
TigerVNC desktop that fits the app without forcing heavy browser downscaling:

```text
VNC_RESOLUTION=1600x1000
VNC_DPI=96
NOVNC_RESIZE=remote
```

`NOVNC_RESIZE=remote` lets noVNC ask TigerVNC to resize the remote desktop to
the browser viewport. This is sharper than scaling a fixed pixel canvas down.
Use browser zoom `100%` and fullscreen for the cleanest view.

You can run with a larger virtual screen for a large monitor or projector:

```bash
docker run -p 6080:6080 \
  -e VNC_RESOLUTION=1920x1080 \
  tauri-cloud-demo
```

## Local Test with Persistence

Using Compose keeps app data and SQLite files in `./data`:

```bash
mkdir -p data
docker compose up --build
```

Open:

```text
http://localhost:6080/vnc.html?resize=remote
```

## AWS Lightsail Deployment

1. Create an Ubuntu 22.04 Lightsail instance.

   Prefer 8 GB RAM / 2 vCPU for Ollama. A 4 GB RAM / 2 vCPU instance can work with a very small model such as `llama3.2:1b`.

2. SSH into the instance.

3. Install Docker and Git:

```bash
sudo apt update
sudo apt install -y docker.io git
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
```

4. Log out and back in so the Docker group change applies.

5. Clone the repo:

```bash
git clone REPLACE_WITH_REPO_URL
cd REPLACE_WITH_REPO_DIRECTORY
```

6. Build the image:

```bash
docker build -t tauri-cloud-demo .
```

7. Run the container:

```bash
docker run -d \
  --name tauri-demo \
  -p 6080:6080 \
  -e VNC_RESOLUTION=1600x1000 \
  -e VNC_DPI=96 \
  -e NOVNC_RESIZE=remote \
  -e OLLAMA_MODEL=llama3.2:1b \
  -v "$PWD/data:/app/data" \
  --restart unless-stopped \
  tauri-cloud-demo
```

8. In Lightsail Networking, open inbound TCP port `6080`.

9. Give the professor:

```text
http://SERVER_IP:6080/vnc.html?resize=remote
```

No VNC password is required by default.

## VNC Password

The first-demo setup is passwordless so the professor can open it quickly. If
you want to add a VNC password, stop and recreate the container with
`VNC_PASSWORD` set:

```bash
docker rm -f tauri-demo
docker run -d \
  --name tauri-demo \
  -p 6080:6080 \
  -e VNC_PASSWORD=NEW_PASSWORD_HERE \
  -v "$PWD/data:/app/data" \
  --restart unless-stopped \
  tauri-cloud-demo
```

With Compose:

```bash
VNC_PASSWORD=NEW_PASSWORD_HERE docker compose up -d
```

For a short grading demo, passwordless access may be acceptable if you shut down
the instance afterward. For anything left online longer, set `VNC_PASSWORD` or
put the service behind a private network/reverse proxy.

## Screen Size and Scaling

The app's Tauri config opens a `1400x950` window. TigerVNC starts at a practical
default size, and noVNC uses remote resize so the desktop can adapt to the
browser viewport:

```text
VNC_RESOLUTION=1600x1000
VNC_DPI=96
NOVNC_RESIZE=remote
```

For best sharpness, open:

```text
http://SERVER_IP:6080/vnc.html?resize=remote
```

Use browser zoom `100%`. noVNC's local/browser scaling modes still work, but
they can look softer because they scale pixels. For a large monitor or
projector, you can start with a larger initial desktop:

```bash
docker rm -f tauri-demo
docker run -d \
  --name tauri-demo \
  -p 6080:6080 \
  -e VNC_RESOLUTION=1920x1080 \
  -e VNC_DPI=96 \
  -e NOVNC_RESIZE=remote \
  -v "$PWD/data:/app/data" \
  --restart unless-stopped \
  tauri-cloud-demo
```

If remote resize behaves oddly in a particular browser, use the noVNC settings
panel to switch scaling mode, or set `NOVNC_RESIZE=scale` for automatic fit with
softer rendering.

## SQLite Data

The container persists app data and SQLite files under `/app/data`.

Default database inside the container:

```text
/app/data/nutrition.db
```

Default host path when using the provided commands:

```text
./data/nutrition.db
```

The startup script automatically creates an empty NutriLog SQLite database if none exists. To preload your own demo database:

```bash
mkdir -p data
cp /path/to/demo-nutrition.db data/nutrition.db
docker run -d \
  --name tauri-demo \
  -p 6080:6080 \
  -v "$PWD/data:/app/data" \
  --restart unless-stopped \
  tauri-cloud-demo
```

To seed the built-in 30-day demo food log SQL at startup:

```bash
docker run -d \
  --name tauri-demo \
  -p 6080:6080 \
  -e SEED_DEMO_DATA=true \
  -v "$PWD/data:/app/data" \
  --restart unless-stopped \
  tauri-cloud-demo
```

If you want the app to show its normal database setup screen instead of auto-creating `/app/data/nutrition.db`, set:

```bash
-e AUTO_CREATE_DB=false
```

## Ollama Model

The source default for text chat is `llama3.2`, but the Docker setup defaults to `llama3.2:1b` for Lightsail CPU performance and writes that choice into the app AI config.

Change the model:

```bash
docker run -d \
  --name tauri-demo \
  -p 6080:6080 \
  -e OLLAMA_MODEL=qwen2.5:1.5b \
  -v "$PWD/data:/app/data" \
  --restart unless-stopped \
  tauri-cloud-demo
```

Pull a model manually:

```bash
docker exec -it tauri-demo ollama pull qwen2.5:1.5b
```

Photo scanning uses `llama3.2-vision` in the Rust source. That model is much larger, so it is not pulled by default. Enable it only if the demo needs photo scanning:

```bash
docker run -d \
  --name tauri-demo \
  -p 6080:6080 \
  -e PULL_OLLAMA_VISION_MODEL=true \
  -v "$PWD/data:/app/data" \
  --restart unless-stopped \
  tauri-cloud-demo
```

## Common Troubleshooting

Check container logs:

```bash
docker logs -f tauri-demo
```

Check Ollama logs:

```bash
docker exec -it tauri-demo tail -100 /tmp/ollama.log
```

Check TigerVNC/noVNC logs:

```bash
docker exec -it tauri-demo tail -100 /tmp/tigervnc.log
docker exec -it tauri-demo tail -100 /tmp/websockify.log
```

If `http://SERVER_IP:6080/vnc.html` does not load:

- Confirm the container is running: `docker ps`.
- Confirm the port is published: `docker port tauri-demo`.
- Confirm Lightsail Networking allows inbound TCP `6080`.
- Confirm the instance OS firewall is not blocking the port.

If the app opens but AI is slow:

- Use `OLLAMA_MODEL=llama3.2:1b` or `OLLAMA_MODEL=qwen2.5:1.5b`.
- Use an 8 GB RAM / 2 vCPU Lightsail instance.
- Avoid pulling `llama3.2-vision` unless photo scanning is required.

If the app cannot find data after restart:

- Run the container with `-v "$PWD/data:/app/data"`.
- Confirm `data/nutrition.db` exists on the host.
- Confirm the container has `/app/data/nutrition.db`.

## Security Notes

- Passwordless noVNC is convenient for a short grading demo, but anyone with
  the URL can connect while the port is open.
- Use a demo SQLite database, not sensitive real data.
- Shut down or delete the Lightsail instance after grading.
- Set `VNC_PASSWORD` if the instance will stay online longer than the demo.
- Add an Nginx reverse proxy and HTTPS later if this needs to stay online.
