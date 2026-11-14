# PulseCtrl

### Your laptop, one tap away.

PulseCtrl turns your phone into a wireless trackpad and keyboard for your laptop. Both devices connect over your local Wi-Fi; the laptop asks you to approve a phone before it can control anything.

## Get ready

- Install [Node.js 18 or newer](https://nodejs.org/).
- Connect your laptop and phone to the same Wi-Fi network.
- Open a terminal in the PulseCtrl project folder and install dependencies:

```bash
npm install
```

## Start PulseCtrl

Open **two terminals** in the project folder. The server and helper both need to stay running, so leave each terminal open while you use PulseCtrl.

**Terminal 1 — start the server:**

```bash
cd server
npm run server
```

**Terminal 2 — start the laptop helper:**

```bash
cd helper
npm run helper
```

The server displays your laptop's local IP and port. The helper opens the laptop control page; if it does not open automatically, use the `Laptop Web` URL it prints. If you set a custom port, use the same `PORT` value for both processes.

## Pair your phone

1. Keep both devices on the same Wi-Fi network. Allow local network access in your laptop firewall if prompted.
2. Open the laptop control page and scan its QR code with your phone.
3. Approve the request on the laptop when **Allow this device?** appears. Choose **Deny** to refuse it.
4. Use the phone as a trackpad or keyboard. Choose **Disconnect** on the laptop to end the session.

Each QR code works once and expires after 2 minutes. Approved sessions end after 15 minutes without activity. Only one phone can connect per session; a fresh QR code appears when a session ends.

## Local HTTPS & Mobile Voice Permission

Mobile browsers (Safari on iOS and Chrome on Android) require an **HTTPS (Secure Context)** connection to grant access to the microphone and Web Speech API.

PulseCtrl automatically generates a local self-signed TLS certificate with Subject Alternative Names (SAN) for `localhost`, `127.0.0.1`, and your active LAN IP address on the first run, saved in `certs/`.

### One-Time "Trust This Certificate" Step on Phone
When scanning the QR code for the first time on your phone:
- **iOS (Safari)**: You will see "This Connection Is Not Private". Tap **Show Details** at the bottom, then tap **visit this website**, and confirm **Visit Website**.
- **Android (Chrome)**: You will see "Your connection is not private". Tap **Advanced**, then tap **Proceed to <your-ip> (unsafe)**.

Once accepted, the phone browser saves the certificate exception and will seamlessly allow microphone permissions for PulseCtrl AI voice input.

### Optional: Using `mkcert` for Locally-Trusted Certificates
If you prefer not to see the browser certificate warning on your devices, you can generate locally trusted certificates using [mkcert](https://github.com/FiloSottile/mkcert):

```bash
# Install mkcert and install the local CA
mkcert -install

# Create certs with your LAN IP (e.g. 192.168.1.100)
mkdir -p certs
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 <your-lan-ip>
```
PulseCtrl will automatically detect `certs/key.pem` and `certs/cert.pem` and use them without regenerating.

To disable HTTPS and run over HTTP: set `ENABLE_HTTPS=false` in `.env`.

## A note about permissions

The helper uses your operating system's input APIs to move and click the cursor and type. macOS may ask you to grant Accessibility permission to the terminal or Node.js process running the helper.

## Run the checks

```bash
npm test
npm run test:lifecycle
```

## License

MIT
