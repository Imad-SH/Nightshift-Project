<#import "template.ftl" as layout>
<#import "passkeys.ftl" as passkeys>
<@layout.registrationLayout displayMessage=true displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        <span id="ns-greeting">Welcome back</span>
    <#elseif section = "form">
        <p class="ns-lede">Sign in to your ${properties.productName!'Nightshift'} workspace.</p>
        <div id="kc-form">
          <div id="kc-form-wrapper">
            <#if realm.password>
                <form id="kc-form-login" class="ns-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                    <#if !usernameHidden??>
                        <div class="ns-group">
                            <label for="username" class="ns-label"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></label>
                            <input tabindex="1" id="username" class="ns-input" name="username" type="text" required
                                   autofocus autocomplete="off" spellcheck="false" dir="ltr"
                                   aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                            />
                        </div>
                    </#if>

                    <div class="ns-group">
                        <label for="password" class="ns-label">${msg("password")}</label>
                        <div class="ns-input-group" dir="ltr">
                            <input tabindex="2" id="password" class="ns-input" name="password" type="password" required autocomplete="off"
                                   aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                            />
                            <button class="ns-eye" type="button" aria-label="${msg("showPassword")}"
                                    aria-controls="password" data-password-toggle tabindex="3"
                                    data-icon-show="ns-icon-eye" data-icon-hide="ns-icon-eye-off"
                                    data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                                <i class="ns-icon-eye" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>

                    <#if (realm.rememberMe && !usernameHidden??) || realm.resetPasswordAllowed>
                        <div class="ns-row">
                            <#if realm.rememberMe && !usernameHidden??>
                                <label class="ns-check">
                                    <input tabindex="4" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>> ${msg("rememberMe")}
                                </label>
                            </#if>
                            <#if realm.resetPasswordAllowed>
                                <a tabindex="5" class="ns-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                            </#if>
                        </div>
                    </#if>

                    <div id="kc-form-buttons" class="ns-buttons">
                        <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                        <button tabindex="6" class="ns-btn ns-btn-primary ns-btn-block" name="login" id="kc-login" type="submit">
                            <span class="ns-btn-label">${msg("doLogIn")}</span>
                            <span class="ns-btn-busy" aria-hidden="true">Signing in&hellip;</span>
                            <svg class="ns-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
                        </button>
                    </div>
                </form>
            </#if>
          </div>
        </div>
        <@passkeys.conditionalUIData />
        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>
        <script>
            // Greeting for the time of day, as in the application header
            (function () {
                var h = new Date().getHours();
                var text = h < 5 ? 'Welcome to the night shift' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Welcome to the night shift';
                var el = document.getElementById('ns-greeting');
                if (el) el.textContent = text;
            })();
            // Fields start empty: browsers must not leave a previous user's credentials on shared SOC
            // screens. Only what the browser pre-filled is cleared, never what someone already typed.
            (function () {
                var typed = false;
                var mark = function () { typed = true; };
                ['username', 'password'].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (!el) return;
                    el.addEventListener('keydown', mark);
                    el.addEventListener('paste', mark);
                });
                window.addEventListener('load', function () {
                    setTimeout(function () {
                        if (typed) return;
                        var u = document.getElementById('username');
                        var p = document.getElementById('password');
                        if (u) u.value = '';
                        if (p) p.value = '';
                    }, 50);
                });
            })();
        </script>
    <#elseif section = "info" >
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration-container">
                <div id="kc-registration">
                    <span>${msg("noAccount")} <a tabindex="7" class="ns-link" href="${url.registrationUrl}">${msg("doRegister")}</a></span>
                </div>
            </div>
        </#if>
    <#elseif section = "socialProviders" >
        <#if realm.password && social?? && social.providers?has_content>
            <div id="kc-social-providers" class="ns-social">
                <p class="ns-divider"><span>${msg("identity-provider-login-label")}</span></p>
                <ul>
                    <#list social.providers as p>
                        <li>
                            <a data-once-link data-disabled-class="is-disabled" id="social-${p.alias}" class="ns-btn ns-btn-secondary ns-btn-block" type="button" href="${p.loginUrl}">
                                <span>${p.displayName!}</span>
                            </a>
                        </li>
                    </#list>
                </ul>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
