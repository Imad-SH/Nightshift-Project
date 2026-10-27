<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        ${msg("loginProfileTitle")}
    <#elseif section = "form">
        <p class="ns-lede">Complete your profile to continue.</p>
        <form id="kc-update-profile-form" class="ns-form" action="${url.loginAction}" method="post">
            <div class="ns-group">
                <label for="email" class="ns-label">${msg("email")}</label>
                <input type="email" id="email" name="email" class="ns-input" value="${(user.email!'')}" required autocomplete="email" />
            </div>
            <div class="ns-group">
                <label for="firstName" class="ns-label">${msg("firstName")}</label>
                <input type="text" id="firstName" name="firstName" class="ns-input" value="${(user.firstName!'')}" required autocomplete="given-name" />
            </div>
            <div class="ns-group">
                <label for="lastName" class="ns-label">${msg("lastName")}</label>
                <input type="text" id="lastName" name="lastName" class="ns-input" value="${(user.lastName!'')}" required autocomplete="family-name" />
            </div>
            <div class="ns-buttons">
                <button type="submit" class="ns-btn ns-btn-primary ns-btn-block">
                    <span class="ns-btn-label">${msg("doSubmit")}</span>
                    <span class="ns-btn-busy" aria-hidden="true">Saving&hellip;</span>
                    <svg class="ns-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
                </button>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
