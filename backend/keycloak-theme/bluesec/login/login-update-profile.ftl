<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UPDATE_PROFILE</title>
    <link rel="stylesheet" href="${url.resourcesPath}/css/styles.css">
</head>
<body style="margin: 0; padding: 0; background-color: #050505;">
<div class="glitch-form-wrapper">
  <form id="kc-update-profile-form" class="glitch-card" action="${url.loginAction}" method="post">
    <div class="card-header">
      <div class="card-title"><span>REQUIRE_PROFILE_SYNC</span></div>
    </div>
    <div class="card-body">
      <div class="form-group">
        <input type="text" id="email" name="email" value="${(user.email!'')}" required placeholder=" " />
        <label for="email" class="form-label" data-text="EMAIL">EMAIL</label>
      </div>
      <div class="form-group">
        <input type="text" id="firstName" name="firstName" value="${(user.firstName!'')}" required placeholder=" " />
        <label for="firstName" class="form-label" data-text="FIRST_NAME">FIRST_NAME</label>
      </div>
      <div class="form-group">
        <input type="text" id="lastName" name="lastName" value="${(user.lastName!'')}" required placeholder=" " />
        <label for="lastName" class="form-label" data-text="LAST_NAME">LAST_NAME</label>
      </div>
      <button data-text="SYNC_DATA" type="submit" class="submit-btn">
        <span class="btn-text">SYNC_DATA</span>
      </button>
    </div>
  </form>
</div>
</body>
</html>
