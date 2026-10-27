<#import "footer.ftl" as loginFooter>
<#--
  Layout of every sign-in page (sign-in, password change, errors, OTP...): a BlueSec-blue
  brand panel and a white form panel. It keeps all of Keycloak's base layout behaviour
  (session checks, messages, "try another way", attempted username), only the look changes.
-->
<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}" lang="${lang}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="color-scheme" content="light">
    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="icon" href="${url.resourcesPath}/img/nightshift-favicon.png" />
    <link rel="preload" href="${url.resourcesPath}/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin>
    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
    <script src="${url.resourcesPath}/js/menu-button-links.js" type="module"></script>
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    <script type="module">
        import { startSessionPolling } from "${url.resourcesPath}/js/authChecker.js";

        startSessionPolling(
            "${url.ssoLoginInOtherTabsUrl?no_esc}"
        );
    </script>
    <script type="module">
        document.addEventListener("click", (event) => {
            const link = event.target.closest("a[data-once-link]");
            if (!link) {
                return;
            }
            if (link.getAttribute("aria-disabled") === "true") {
                event.preventDefault();
                return;
            }
            const { disabledClass } = link.dataset;
            if (disabledClass) {
                link.classList.add(...disabledClass.trim().split(/\s+/));
            }
            link.setAttribute("role", "link");
            link.setAttribute("aria-disabled", "true");
        });
    </script>
    <#if authenticationSession??>
        <script type="module">
            import { checkAuthSession } from "${url.resourcesPath}/js/authChecker.js";

            checkAuthSession(
                "${authenticationSession.authSessionIdHash}"
            );
        </script>
    </#if>
</head>

<body class="ns-body ${properties.kcBodyClass!} ${bodyClass}" data-page-id="login-${pageId}">
<div class="ns-shell">

    <aside class="ns-brand" aria-label="${properties.productName!'Nightshift'}">
        <img class="ns-brand-logo" src="${url.resourcesPath}/img/nightshift-logo-white.png" alt="${properties.productName!'Nightshift'}" width="200" height="58">

        <div class="ns-brand-main">
            <div class="ns-orbit" aria-hidden="true">
                <svg viewBox="0 0 400 400">
                    <defs>
                        <linearGradient id="ns-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#70c3b8"/><stop offset="1" stop-color="#475ea8"/></linearGradient>
                    </defs>
                    <line x1="8" y1="118" x2="392" y2="282" stroke="rgba(255,255,255,0.07)"/>
                    <line x1="52" y1="344" x2="348" y2="56" stroke="rgba(255,255,255,0.07)"/>
                    <circle cx="200" cy="200" r="186" fill="none" stroke="rgba(255,255,255,0.08)"/>
                    <circle cx="200" cy="200" r="138" fill="none" stroke="rgba(255,255,255,0.12)"/>
                    <circle cx="200" cy="200" r="86" fill="rgba(255,255,255,0.03)" stroke="url(#ns-ring)" stroke-width="1.4"/>
                    <g class="ns-spin">
                        <circle cx="200" cy="14" r="10" fill="rgba(112,195,184,0.16)"/><circle cx="200" cy="14" r="4.5" fill="#70c3b8" class="ns-pulse"/>
                        <circle cx="361" cy="293" r="8" fill="rgba(112,195,184,0.16)"/><circle cx="361" cy="293" r="3.5" fill="#70c3b8"/>
                    </g>
                    <g class="ns-spin ns-rev">
                        <circle cx="62" cy="200" r="9" fill="rgba(159,176,230,0.16)"/><circle cx="62" cy="200" r="4" fill="#9fb0e6" class="ns-pulse"/>
                        <circle cx="298" cy="102" r="7" fill="rgba(112,195,184,0.16)"/><circle cx="298" cy="102" r="3" fill="#70c3b8"/>
                    </g>
                </svg>
                <img src="${url.resourcesPath}/img/nightshift-mark-white.png" alt="" width="512" height="512">
            </div>
            <p class="ns-brand-title"><span>The AI analyst</span> <span class="ns-lt">that never clocks out.</span></p>
            <p class="ns-brand-steps">Detect <i></i> Investigate <i></i> Decide</p>
        </div>

        <div class="ns-maker">
            <span>Developed by</span>
            <img src="${url.resourcesPath}/img/bluesec-logo.svg" alt="BlueSec" width="78" height="30">
        </div>
    </aside>

    <main class="ns-panel">
        <div class="ns-card ${properties.kcFormCardClass!}">
            <header class="ns-card-head">
                <span class="ns-eyebrow">Secure sign-in</span>
            <#if !(auth?has_content && auth.showUsername() && !auth.showResetCredentials())>
                <h1 id="kc-page-title"><#nested "header"></h1>
            <#else>
                <#nested "show-username">
                <h1 id="kc-page-title"><#nested "header"></h1>
                <div id="kc-username" class="ns-attempted">
                    <span class="ns-avatar" aria-hidden="true"></span>
                    <label id="kc-attempted-username">${auth.attemptedUsername}</label>
                    <a id="reset-login" href="${url.loginRestartFlowUrl}" aria-label="${msg("restartLoginTooltip")}">${msg("restartLoginTooltip")}</a>
                </div>
            </#if>
            <#if displayRequiredFields>
                <p class="ns-required"><span class="required">*</span> ${msg("requiredFields")}</p>
            </#if>
            </header>

            <div id="kc-content">
                <div id="kc-content-wrapper">
                    <#-- App-initiated actions should not see warning messages about the need to complete the action during login -->
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="ns-alert ns-alert-${message.type}" role="alert">
                            <span class="ns-alert-icon" aria-hidden="true"></span>
                            <span class="ns-alert-text">${kcSanitize(message.summary)?no_esc}</span>
                        </div>
                    </#if>

                    <#nested "form">

                    <#if auth?has_content && auth.showTryAnotherWayLink()>
                        <form id="kc-select-try-another-way-form" action="${url.loginAction}" method="post">
                            <div class="ns-group">
                                <input type="hidden" name="tryAnotherWay" value="on"/>
                                <a href="#" id="try-another-way" class="ns-link"
                                   onclick="document.forms['kc-select-try-another-way-form'].requestSubmit();return false;">${msg("doTryAnotherWay")}</a>
                            </div>
                        </form>
                    </#if>

                    <#nested "socialProviders">

                    <#if displayInfo>
                        <div id="kc-info" class="ns-info">
                            <div id="kc-info-wrapper">
                                <#nested "info">
                            </div>
                        </div>
                    </#if>
                </div>
            </div>

            <p class="ns-secure">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                Encrypted connection &middot; Authorized SOC personnel only
            </p>
            <@loginFooter.content/>
        </div>
        <p class="ns-legal">&copy; 2026 BlueSec &middot; ${properties.productName!'Nightshift'}</p>
    </main>
</div>

<script>
  // Sign-in buttons show progress once their form is sent (the forms already block double submits)
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      form.querySelectorAll('.ns-btn-primary').forEach(function (b) { b.classList.add('is-busy'); });
    });
  });
  // Caps Lock warning on password fields
  document.querySelectorAll('input[type="password"]').forEach(function (input) {
    var hint = document.createElement('div');
    hint.className = 'ns-caps'; hint.hidden = true; hint.setAttribute('aria-live', 'polite');
    hint.textContent = 'Caps Lock is on';
    (input.closest('.ns-input-group') || input).insertAdjacentElement('afterend', hint);
    var check = function (e) { if (e.getModifierState) hint.hidden = !e.getModifierState('CapsLock'); };
    input.addEventListener('keydown', check);
    input.addEventListener('keyup', check);
    input.addEventListener('blur', function () { hint.hidden = true; });
  });
</script>
</body>
</html>
</#macro>
