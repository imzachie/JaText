export default function handler(_req, res) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow" />
  <title>404 Error | JaText</title>
  <style>
    :root {
      color-scheme: dark;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      min-height: 100%;
      background: radial-gradient(circle at 50% 0%, #1d1633 0%, #0b0b10 58%, #07070b 100%);
      color: #f4f4f8;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 440px;
      padding: 36px 28px;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.055);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 28px 64px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(239, 68, 68, 0.14);
      border: 1px solid rgba(248, 113, 113, 0.34);
      color: #fca5a5;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    h1 {
      font-size: 38px;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: #ffffff;
      margin-bottom: 12px;
    }
    p {
      font-size: 15.5px;
      line-height: 1.55;
      color: rgba(244, 244, 248, 0.78);
      margin-bottom: 26px;
    }
    a.btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 13px 20px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #ffffff;
      font-size: 14.5px;
      font-weight: 600;
      text-decoration: none;
      transition: transform 0.18s ease, background 0.18s ease;
    }
    a.btn:hover {
      background: rgba(255, 255, 255, 0.16);
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <main class="card" role="main">
    <div class="badge">Restricted Route</div>
    <h1>404 Error</h1>
    <p>You have no authorization to access this page.</p>
    <a class="btn" href="/">Back to JaText Home</a>
  </main>
</body>
</html>`;

  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.end(html);
}
