/// <reference path="../pb_data/types.d.ts" />

// Point the password-reset email at HoneyMoney, not at PocketBase.
//
// Out of the box, the link PocketBase emails for a forgotten password goes to
// its OWN page — {APP_URL}/_/#/auth/confirm-password-reset/{TOKEN} — the
// admin UI's auth screen, on the PocketBase hostname. Two things are wrong
// with that for a household. It is not HoneyMoney: no logo, no language, a
// different domain, exactly the shape of a phishing page. And on DOM Cloud
// /_/ is deliberately guarded (pb.deploy.yml), so the link may not open at
// all.
//
// The app now has /reset-password, which consumes the same token through
// api/auth/reset. This migration rewrites the template body so the button in
// the email lands there, and sets meta.appURL so {APP_URL} is honeymoney.app
// rather than whatever hostname the request happened to arrive on.
//
// ⚠️ THE EMAIL STILL NEEDS A WAY OUT. PocketBase sends through the SMTP
// settings under Settings → Mail settings (Brevo relay, per
// docs/EMAIL_SETUP.md Part 3). Nothing here touches those — credentials do
// not belong in a migration — and without them PocketBase logs the mail and
// sends nothing. The migration is safe to run either way.
//
// Applied at PocketBase start, like every migration here: on the laptop drop
// the restart marker (deploy/start-honeymoney.ps1 explains); on DOM Cloud
// `touch ~/public_html/tmp/restart.txt`.

const APP_URL = "https://honeymoney.app";

const BODY = `<p>Hello,</p>
<p>Tap the button below to choose a new password for your HoneyMoney account.</p>
<p>
  <a class="btn" href="{APP_URL}/reset-password?token={TOKEN}" target="_blank" rel="noopener">Reset password</a>
</p>
<p><i>If you didn't ask for this, you can ignore this email — your password stays as it is.</i></p>
<p>The link works for about 30 minutes.</p>
<p>
  Thanks,<br/>
  HoneyMoney
</p>`;

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("app_users");
    users.resetPasswordTemplate.subject = "Reset your HoneyMoney password";
    users.resetPasswordTemplate.body = BODY;
    app.save(users);

    const settings = app.settings();
    if (!settings.meta.appURL) settings.meta.appURL = APP_URL;
    if (!settings.meta.appName) settings.meta.appName = "HoneyMoney";
    app.save(settings);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("app_users");
    users.resetPasswordTemplate.subject = "Reset your {APP_NAME} password";
    users.resetPasswordTemplate.body = `<p>Hello,</p>
<p>Click on the button below to reset your password.</p>
<p>
  <a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a>
</p>
<p><i>If you didn't ask to reset your password, you can ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`;
    app.save(users);
  },
);
