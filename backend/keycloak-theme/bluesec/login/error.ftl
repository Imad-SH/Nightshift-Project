<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        ${kcSanitize(msg("errorTitle"))?no_esc}
    <#elseif section = "form">
        <div id="kc-error-message">
            <div class="ns-alert ns-alert-error" role="alert">
                <span class="ns-alert-icon" aria-hidden="true"></span>
                <span class="ns-alert-text">${kcSanitize(message.summary)?no_esc}</span>
            </div>
            <div class="ns-buttons">
                <a class="ns-btn ns-btn-primary ns-btn-block" href="${url.loginRestartFlowUrl}">
                    <span class="ns-btn-label">${msg("doLogIn")}</span>
                    <svg class="ns-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
                </a>
                <#if !skipLink?? && client?? && client.baseUrl?has_content>
                    <a id="backToApplication" class="ns-link ns-center" href="${client.baseUrl}">${msg("backToApplication")}</a>
                </#if>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>
