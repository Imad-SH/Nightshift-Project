<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AUTH_ERROR</title>
    <link rel="stylesheet" href="${url.resourcesPath}/css/styles.css">
</head>
<body style="margin: 0; padding: 0; background-color: #050505;">
<div class="glitch-form-wrapper">
  <div class="glitch-card">
    <div class="card-header">
      <div class="card-title">
        <span style="color: #f43f5e">SYSTEM_ERROR</span>
      </div>
    </div>
    <div class="card-body">
      <p style="color: #e5e5e5; font-family: 'Fira Code'; font-size: 0.9rem;">${message.summary}</p>
      <a href="${url.loginRestartFlowUrl}" class="submit-btn" style="text-decoration: none; display: block; text-align: center;">
        <span class="btn-text">RESTART_AUTH</span>
      </a>
    </div>
  </div>
</div>
</body>
</html>
