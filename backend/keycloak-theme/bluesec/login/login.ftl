<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="stylesheet" href="${url.resourcesPath}/css/styles.css">
</head>
<body style="margin: 0; padding: 0;">
<div class="glitch-form-wrapper">
  <div class="rain-bg"></div>
  <form id="kc-form-login" class="glitch-card" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">


    <div class="logo-section">
      <img src="${url.resourcesPath}/img/blsc_white.png" alt="BlueSec" class="login-logo" />
      <#if properties.productName?has_content>
        <div class="product-name">${properties.productName}</div>
      </#if>
      <#if properties.productTagline?has_content>
        <div class="product-tagline">${properties.productTagline}</div>
      </#if>
    </div>

    <div class="card-body">
      <#if message?has_content && (message.type != 'warning')>
          <div style="color: #f43f5e; font-size: 0.8rem; margin-bottom: 1.5rem; text-transform: uppercase;">
              ${kcSanitize(message.summary)?no_esc}
          </div>
      </#if>

      <div class="form-group">
        <input type="text" id="username" name="username" required placeholder=" " autocomplete="off" />
        <label for="username" class="form-label" data-text="${msg("username")}">${msg("username")}</label>
      </div>

      <div class="form-group">
        <input type="password" id="password" name="password" required placeholder=" " autocomplete="off" />
        <label for="password" class="form-label" data-text="${msg("password")}">${msg("password")}</label>
      </div>

      <button data-text="${msg("doLogIn")}" type="submit" class="submit-btn" name="login" id="kc-login">
        <span class="btn-text">${msg("doLogIn")}</span>
      </button>
    </div>
  </form>
</div>
<script>
    // Force clear autofill on load to satisfy 'start empty' requirement
    window.addEventListener('load', () => {
        setTimeout(() => {
            const u = document.getElementById('username');
            const p = document.getElementById('password');
            if (u) u.value = '';
            if (p) p.value = '';
        }, 50);
    });
</script>
</body>
</html>
